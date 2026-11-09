import { plainAmount } from "./money.js";
import { visible } from "./totals.js";

const HEADER = ["Date", "Vendor", "Category", "Amount", "Paid with", "Items", "Business purpose", "Receipt file", "No-receipt reason"];

const cell = v => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** The yearly CSV: header, rows by date, blank line, total. CRLF line endings. */
export function buildYearCsv(records, year) {
  const rows = visible(records)
    .filter(r => r.year === year)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const out = [HEADER.join(",")];
  for (const r of rows) {
    out.push([r.date, r.vendor, r.category, plainAmount(r.amountCents), r.payment, r.items, r.purpose,
      r.receipt && r.receipt.name ? r.receipt.name : "", r.noReceiptReason].map(cell).join(","));
  }
  out.push("");
  out.push(",,TOTAL," + plainAmount(rows.reduce((a, r) => a + r.amountCents, 0)));
  return out.join("\r\n");
}
