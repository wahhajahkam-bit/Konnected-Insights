import express, { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireEditorialStaff } from "../middlewares/requireEditorialStaff";
import {
  EditorialImageNotFoundError,
  EditorialImageStorageService,
  InvalidEditorialImageError,
} from "../lib/editorialImageStorage";

const router: IRouter = Router();
const storage = new EditorialImageStorageService();
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

router.post(
  "/storage/uploads",
  requireEditorialStaff,
  express.raw({ type: [...imageTypes], limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const contentType = z.enum(imageTypes).safeParse(req.headers["content-type"]?.split(";")[0]);
    const originalName = z.string().trim().min(1).max(255).safeParse(req.headers["x-file-name"]);
    if (!contentType.success || !originalName.success || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        error: {
          code: "INVALID_IMAGE",
          message: "Use a JPEG, PNG, WebP, or GIF image up to 10 MB",
        },
      });
    }
    try {
      const fileId = await storage.uploadEditorialImage(
        req.body,
        contentType.data,
        decodeURIComponent(originalName.data),
        "public",
        String(res.locals.staffUserId),
      );
      return res.json({
        data: {
          objectPath: `/drive/${fileId}`,
          url: `/api/storage/drive/${fileId}`,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, "Failed to upload editorial image");
      const invalid = error instanceof InvalidEditorialImageError;
      return res.status(invalid ? 400 : 503).json({
        error: {
          code: invalid ? "INVALID_IMAGE" : "STORAGE_UNAVAILABLE",
          message: invalid
            ? "The uploaded file is not a valid supported image"
            : "Image storage is unavailable",
        },
      });
    }
  },
);

router.post(
  "/storage/evidence/uploads",
  requireEditorialStaff,
  express.raw({ type: [...imageTypes], limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const contentType = z.enum(imageTypes).safeParse(req.headers["content-type"]?.split(";")[0]);
    const originalName = z.string().trim().min(1).max(255).safeParse(req.headers["x-file-name"]);
    if (!contentType.success || !originalName.success || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        error: { code: "INVALID_IMAGE", message: "Use a JPEG, PNG, WebP, or GIF image up to 10 MB" },
      });
    }
    try {
      const fileId = await storage.uploadEditorialImage(
        req.body,
        contentType.data,
        decodeURIComponent(originalName.data),
        "evidence",
        String(res.locals.staffUserId),
      );
      return res.json({ data: { url: `/api/storage/evidence/drive/${fileId}` } });
    } catch (error) {
      req.log.error({ err: error }, "Failed to upload editorial evidence image");
      return res.status(error instanceof InvalidEditorialImageError ? 400 : 503).json({
        error: {
          code: error instanceof InvalidEditorialImageError ? "INVALID_IMAGE" : "STORAGE_UNAVAILABLE",
          message: error instanceof InvalidEditorialImageError ? "The uploaded screenshot is not a valid image" : "Image storage is unavailable",
        },
      });
    }
  },
);

router.get("/storage/evidence/drive/:fileId", requireEditorialStaff, async (req, res) => {
  try {
    const result = await storage.downloadEditorialImage(String(req.params.fileId), "evidence");
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(result.bytes);
  } catch {
    return res.status(404).json({ error: { code: "OBJECT_NOT_FOUND", message: "Screenshot not found" } });
  }
});

router.get("/storage/generated/:fileId", async (req, res) => {
  try {
    const result = await storage.downloadEditorialImage(String(req.params.fileId), "generated");
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.send(result.bytes);
  } catch {
    return res.status(404).json({ error: { code: "OBJECT_NOT_FOUND", message: "Generated image not found" } });
  }
});

router.get("/storage/drive/:fileId", async (req, res) => {
  try {
    const result = await storage.downloadEditorialImage(req.params.fileId);
    if (result.purpose === "evidence") throw new EditorialImageNotFoundError();
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.setHeader("Content-Length", String(result.size));
    return res.send(result.bytes);
  } catch (error) {
    return res.status(error instanceof EditorialImageNotFoundError ? 404 : 500).json({
      error: { code: "OBJECT_NOT_FOUND", message: "Image not found" },
    });
  }
});

export default router;