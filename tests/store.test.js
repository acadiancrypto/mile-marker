import { test, eq, ok } from "./harness.js";
import { rec } from "./fixtures.js";
import { openStore } from "../js/store.js";

async function fresh() {
  const name = "mm-test-" + Math.random().toString(36).slice(2);
  const s = await openStore(name);
  return { s, done: () => { s.close(); indexedDB.deleteDatabase(name); } };
}

test("store: put then get round-trips a record", async () => {
  const { s, done } = await fresh();
  await s.put(rec({ id: "a", vendor: "Motel 6" }));
  eq((await s.get("a")).vendor, "Motel 6");
  eq(await s.get("missing"), undefined);
  done();
});

test("store: getAll includes tombstones", async () => {
  const { s, done } = await fresh();
  await s.put(rec({ id: "a" }));
  await s.put(rec({ id: "b", deleted: true }));
  eq((await s.getAll()).map(r => r.id).sort(), ["a", "b"]);
  done();
});

test("store: blobs round-trip and delete", async () => {
  const { s, done } = await fresh();
  await s.putBlob("a", new Blob(["hello"], { type: "image/jpeg" }));
  const b = await s.getBlob("a");
  eq([b.size, b.type], [5, "image/jpeg"]);
  await s.deleteBlob("a");
  eq(await s.getBlob("a"), undefined);
  done();
});

test("store: queue entries round-trip and delete", async () => {
  const { s, done } = await fresh();
  const q = { id: "a", needsRecord: true, needsReceiptUpload: false, receiptToTrash: ["d9"] };
  await s.queuePut(q);
  eq(await s.queueGet("a"), q);
  eq((await s.queueAll()).length, 1);
  await s.queueDelete("a");
  eq(await s.queueAll(), []);
  done();
});

test("store: settings round-trip", async () => {
  const { s, done } = await fresh();
  await s.setSetting("deviceId", "dev-1");
  eq(await s.getSetting("deviceId"), "dev-1");
  eq(await s.getSetting("nope"), undefined);
  done();
});

test("store: clearSyncedBlobs only clears synced receipts", async () => {
  const { s, done } = await fresh();
  await s.put(rec({ id: "synced", receipt: { driveId: "d1", name: "a.jpg", type: "image/jpeg" } }));
  await s.put(rec({ id: "waiting", receipt: { driveId: null, name: null, type: "image/jpeg" } }));
  await s.put(rec({ id: "replaced", receipt: { driveId: "d2", name: "b.jpg", type: "image/jpeg" } }));
  await s.queuePut({ id: "replaced", needsRecord: true, needsReceiptUpload: true, receiptToTrash: [] });
  for (const id of ["synced", "waiting", "replaced"]) await s.putBlob(id, new Blob(["x"]));
  eq(await s.clearSyncedBlobs(), 1);
  eq(await s.getBlob("synced"), undefined);
  ok(await s.getBlob("waiting"), "waiting kept");
  ok(await s.getBlob("replaced"), "pending upload kept");
  done();
});

test("store: onChange fires after a put", async () => {
  const { s, done } = await fresh();
  let n = 0;
  const off = s.onChange(() => n++);
  await s.put(rec({ id: "a" }));
  off();
  await s.put(rec({ id: "b" }));
  eq(n, 1);
  done();
});
