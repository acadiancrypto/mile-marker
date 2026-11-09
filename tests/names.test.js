import { test, eq, ok } from "./harness.js";
import { receiptName, safeFilePart } from "../js/names.js";

test("receiptName builds date vendor amount", () => {
  eq(receiptName("2026-11-08", "Love's Travel Stop", 4875, "jpg"), "2026-11-08 Loves Travel Stop 48.75.jpg");
});

test("receiptName strips characters Windows and Drive reject", () => {
  eq(receiptName("2026-11-08", 'A/B: "Shop"*?<>|', 100, "pdf"), "2026-11-08 AB Shop 1.00.pdf");
});

test("receiptName drops emoji", () => {
  eq(receiptName("2026-11-08", "🚚 Fuel", 100, "jpg"), "2026-11-08 Fuel 1.00.jpg");
});

test("receiptName falls back to 'receipt' for an empty vendor", () => {
  eq(receiptName("2026-11-08", "***", 250, "jpg"), "2026-11-08 receipt 2.50.jpg");
});

test("receiptName stays at most 120 characters", () => {
  const n = receiptName("2026-11-08", "x".repeat(200), 4875, "jpg");
  ok(n.length <= 120, "length " + n.length);
  ok(n.endsWith(" 48.75.jpg"), n);
});

test("receiptName adds an id suffix when the name is taken", () => {
  const taken = new Set(["2026-11-08 Loves Travel Stop 48.75.jpg"]);
  eq(receiptName("2026-11-08", "Love's Travel Stop", 4875, "jpg", taken, "abcdef12-3456"), "2026-11-08 Loves Travel Stop 48.75 abcdef.jpg");
});

test("safeFilePart collapses whitespace and trims", () => {
  eq(safeFilePart("  Motel   6 \t Lafayette "), "Motel 6 Lafayette");
});
