import { test, eq } from "./harness.js";
import { rec } from "./fixtures.js";
import { pickWinner, mergeSettings } from "../js/merge.js";

test("a record new to this device comes from remote", () => eq(pickWinner(undefined, rec({ id: "x" })), "remote"));

test("a newer remote record wins", () => eq(pickWinner(rec({ id: "x", updatedAt: 5 }), rec({ id: "x", updatedAt: 9 })), "remote"));

test("an older remote record loses", () => eq(pickWinner(rec({ id: "x", updatedAt: 9 }), rec({ id: "x", updatedAt: 5 })), "local"));

test("a tie goes to the higher deviceId", () => {
  eq(pickWinner(rec({ id: "x", updatedAt: 5, deviceId: "a" }), rec({ id: "x", updatedAt: 5, deviceId: "b" })), "remote");
  eq(pickWinner(rec({ id: "x", updatedAt: 5, deviceId: "b" }), rec({ id: "x", updatedAt: 5, deviceId: "a" })), "local");
});

test("a newer remote tombstone wins", () => eq(pickWinner(rec({ id: "x", updatedAt: 5 }), rec({ id: "x", updatedAt: 6, deleted: true })), "remote"));

test("both devices settle on the same record after a tie", () => {
  const onA = rec({ id: "x", updatedAt: 7, deviceId: "dev-a", vendor: "A edit" });
  const onB = rec({ id: "x", updatedAt: 7, deviceId: "dev-b", vendor: "B edit" });
  const finalA = pickWinner(onA, onB) === "remote" ? onB : onA;
  const finalB = pickWinner(onB, onA) === "remote" ? onA : onB;
  eq(finalA.vendor, finalB.vendor);
  eq(finalA.vendor, "B edit");
});

test("mergeSettings keeps the newer settings", () => {
  const l = { categories: ["Laundry"], updatedAt: 5 };
  const r = { categories: ["Car wash"], updatedAt: 9 };
  eq(mergeSettings(l, r), r);
  eq(mergeSettings(r, l), r);
  eq(mergeSettings(l, null), l);
});
