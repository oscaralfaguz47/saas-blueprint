/**
 * Client-side image compression for profile photos.
 * Resizes to max 512px and compresses as JPEG so uploads and display stay lightweight.
 * Use in browser only (Canvas API).
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB input limit
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

export type CompressResult = {
  blob: Blob;
  contentType: "image/jpeg";
  extension: "jpeg";
};

export type CompressError =
  | { code: "FILE_TOO_LARGE"; maxMb: number }
  | { code: "NOT_AN_IMAGE" }
  | { code: "FILE_EMPTY" }
  | { code: "PROCESS_FAILED"; message: string };

/**
 * Validates the file and compresses it for profile photo upload.
 * Accepts any image format; outputs JPEG for small storage and display.
 */
export function compressImageForProfile(file: File): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    // Only enforce size when known; some systems (e.g. Windows OneDrive placeholders) report size 0
    // until the file is read — we still try to load the image and will reject in onerror if invalid.
    if (file.size > 0 && file.size > MAX_FILE_BYTES) {
      reject({ code: "FILE_TOO_LARGE", maxMb: 10 } as CompressError);
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject({ code: "NOT_AN_IMAGE" } as CompressError);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject({ code: "PROCESS_FAILED", message: "Could not load image." } as CompressError);
    };

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const { width, height } = img;
        if (width === 0 || height === 0) {
          reject({ code: "PROCESS_FAILED", message: "Image has no dimensions." } as CompressError);
          return;
        }
        const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject({ code: "PROCESS_FAILED", message: "Could not create canvas." } as CompressError);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size === 0) {
              reject({ code: "PROCESS_FAILED", message: "Compression produced empty file." } as CompressError);
              return;
            }
            resolve({
              blob,
              contentType: "image/jpeg",
              extension: "jpeg",
            });
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch (err) {
        reject({
          code: "PROCESS_FAILED",
          message: err instanceof Error ? err.message : "Could not process image.",
        } as CompressError);
      }
    };

    img.src = url;
  });
}

export function getCompressErrorMessage(err: CompressError): string {
  switch (err.code) {
    case "FILE_EMPTY":
      return "File is empty.";
    case "FILE_TOO_LARGE":
      return `Image must be under ${err.maxMb}MB.`;
    case "NOT_AN_IMAGE":
      return "Please select an image file (e.g. JPEG, PNG, WebP, GIF).";
    case "PROCESS_FAILED":
      return err.message;
    default:
      return "Could not process image. Try a JPEG, PNG, or WebP under 10MB.";
  }
}
