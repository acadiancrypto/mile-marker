import { test, eq } from "./harness.js";
import { BUILT_IN, allCategories, addCategory } from "../js/categories.js";

test("built-in categories match the spec order", () => {
  eq(BUILT_IN, ["Gas", "Food", "Rent", "Lodging", "Hygiene", "Tolls & parking", "Vehicle repair & maintenance", "Airfare & transit", "Supplies & tools", "Phone & internet", "Other"]);
});

test("allCategories appends custom ones without case-insensitive repeats", () => {
  const all = allCategories(["gas", "Laundry", "laundry"]);
  eq(all[all.length - 1], "Laundry");
  eq(all.filter(c => c.toLowerCase() === "gas").length, 1);
  eq(all.length, BUILT_IN.length + 1);
});

test("addCategory trims and collapses spaces", () => eq(addCategory([], "  Car  wash "), { list: ["Car wash"], name: "Car wash" }));

test("addCategory reuses an existing name regardless of case", () => {
  eq(addCategory(["Car wash"], "car WASH"), { list: ["Car wash"], name: "Car wash" });
  eq(addCategory([], "GAS"), { list: [], name: "Gas" });
});

test("addCategory rejects an empty name", () => {
  let threw = false;
  try { addCategory([], "   "); } catch { threw = true; }
  eq(threw, true);
});
