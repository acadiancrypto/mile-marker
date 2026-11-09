import { test, eq, ok } from "./harness.js";
import { openStore } from "../js/store.js";
import { createExpenses } from "../js/expenses.js";

async function setup() {
  const name = "mm-exp-" + Math.random().toString(36).slice(2);
  const store = await openStore(name);
  let saved = 0;
  const ex = createExpenses({ store, deviceId: "dev-a", onSaved: () => saved++ });
  return { store, ex, saved: () => saved, done: () => { store.close(); indexedDB.deleteDatabase(name); } };
}
const fields = { date: "2026-11-08", vendor: "Love's", amountCents: 4875, category: "Gas", payment: "Cash", items: "", purpose: "", noReceipt: false, noReceiptReason: "" };
const photo = () => new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });

test("expenses: saving with a receipt stores the record, blob and a queue entry", async () => {
  const { store, ex, saved, done } = await setup();
  const r = await ex.save(fields, { file: photo() });
  eq([r.year, r.month, r.deviceId, r.deleted], [2026, 11, "dev-a", false]);
  eq(r.receipt, { driveId: null, name: null, type: "application/pdf" });
  ok(await store.getBlob(r.id), "blob saved");
  eq(await store.queueGet(r.id), { id: r.id, needsRecord: true, needsReceiptUpload: true, receiptToTrash: [] });
  eq(saved(), 1);
  done();
});

test("expenses: replacing a synced receipt queues the old file for trash", async () => {
  const { store, ex, done } = await setup();
  const first = await ex.save(fields, { file: photo() });
  await store.put({ ...first, receipt: { driveId: "old-drive", name: "a.pdf", type: "application/pdf" } });
  await store.queueDelete(first.id);
  const existing = await store.get(first.id);
  const r = await ex.save({ ...fields, vendor: "New" }, { existing, file: photo() });
  ok(r.updatedAt > existing.updatedAt, "updatedAt moves forward");
  eq((await store.queueGet(r.id)).receiptToTrash, ["old-drive"]);
  eq(r.receipt.driveId, null);
  done();
});

test("expenses: removing a receipt clears it and the local blob", async () => {
  const { store, ex, done } = await setup();
  const first = await ex.save(fields, { file: photo() });
  await store.put({ ...first, receipt: { driveId: "d1", name: "a.pdf", type: "application/pdf" } });
  const r = await ex.save(fields, { existing: await store.get(first.id), removeReceipt: true });
  eq(r.receipt, null);
  eq(await store.getBlob(r.id), undefined);
  eq((await store.queueGet(r.id)).receiptToTrash, ["d1"]);
  done();
});

test("expenses: an edit without a new file keeps the receipt", async () => {
  const { store, ex, done } = await setup();
  const first = await ex.save(fields, { file: photo() });
  const r = await ex.save({ ...fields, amountCents: 100 }, { existing: first });
  eq(r.receipt, first.receipt);
  eq((await store.queueGet(r.id)).needsReceiptUpload, true);
  done();
});

test("expenses: deleting writes a tombstone and queues the receipt for trash", async () => {
  const { store, ex, done } = await setup();
  const first = await ex.save(fields, { file: photo() });
  await store.put({ ...first, receipt: { driveId: "d1", name: "a.pdf", type: "application/pdf" } });
  await store.queueDelete(first.id);
  await ex.remove(await store.get(first.id));
  const t = await store.get(first.id);
  eq(t.deleted, true);
  eq(await store.getBlob(first.id), undefined);
  eq(await store.queueGet(first.id), { id: first.id, needsRecord: true, needsReceiptUpload: false, receiptToTrash: ["d1"] });
  done();
});
