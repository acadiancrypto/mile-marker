import { test, eq, ok } from "./harness.js";
import { fx } from "./fixtures.js";
import { buildYearCsv } from "../js/csv.js";

const lines = () => buildYearCsv(fx, 2026).split("\r\n");

test("csv starts with the header", () => {
  eq(lines()[0], "Date,Vendor,Category,Amount,Paid with,Items,Business purpose,Receipt file,No-receipt reason");
});

test("csv quotes commas, quotes and newlines", () => {
  const csv = buildYearCsv(fx, 2026);
  ok(csv.includes('"Smith, ""Big"" Co"'), "vendor quoted");
  ok(csv.includes('"two\nlines"'), "newline quoted");
});

test("csv rows are date-ascending and skip tombstones and other years", () => {
  const csv = buildYearCsv(fx, 2026);
  ok(!csv.includes("2025-12-30"), "no 2025 row");
  ok(!csv.includes("500.00"), "no tombstone");
  ok(csv.indexOf("2026-01-15") < csv.indexOf("2026-11-02"), "sorted");
});

test("csv lists the receipt file name", () => {
  ok(lines()[1].includes(",x.jpg,"), lines()[1]);
});

test("csv ends with a blank line then the total", () => {
  const l = lines();
  eq(l[l.length - 2], "");
  eq(l[l.length - 1], ",,TOTAL,81.25");
});
