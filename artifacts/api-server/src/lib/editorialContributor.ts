export function selectLinkedInProfileImage({
  sourceImage,
  currentImage,
}: {
  sourceImage?: string;
  currentImage?: string;
}) {
  if (sourceImage) {
    try {
      const imageUrl = new URL(sourceImage);
      const isProfilePhoto =
        /(^|\.)licdn\.com$/i.test(imageUrl.hostname) &&
        /profile-displayphoto/i.test(imageUrl.pathname);
      if (isProfilePhoto) return { image: sourceImage, evidenced: true };
    } catch {
      // An invalid source image is handled the same as an absent one.
    }
  }

  return {
    image: typeof currentImage === "string" ? currentImage : undefined,
    evidenced: false,
  };
}