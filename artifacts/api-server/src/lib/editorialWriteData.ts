export class InvalidGeneratedImageReferenceError extends Error {
  constructor() {
    super("Generated artwork is unavailable or invalid");
    this.name = "InvalidGeneratedImageReferenceError";
  }
}

export const normalizeEditorialWriteData = async (
  collection: string,
  value: Record<string, unknown>,
  verifyGeneratedImage?: (fileId: string) => Promise<void>,
) => {
  const data = { ...value };
  const coverField = collection === "future-work" ? "img"
    : collection === "talks" ? "thumbnail"
    : collection === "contributors" ? "coverImage" : "image";
  const firstImage = collection === "events"
    ? (Array.isArray(data.images) ? data.images[0] : undefined)
    : data[coverField];
  const generatedImage = typeof firstImage === "string"
    ? firstImage.match(/^\/api\/storage\/generated\/([a-zA-Z0-9_-]{10,200})$/)
    : null;
  if (generatedImage) {
    if (!verifyGeneratedImage) throw new InvalidGeneratedImageReferenceError();
    try {
      await verifyGeneratedImage(generatedImage[1]);
    } catch {
      throw new InvalidGeneratedImageReferenceError();
    }
    data.imageProvenance = "ai-generated-representative-artwork";
  } else {
    delete data.imageProvenance;
  }
  if (collection !== "events") return data;
  if (typeof data.startAt === "string" && data.startAt && !data.endAt) {
    data.completionMode = "manual";
  } else {
    delete data.completionMode;
  }
  return data;
};