// Money is always whole cents.

/** "$1,234.5" -> 123450. Returns null for empty, negative, or >2-decimal input. */
export function parseCents(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(t) || !/\d/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
}

/** 123450 -> "$1,234.50", -500 -> "-$5.00" */
export function formatCents(c) {
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return (c < 0 ? "-" : "") + "$" + dollars + "." + String(abs % 100).padStart(2, "0");
}

/** 4875 -> "48.75" (plain, for CSV and file names) */
export function plainAmount(c) {
  const abs = Math.abs(c);
  return (c < 0 ? "-" : "") + Math.floor(abs / 100) + "." + String(abs % 100).padStart(2, "0");
}
