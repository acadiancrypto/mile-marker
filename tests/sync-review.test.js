// Tests for the final-review findings (conflicts, edits during a sync, failed downloads, error handling).
import { test, eq, ok } from "./harness.js";
import { FakeDrive } from "./fake-drive.js";
import { openStore } from "../js/store.js";
import { createExpenses } from "../js/expenses.js";
import { createSync } from "../js/sync.js";

const fields = (over = {}) => ({ date: "2026-11-08", vendor: "Love's Travel Stop", amountCents: 4875, category: "Gas", payment: "Cash", items: "", purpose: "", noReceipt: false, noReceiptReason: "", ...over });
const photo = (s = "photo-bytes") => new Blob([s], { type: "application/pdf" });

async function device(drive, deviceId, extra = {}) {
  const name = "mm-rev-" + deviceId + "-" + Math.random().toString(36).slice(2);
  const store = await openStore(name);
  return {
    store,
    ex: createExpenses({ store, deviceId }),
    sync: createSync({ store, drive, isOnline: () => true, hasToken: () => true, ...extra }),
    close: () => { store.close(); indexedDB.deleteDatabase(name); },
  };
}
const folderId = (drive, name) => [...drive.files.values()].find(f => f.name === name).id;
const recordOnDrive = async (drive, id) => JSON.parse(await drive.filesIn(folderId(drive, "Records")).find(f => f.name === id + ".json").blob.text());

async function sharedRecord(drive) {
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  const r = await A.ex.save(fields());
  await A.sync.runPass(); await B.sync.runPass();
  return { A, B, id: r.id };
}
async function forceEdit(dev, id, vendor, updatedAt, deviceId) {
  const cur = await dev.store.get(id);
  await dev.store.put({ ...cur, vendor, updatedAt, deviceId });
  await dev.store.queuePut({ id, needsRecord: true, needsReceiptUpload: false, receiptToTrash: [], seq: "s-" + vendor });
}

test("review C1: a tie converges on both devices and Drive", async () => {
  const drive = new FakeDrive();
  const { A, B, id } = await sharedRecord(drive);
  await forceEdit(A, id, "A edit", 9e12, "dev-a");
  await forceEdit(B, id, "B edit", 9e12, "dev-b");
  await A.sync.runPass(); await B.sync.runPass(); await A.sync.runPass(); await B.sync.runPass();
  eq((await A.store.get(id)).vendor, "B edit");
  eq((await B.store.get(id)).vendor, "B edit");
  eq((await recordOnDrive(drive, id)).vendor, "B edit");
  A.close(); B.close();
});

test("review C1: the older edit syncing last doesn't win on Drive", async () => {
  const drive = new FakeDrive();
  const { A, B, id } = await sharedRecord(drive);
  await forceEdit(A, id, "newer", 9e12 + 200, "dev-a");
  await forceEdit(B, id, "older", 9e12 + 100, "dev-b");
  await A.sync.runPass(); await B.sync.runPass();
  eq((await B.store.get(id)).vendor, "newer");
  eq((await recordOnDrive(drive, id)).vendor, "newer");
  A.close(); B.close();
});

test("review C2: an edit with a new photo during an upload isn't lost", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r = await A.ex.save(fields(), { file: photo("first") });
  let fired = false;
  drive.beforeUpload = async ({ parentId }) => {
    if (fired || parentId !== folderId(drive, "Receipts")) return;
    fired = true;
    await A.ex.save(fields({ vendor: "Edited mid-sync" }), { existing: await A.store.get(r.id), file: photo("second") });
  };
  await A.sync.runPass();
  drive.beforeUpload = null;
  await A.sync.runPass();
  const rec = await A.store.get(r.id);
  eq(rec.vendor, "Edited mid-sync");
  eq(await (await A.store.getBlob(r.id)).text(), "second");
  eq(await A.store.queueGet(r.id), undefined);
  const live = drive.filesIn(folderId(drive, "Receipts"));
  eq(live.length, 1);
  eq(await live[0].blob.text(), "second");
  eq(live[0].id, rec.receipt.driveId);
  eq((await recordOnDrive(drive, r.id)).vendor, "Edited mid-sync");
  A.close();
});

test("review C2: a plain edit during the record upload is still pushed", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r = await A.ex.save(fields());
  let fired = false;
  drive.beforeUpload = async ({ name }) => {
    if (fired || name !== r.id + ".json") return;
    fired = true;
    await A.ex.save(fields({ vendor: "Late edit" }), { existing: await A.store.get(r.id) });
  };
  await A.sync.runPass();
  drive.beforeUpload = null;
  ok(await A.store.queueGet(r.id), "late edit still queued");
  await A.sync.runPass();
  eq((await recordOnDrive(drive, r.id)).vendor, "Late edit");
  A.close();
});

test("review C3: a receipt that failed to download is fetched next pass", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a"), B = await device(drive, "dev-b");
  const r = await A.ex.save(fields(), { file: photo("pic") });
  await A.sync.runPass();
  const driveId = (await A.store.get(r.id)).receipt.driveId;
  drive.failNext("download", 503, a => a.fileId === driveId); // pull's download
  drive.failNext("download", 503, a => a.fileId === driveId); // the same pass's sweep
  await B.sync.runPass();
  eq(await B.store.getBlob(r.id), undefined);
  await B.sync.runPass();
  eq(await (await B.store.getBlob(r.id)).text(), "pic");
  A.close(); B.close();
});

test("review I4: cleared receipts stay cleared but download on view", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const r = await A.ex.save(fields(), { file: photo("pic") });
  await A.sync.runPass();
  eq(await A.store.clearSyncedBlobs(), 1);
  await A.sync.runPass();
  eq(await A.store.getBlob(r.id), undefined, "sweep respects Free up space");
  const blob = await A.sync.fetchReceipt(await A.store.get(r.id));
  eq(await blob.text(), "pic");
  eq(await (await A.store.getBlob(r.id)).text(), "pic");
  A.close();
});

test("review I5: one failing entry doesn't block the others", async () => {
  const drive = new FakeDrive();
  const A = await device(drive, "dev-a");
  const bad = await A.ex.save(fields({ vendor: "Bad" }));
  const good = await A.ex.save(fields({ vendor: "Good" }));
  drive.failNext("uploadFile", 400, a => a.name === bad.id + ".json");
  await A.sync.runPass();
  eq(A.sync.state.status, "error");
  eq(await A.store.queueGet(good.id), undefined, "good entry pushed");
  ok(await A.store.queueGet(bad.id), "bad entry kept");
  A.close();
});

test("review I6: a 401 clears the token through onUnauthorized", async () => {
  const drive = new FakeDrive();
  let cleared = 0;
  const A = await device(drive, "dev-a", { onUnauthorized: () => cleared++ });
  await A.ex.save(fields());
  drive.failNext("listChanged", 401);
  await A.sync.runPass();
  eq(cleared, 1);
  eq(A.sync.state.status, "tap");
  A.close();
});
