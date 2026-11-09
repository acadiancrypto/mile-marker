import { test, eq } from "./harness.js";
import { fx } from "./fixtures.js";
import { visible, yearTotal, monthTotals, categoryTotals, missingReceipts } from "../js/totals.js";

test("visible drops tombstones", () => eq(visible(fx).map(r => r.id), ["jan", "nov1", "nov2", "old"]));

test("yearTotal sums live records of that year", () => {
  eq(yearTotal(fx, 2026), 2000 + 4875 + 1250);
  eq(yearTotal(fx, 2025), 9999);
});

test("monthTotals puts November at index 10", () => {
  const m = monthTotals(fx, 2026);
  eq(m.length, 12);
  eq(m[0], 2000);
  eq(m[10], 4875 + 1250);
  eq(m[11], 0);
});

test("categoryTotals sorts largest first and filters by month", () => {
  eq(categoryTotals(fx, 2026, 11), [["Gas", 4875], ["Food", 1250]]);
  eq(categoryTotals(fx, 2026, null), [["Gas", 6875], ["Food", 1250]]);
});

test("missingReceipts counts live records with no receipt", () => {
  eq(missingReceipts(fx, 2026), 1);
});
