import { test, eq, ok } from "./harness.js";
import { FakeDrive } from "./fake-drive.js";

const blob = s => new Blob([s], { type: "application/json" });

test("fake drive: ensureFolders is stable", async () => {
  const d = new FakeDrive();
  const a = await d.ensureFolders();
  const b = await d.ensureFolders();
  eq(a, b);
  ok(a.rootId && a.receiptsId && a.recordsId);
});

test("fake drive: uploads show in listChanged and respect since", async () => {
  const clock = { t: Date.parse("2026-11-08T12:00:00Z") };
  const d = new FakeDrive({ clock });
  const { recordsId } = await d.ensureFolders();
  const up = await d.uploadFile({ name: "a.json", parentId: recordsId, blob: blob("{}"), mimeType: "application/json" });
  const all = await d.listChanged(recordsId, null);
  eq(all.files.map(f => f.name), ["a.json"]);
  eq(all.files[0].id, up.id);
  clock.t += 60000;
  const later = await d.listChanged(recordsId, new Date(clock.t - 1000).toISOString());
  eq(later.files, []);
  eq(later.serverTime, new Date(clock.t).toISOString());
});

test("fake drive: updating a file keeps its id and new content downloads", async () => {
  const d = new FakeDrive();
  const { recordsId } = await d.ensureFolders();
  const up = await d.uploadFile({ name: "a.json", parentId: recordsId, blob: blob("1"), mimeType: "application/json" });
  const up2 = await d.uploadFile({ name: "a.json", parentId: recordsId, blob: blob("2"), mimeType: "application/json", fileId: up.id });
  eq(up2.id, up.id);
  eq(await (await d.download(up.id)).text(), "2");
});

test("fake drive: trashed files disappear from listings", async () => {
  const d = new FakeDrive();
  const { receiptsId } = await d.ensureFolders();
  const up = await d.uploadFile({ name: "r.jpg", parentId: receiptsId, blob: blob("x"), mimeType: "image/jpeg" });
  await d.trash(up.id);
  eq((await d.listChanged(receiptsId, null)).files, []);
  eq([...await d.listNames(receiptsId)], []);
  ok(d.isTrashed(up.id));
});

test("fake drive: failNext rejects once with the status", async () => {
  const d = new FakeDrive();
  const { recordsId } = await d.ensureFolders();
  d.failNext("uploadFile", 503);
  let status = 0;
  try { await d.uploadFile({ name: "a", parentId: recordsId, blob: blob("x"), mimeType: "text/plain" }); } catch (e) { status = e.status; }
  eq(status, 503);
  const ok2 = await d.uploadFile({ name: "a", parentId: recordsId, blob: blob("x"), mimeType: "text/plain" });
  ok(ok2.id);
});

test("fake drive: findByName and listNames", async () => {
  const d = new FakeDrive();
  const { rootId } = await d.ensureFolders();
  await d.uploadFile({ name: "settings.json", parentId: rootId, blob: blob("{}"), mimeType: "application/json" });
  ok(await d.findByName(rootId, "settings.json"));
  eq(await d.findByName(rootId, "nope.json"), null);
  ok((await d.listNames(rootId)).has("settings.json"));
});
