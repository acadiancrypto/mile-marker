// Totals over expense records (pure). Tombstones never count.

export const visible = records => records.filter(r => !r.deleted);

const inYear = (records, year) => visible(records).filter(r => r.year === year);

export const yearTotal = (records, year) => inYear(records, year).reduce((a, r) => a + r.amountCents, 0);

export function monthTotals(records, year) {
  const m = Array(12).fill(0);
  for (const r of inYear(records, year)) m[r.month - 1] += r.amountCents;
  return m;
}

export function categoryTotals(records, year, month) {
  const by = {};
  for (const r of inYear(records, year)) {
    if (month != null && r.month !== month) continue;
    by[r.category] = (by[r.category] || 0) + r.amountCents;
  }
  return Object.entries(by).sort((a, b) => b[1] - a[1]);
}

export const missingReceipts = (records, year) => inYear(records, year).filter(r => !r.receipt).length;
