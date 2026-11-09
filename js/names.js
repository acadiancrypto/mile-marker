import { plainAmount } from "./money.js";

const MAX_NAME = 120;

/** Make text safe for a Windows/Drive file name: no \ / : * ? " < > |, control chars, emoji or apostrophes. */
export function safeFilePart(s) {
  return String(s ?? "")
    .replace(/['’]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[️‍]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

/** "2026-11-08 Loves Travel Stop 48.75.jpg"; adds a short id suffix when the name is already taken. */
export function receiptName(date, vendor, cents, ext, taken, id) {
  const tail = " " + plainAmount(cents);
  const dot = "." + ext;
  let v = safeFilePart(vendor) || "receipt";
  const room = MAX_NAME - date.length - 1 - tail.length - dot.length - 7; // leave room for a suffix
  if (v.length > room) v = v.slice(0, room).trim();
  const base = date + " " + v + tail;
  if (!taken || !taken.has(base + dot)) return base + dot;
  return base + " " + String(id || "").replace(/-/g, "").slice(0, 6) + dot;
}
