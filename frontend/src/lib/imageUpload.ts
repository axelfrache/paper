const MAX_IMAGE_DIMENSION = 2400;
const OPTIMIZE_FROM_BYTES = 1_000_000;

const rasterTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= OPTIMIZE_FROM_BYTES || !rasterTypes.has(file.type)) {
    return file;
  }

  const bitmap = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    closeImage(bitmap);
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  closeImage(bitmap);

  const blob = await canvasToBlob(canvas, file.type, 0.82);
  if (!blob || blob.size >= file.size) {
    return file;
  }
  return new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified });
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function closeImage(image: ImageBitmap | HTMLImageElement) {
  if ("close" in image) {
    image.close();
  }
}
