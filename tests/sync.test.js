import { test, eq, ok } from "./harness.js";
import { FakeDrive } from "./fake-drive.js";
import { openStore } from "../js/store.js";
import { createExpenses } from "../js/expenses.js";
import { createSync } from "../js/sync.js";

const fields = (over = {}) => ({ date: "2026-11-08", vendor: "Love's Travel Stop", amountCents: 4875, category: "Gas", payment: "Cash", items: "", purpose: "", noReceipt: false, noReceiptReason: "", ...over });
const photo = (s = "photo-bytes") => new Blob([s], { type: "application/pdf" });
const dbs = [];

async function device(drive, deviceId, net = { online: true, token: true }) {
  const name = "mm-sync-" + deviceId + "-" + Math.random().toString(36).slice(2);
  dbs.push(name);
  const store = await openStore(name);
  const states = [];
  return {
    store,
    net,
    states,
    ex: createExpenses({ store, deviceId }),
    sync: createSync({ store, drive, isOnline: () => net.online, hasToken: () => net.token, onState: s => states.push(s) }),
    close: () => store.close(),
  };
}
const strip = list => list.map(r => JSON.stringify(r)).sort();
const receipts = (drive) => drive.filesIn([...drive.files.values()].find(f => f.name === "Receipts").id);
const rootFiles = (drive) => drive.filesIn([...drive.files.values()].find(f => f.name === "Mile Marker").id);

test("sync: a receipt saved on A reaches B", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  const r = await A.ex.save(fields(), { file: photo() });
  await A.sync.runPass();
  await B.sync.runPass();
  const onB = await B.store.get(r.id);
  ok(onB, "record on B");
  eq(onB.receipt.name, "2026-11-08 Loves Travel Stop 48.75.pdf");
  eq((await B.store.getBlob(r.id)).size, photo().size);
  eq(strip(await B.store.getAll()), strip(await A.store.getAll()));
  eq(A.states[A.states.length - 1].status, "synced");
  A.close(); B.close();
});

test("sync: an edit on B reaches A", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  const r = await A.ex.save(fields());
  await A.sync.runPass(); await B.sync.runPass();
  await B.ex.save(fields({ vendor: "Edited on B" }), { existing: await B.store.get(r.id) });
  await B.sync.runPass(); await A.sync.runPass();
  eq((await A.store.get(r.id)).vendor, "Edited on B");
  A.close(); B.close();
});

test("sync: a delete reaches the other device and trashes the receipt", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  const r = await A.ex.save(fields(), { file: photo() });
  await A.sync.runPass(); await B.sync.runPass();
  const driveId = (await A.store.get(r.id)).receipt.driveId;
  await A.ex.remove(await A.store.get(r.id));
  await A.sync.runPass(); await B.sync.runPass();
  eq((await B.store.get(r.id)).deleted, true);
  eq(await B.store.getBlob(r.id), undefined);
  ok(drive.isTrashed(driveId), "receipt trashed");
  A.close(); B.close();
});

test("sync: offline keeps the queue and reports waiting", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a", { online: false, token: true });
  await A.ex.save(fields());
  const res = await A.sync.runPass();
  eq(res.pushed, 0);
  eq(A.sync.state.status, "offline");
  eq(A.sync.state.waiting, 1);
  eq((await A.store.queueAll()).length, 1);
  A.close();
});

test("sync: an expired token asks for a tap", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a", { online: true, token: false });
  await A.ex.save(fields());
  await A.sync.runPass();
  eq(A.sync.state.status, "tap");
  eq(A.sync.state.waiting, 1);
  A.close();
});

test("sync: a failure after the receipt upload never uploads the receipt twice", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r = await A.ex.save(fields(), { file: photo() });
  drive.failNext("uploadFile", 503, a => a.name.endsWith(".json"));
  await A.sync.runPass();
  eq(A.sync.state.status, "error");
  const q = await A.store.queueGet(r.id);
  eq(q.needsReceiptUpload, false);
  ok((await A.store.get(r.id)).receipt.driveId, "driveId saved before the record upload");
  await A.sync.runPass();
  eq(A.sync.state.status, "synced");
  eq(receipts(drive).length, 1);
  eq(await A.store.queueGet(r.id), undefined);
  A.close();
});

test("sync: moving an expense to another year rebuilds both CSVs", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r = await A.ex.save(fields({ date: "2025-12-30" }));
  await A.sync.runPass();
  await A.ex.save(fields({ date: "2026-01-02" }), { existing: await A.store.get(r.id) });
  const res = await A.sync.runPass();
  eq(res.csvYears.sort(), [2025, 2026]);
  const csv2025 = rootFiles(drive).find(f => f.name === "Mile Marker 2025.csv");
  ok(!(await csv2025.blob.text()).includes("2025-12-30"), "row left 2025");
  ok((await rootFiles(drive).find(f => f.name === "Mile Marker 2026.csv").blob.text()).includes("2026-01-02"));
  A.close();
});

test("sync: a second receipt with the same name gets an id suffix", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r1 = await A.ex.save(fields(), { file: photo("one") });
  const r2 = await A.ex.save(fields(), { file: photo("two") });
  await A.sync.runPass();
  eq(receipts(drive).length, 2);
  const plain = "2026-11-08 Loves Travel Stop 48.75.pdf";
  const got = [await A.store.get(r1.id), await A.store.get(r2.id)].map(r => [r.id, r.receipt.name]);
  const [, other] = got.find(([, n]) => n === plain) ? got.sort((a, b) => (a[1] === plain ? -1 : 1)) : [null, null];
  ok(other, "one receipt keeps the plain name");
  eq(other[1], "2026-11-08 Loves Travel Stop 48.75 " + other[0].replace(/-/g, "").slice(0, 6) + ".pdf");
  A.close();
});

test("sync: the year CSV is created once and updated in place", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  await A.ex.save(fields());
  await A.sync.runPass();
  const first = rootFiles(drive).filter(f => f.name === "Mile Marker 2026.csv");
  await A.ex.save(fields({ vendor: "Second" }));
  await A.sync.runPass();
  const after = rootFiles(drive).filter(f => f.name === "Mile Marker 2026.csv");
  eq(after.length, 1);
  eq(after[0].id, first[0].id);
  ok((await after[0].blob.text()).includes("Second"));
  A.close();
});

test("sync: custom categories reach the other device", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  await A.store.setSetting("categories", { categories: ["Laundry"], updatedAt: Date.now() });
  await A.sync.runPass(); await B.sync.runPass();
  eq((await B.store.getSetting("categories")).categories, ["Laundry"]);
  A.close(); B.close();
  for (const n of dbs) indexedDB.deleteDatabase(n);
});
