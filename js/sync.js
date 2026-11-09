// Two-way sync between this device's store and the Mile Marker folder in Google Drive.
import { pickWinner, mergeSettings } from "./merge.js";
import { buildYearCsv } from "./csv.js";
import { receiptName } from "./names.js";

const OVERLAP_MS = 2 * 60 * 1000;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };
const extFor = type => EXT[type] || "bin";

export function createSync({ store, drive, isOnline, hasToken, onState = () => {} }) {
  const state = { status: "waiting", waiting: 0, lastSync: null };
  let running = null;

  const set = patch => { Object.assign(state, patch); onState({ ...state }); };
  const waitingCount = async () => (await store.queueAll()).length;
  const getMap = async key => ({ ...((await store.getSetting(key)) || {}) });

  async function folders() {
    let f = await store.getSetting("folders");
    if (!f) { f = await drive.ensureFolders(); await store.setSetting("folders", f); }
    return f;
  }

  async function uploadInPlace({ name, parentId, blob, mimeType, fileId }) {
    try {
      return await drive.uploadFile({ name, parentId, blob, mimeType, fileId });
    } catch (err) {
      if (fileId && err && err.status === 404) return drive.uploadFile({ name, parentId, blob, mimeType });
      throw err;
    }
  }

  async function push(f, years) {
    const recordIds = await getMap("recordFileIds");
    const syncedYears = await getMap("recordYears");
    let receiptNames = null;
    let pushed = 0;
    for (let q of await store.queueAll()) {
      let rec = await store.get(q.id);
      if (!rec) { await store.queueDelete(q.id); continue; }

      if (q.needsReceiptUpload) {
        const blob = rec.receipt && !rec.deleted ? await store.getBlob(rec.id) : null;
        if (blob) {
          receiptNames = receiptNames || await drive.listNames(f.receiptsId);
          const type = blob.type || rec.receipt.type;
          const name = receiptName(rec.date, rec.vendor, rec.amountCents, extFor(type), receiptNames, rec.id);
          const up = await drive.uploadFile({ name, parentId: f.receiptsId, blob, mimeType: type });
          receiptNames.add(name);
          rec = { ...rec, receipt: { driveId: up.id, name, type } };
          await store.put(rec);
        }
        q = { ...q, needsReceiptUpload: false };
        await store.queuePut(q);
      }

      while (q.receiptToTrash.length) {
        try { await drive.trash(q.receiptToTrash[0]); }
        catch (err) { if (!err || err.status !== 404) throw err; }
        q = { ...q, receiptToTrash: q.receiptToTrash.slice(1) };
        await store.queuePut(q);
      }

      if (q.needsRecord) {
        const up = await uploadInPlace({
          name: rec.id + ".json", parentId: f.recordsId, mimeType: "application/json",
          blob: new Blob([JSON.stringify(rec)], { type: "application/json" }), fileId: recordIds[rec.id],
        });
        recordIds[rec.id] = up.id;
        await store.setSetting("recordFileIds", recordIds);
        years.add(rec.year);
        if (syncedYears[rec.id] && syncedYears[rec.id] !== rec.year) years.add(syncedYears[rec.id]);
        syncedYears[rec.id] = rec.year;
        await store.setSetting("recordYears", syncedYears);
      }
      await store.queueDelete(q.id);
      pushed++;
    }
    return pushed;
  }

  async function pull(f, years) {
    const last = await store.getSetting("lastPullTime");
    const since = last ? new Date(Date.parse(last) - OVERLAP_MS).toISOString() : null;
    const { files, serverTime } = await drive.listChanged(f.recordsId, since);
    const recordIds = await getMap("recordFileIds");
    const syncedYears = await getMap("recordYears");
    let pulled = 0;
    for (const file of files) {
      let remote;
      try { remote = JSON.parse(await (await drive.download(file.id)).text()); }
      catch (err) { if (err && err.status) throw err; console.warn("Skipping unreadable record", file.name, err); continue; }
      if (!remote || typeof remote.id !== "string" || typeof remote.updatedAt !== "number") { console.warn("Skipping malformed record", file.name); continue; }
      recordIds[remote.id] = file.id;
      const local = await store.get(remote.id);
      if (pickWinner(local, remote) !== "remote") continue;
      if (local && JSON.stringify(local) === JSON.stringify(remote)) continue;
      await store.put(remote);
      await store.queueDelete(remote.id);
      years.add(remote.year);
      if (local && local.year !== remote.year) years.add(local.year);
      syncedYears[remote.id] = remote.year;
      pulled++;
      if (remote.deleted || !remote.receipt) { await store.deleteBlob(remote.id); continue; }
      const sameFile = local && local.receipt && local.receipt.driveId === remote.receipt.driveId;
      if (remote.receipt.driveId && !(sameFile && await store.getBlob(remote.id))) {
        await store.putBlob(remote.id, await drive.download(remote.receipt.driveId));
      }
    }
    await store.setSetting("recordFileIds", recordIds);
    await store.setSetting("recordYears", syncedYears);
    if (serverTime) await store.setSetting("lastPullTime", serverTime);
    return pulled;
  }

  async function syncSettings(f) {
    const local = (await store.getSetting("categories")) || { categories: [], updatedAt: 0 };
    let fileId = await store.getSetting("settingsFileId");
    if (!fileId) { const hit = await drive.findByName(f.rootId, "settings.json"); fileId = hit ? hit.id : null; }
    let remote = null;
    if (fileId) {
      try { remote = JSON.parse(await (await drive.download(fileId)).text()); }
      catch (err) { if (err && err.status === 404) fileId = null; else if (err && err.status) throw err; }
    }
    const merged = mergeSettings(local, remote);
    if (merged === remote && remote) {
      if (JSON.stringify(remote) !== JSON.stringify(local)) await store.setSetting("categories", remote);
    } else if (!remote || (local.updatedAt || 0) > (remote.updatedAt || 0)) {
      const up = await uploadInPlace({ name: "settings.json", parentId: f.rootId, mimeType: "application/json", blob: new Blob([JSON.stringify(local)], { type: "application/json" }), fileId });
      fileId = up.id;
    }
    if (fileId) await store.setSetting("settingsFileId", fileId);
  }

  async function writeCsvs(f, years) {
    if (!years.size) return;
    const all = await store.getAll();
    const csvIds = await getMap("csvFileIds");
    for (const year of years) {
      const name = "Mile Marker " + year + ".csv";
      if (!csvIds[year]) { const hit = await drive.findByName(f.rootId, name); if (hit) csvIds[year] = hit.id; }
      const up = await uploadInPlace({ name, parentId: f.rootId, mimeType: "text/csv", blob: new Blob([buildYearCsv(all, year)], { type: "text/csv" }), fileId: csvIds[year] });
      csvIds[year] = up.id;
      await store.setSetting("csvFileIds", csvIds);
    }
  }

  async function pass() {
    const result = { pushed: 0, pulled: 0, csvYears: [] };
    const waiting = await waitingCount();
    if (!isOnline()) { set({ status: "offline", waiting }); return result; }
    if (!hasToken()) { set({ status: "tap", waiting }); return result; }
    set({ status: "syncing", waiting });
    const years = new Set();
    try {
      const f = await folders();
      result.pushed = await push(f, years);
      result.pulled = await pull(f, years);
      await syncSettings(f);
      await writeCsvs(f, years);
      result.csvYears = [...years];
      set({ status: "synced", waiting: await waitingCount(), lastSync: Date.now(), message: "" });
    } catch (err) {
      console.error("Sync failed", err);
      const status = err && err.status === 401 ? "tap"
        : err && err.status === 403 && err.reason === "storageQuotaExceeded" ? "full"
        : err && err.status === 403 && /insufficient|scope/i.test(err.message || "") ? "reconnect"
        : "error";
      if (err && err.status === 404) await store.setSetting("folders", null);
      set({ status, waiting: await waitingCount(), message: (err && err.message) || String(err) });
    }
    return result;
  }

  function runPass() {
    if (!running) running = pass().finally(() => { running = null; });
    return running;
  }

  return { runPass, state };
}
