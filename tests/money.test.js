import { test, eq } from "./harness.js";
import { parseCents, formatCents } from "../js/money.js";

test("parseCents accepts plain and formatted amounts", () => {
  eq(parseCents("48.75"), 4875);
  eq(parseCents("$1,234.5"), 123450);
  eq(parseCents("12."), 1200);
  eq(parseCents(".99"), 99);
  eq(parseCents("7"), 700);
  eq(parseCents(" 3.10 "), 310);
});

test("parseCents rejects bad amounts", () => {
  for (const s of ["0.005", "-5", "abc", "", ".", "1.2.3", "$"]) eq(parseCents(s), null, JSON.stringify(s));
});

test("formatCents formats dollars", () => {
  eq(formatCents(123450), "$1,234.50");
  eq(formatCents(-500), "-$5.00");
  eq(formatCents(0), "$0.00");
  eq(formatCents(7), "$0.07");
});
