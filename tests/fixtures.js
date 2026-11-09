// Shared test records.
export function rec(over) {
  return {
    id: over.id || "id-" + Math.random().toString(36).slice(2),
    date: "2026-11-08", year: 2026, month: 11,
    vendor: "Vendor", amountCents: 1000, category: "Gas", payment: "Cash",
    items: "", purpose: "", receipt: null, noReceipt: false, noReceiptReason: "",
    deleted: false, createdAt: 1, updatedAt: 1, deviceId: "a",
    ...over,
  };
}

export const fx = [
  rec({ id: "jan", date: "2026-01-15", month: 1, amountCents: 2000, category: "Gas", receipt: { driveId: "d1", name: "x.jpg", type: "image/jpeg" } }),
  rec({ id: "nov1", date: "2026-11-02", amountCents: 4875, category: "Gas", receipt: { driveId: null, name: null, type: "image/jpeg" } }),
  rec({ id: "nov2", date: "2026-11-05", amountCents: 1250, category: "Food", vendor: 'Smith, "Big" Co', items: "two\nlines" }),
  rec({ id: "old", date: "2025-12-30", year: 2025, month: 12, amountCents: 9999 }),
  rec({ id: "gone", date: "2026-11-06", amountCents: 50000, deleted: true }),
];
