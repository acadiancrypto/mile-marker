// Shrink receipt photos to a JPEG with a max side of 2000px at quality 0.85.
const MAX_SIDE = 2000;
const QUALITY = 0.85;

export async function shrinkImage(file) {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const out = await new Promise(r => c.toBlob(r, "image/jpeg", QUALITY));
    return out && (out.size < file.size || s < 1) ? out : file;
  } catch {
    return file;
  }
}
