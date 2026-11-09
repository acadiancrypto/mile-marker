import { test, eq, ok } from "./harness.js";
import { shrinkImage } from "../js/image.js";

function pngBlob(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i % 360},70%,50%)`; g.fillRect(Math.random() * w, Math.random() * h, 120, 120); }
  return new Promise(r => c.toBlob(r, "image/png"));
}

test("shrinkImage turns a big photo into a JPEG at most 2000px", async () => {
  const out = await shrinkImage(await pngBlob(4000, 3000));
  eq(out.type, "image/jpeg");
  const bmp = await createImageBitmap(out);
  eq(Math.max(bmp.width, bmp.height), 2000);
  eq(bmp.width, 2000);
  eq(bmp.height, 1500);
});

test("shrinkImage returns non-images unchanged", async () => {
  const b = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  ok((await shrinkImage(b)) === b);
  const t = new Blob(["hi"], { type: "text/plain" });
  ok((await shrinkImage(t)) === t);
});

test("shrinkImage returns an undecodable image unchanged", async () => {
  const b = new Blob(["not really an image"], { type: "image/heic" });
  ok((await shrinkImage(b)) === b);
});
