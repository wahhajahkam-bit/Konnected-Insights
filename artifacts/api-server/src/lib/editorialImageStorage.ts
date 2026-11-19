import {
  db,
  editorialImageAssetsTable,
  type EditorialImagePurpose,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DriveObjectNotFoundError,
  GoogleDriveStorageService,
  InvalidDriveUploadError,
} from "./googleDriveStorage";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class EditorialImageNotFoundError extends Error {
  constructor() {
    super("Editorial image not found");
    this.name = "EditorialImageNotFoundError";
  }
}

export class InvalidEditorialImageError extends Error {
  constructor() {
    super("Invalid editorial image");
    this.name = "InvalidEditorialImageError";
  }
}

/**
 * New image writes go to PostgreSQL. Drive remains a read-only legacy backend
 * so already-published image URLs continue to resolve without migration.
 */
export class EditorialImageStorageService {
  private readonly legacyDrive = new GoogleDriveStorageService();

  async uploadEditorialImage(
    bytes: Buffer,
    contentType: string,
    originalName: string,
    purpose: EditorialImagePurpose,
    uploadedByUserId: string,
  ) {
    try {
      this.legacyDrive.validateImage(bytes, contentType);
    } catch (error) {
      if (error instanceof InvalidDriveUploadError) {
        throw new InvalidEditorialImageError();
      }
      throw error;
    }

    const [asset] = await db
      .insert(editorialImageAssetsTable)
      .values({
        purpose,
        contentType,
        originalName,
        size: bytes.length,
        bytes,
        uploadedByUserId,
      })
      .returning({ id: editorialImageAssetsTable.id });

    if (!asset) throw new Error("PostgreSQL did not return an image ID");
    return asset.id;
  }

  async verifyEditorialImagePurpose(
    fileId: string,
    purpose: EditorialImagePurpose,
  ) {
    if (uuidPattern.test(fileId)) {
      const [asset] = await db
        .select({ purpose: editorialImageAssetsTable.purpose })
        .from(editorialImageAssetsTable)
        .where(eq(editorialImageAssetsTable.id, fileId))
        .limit(1);
      if (asset) {
        if (asset.purpose !== purpose) throw new EditorialImageNotFoundError();
        return;
      }
    }

    try {
      await this.legacyDrive.verifyEditorialImagePurpose(fileId, purpose);
    } catch (error) {
      if (error instanceof DriveObjectNotFoundError) {
        throw new EditorialImageNotFoundError();
      }
      throw error;
    }
  }

  async downloadEditorialImage(
    fileId: string,
    expectedPurpose?: EditorialImagePurpose,
  ) {
    if (uuidPattern.test(fileId)) {
      const [asset] = await db
        .select()
        .from(editorialImageAssetsTable)
        .where(eq(editorialImageAssetsTable.id, fileId))
        .limit(1);
      if (asset) {
        if (expectedPurpose && asset.purpose !== expectedPurpose) {
          throw new EditorialImageNotFoundError();
        }
        return {
          bytes: asset.bytes,
          contentType: asset.contentType,
          size: asset.size,
          purpose: asset.purpose,
        };
      }
    }

    try {
      return await this.legacyDrive.downloadEditorialImage(fileId, expectedPurpose);
    } catch (error) {
      if (error instanceof DriveObjectNotFoundError) {
        throw new EditorialImageNotFoundError();
      }
      throw error;
    }
  }
}