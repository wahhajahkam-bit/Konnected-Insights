import { randomUUID } from "crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export class DriveObjectNotFoundError extends Error {}
export class InvalidDriveUploadError extends Error {}

const matchesImageSignature = (bytes: Buffer, contentType: string) => {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (contentType === "image/gif") {
    return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  }
  if (contentType === "image/webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
};

const drive = () => new ReplitConnectors();
export type EditorialImagePurpose = "public" | "evidence" | "generated";

export class GoogleDriveStorageService {
  async verifyEditorialImagePurpose(fileId: string, purpose: EditorialImagePurpose) {
    if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) throw new DriveObjectNotFoundError();
    const response = await drive().proxy(
      "google-drive",
      `/drive/v3/files/${encodeURIComponent(fileId)}?fields=trashed,appProperties`,
      { method: "GET" },
    );
    if (!response.ok) throw new DriveObjectNotFoundError();
    const metadata = await response.json() as {
      trashed?: boolean;
      appProperties?: Record<string, string>;
    };
    if (
      metadata.trashed ||
      metadata.appProperties?.konnectedEditorialImage !== "true" ||
      metadata.appProperties?.konnectedEditorialPurpose !== purpose
    ) {
      throw new DriveObjectNotFoundError();
    }
  }

  validateImage(bytes: Buffer, contentType: string) {
    if (
      !ALLOWED_IMAGE_TYPES.has(contentType) ||
      bytes.length === 0 ||
      bytes.length > MAX_IMAGE_BYTES ||
      !matchesImageSignature(bytes, contentType)
    ) {
      throw new InvalidDriveUploadError();
    }
  }

  async uploadEditorialImage(
    bytes: Buffer,
    contentType: string,
    originalName: string,
    purpose: EditorialImagePurpose = "public",
  ) {
    this.validateImage(bytes, contentType);
    const boundary = `editorial-${randomUUID()}`;
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const metadata = {
      name: `konnected-editorial-${randomUUID()}-${safeName || "image"}`,
      mimeType: contentType,
      appProperties: { konnectedEditorialImage: "true", konnectedEditorialPurpose: purpose },
    };
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    );
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const response = await drive().proxy(
      "google-drive",
      "/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType,size",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([prefix, bytes, suffix]),
      },
    );
    if (!response.ok) {
      throw new Error(`Google Drive upload failed (${response.status}): ${await response.text()}`);
    }
    const result = (await response.json()) as { id?: string };
    if (!result.id) throw new Error("Google Drive did not return a file ID");
    return result.id;
  }

  async downloadEditorialImage(fileId: string, expectedPurpose?: EditorialImagePurpose) {
    if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) throw new DriveObjectNotFoundError();
    const metadataResponse = await drive().proxy(
      "google-drive",
      `/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,mimeType,size,trashed,appProperties`,
      { method: "GET" },
    );
    if (!metadataResponse.ok) throw new DriveObjectNotFoundError();
    const metadata = (await metadataResponse.json()) as {
      mimeType?: string;
      size?: string;
      trashed?: boolean;
      appProperties?: Record<string, string>;
    };
    const size = Number(metadata.size);
    if (
      metadata.trashed ||
      metadata.appProperties?.konnectedEditorialImage !== "true" ||
      (expectedPurpose && metadata.appProperties?.konnectedEditorialPurpose !== expectedPurpose) ||
      !metadata.mimeType ||
      !ALLOWED_IMAGE_TYPES.has(metadata.mimeType) ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_IMAGE_BYTES
    ) {
      throw new DriveObjectNotFoundError();
    }
    const contentResponse = await drive().proxy(
      "google-drive",
      `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { method: "GET" },
    );
    if (!contentResponse.ok) throw new DriveObjectNotFoundError();
    return {
      bytes: Buffer.from(await contentResponse.arrayBuffer()),
      contentType: metadata.mimeType,
      size,
      purpose: metadata.appProperties?.konnectedEditorialPurpose as EditorialImagePurpose | undefined,
    };
  }
}