// Two-way sync between this device's store and the Mile Marker folder in Google Drive.
// Order of a pass: pull (take newer copies, re-queue ours where Drive is behind), push the queue,
// settings, then rebuild the CSV for every year touched.
import { pickWinner, mergeSettings } from "./merge.js";
import { buildYearCsv } from "./csv.js";
import { receiptName } from "./names.js";

const OVERLAP_MS = 2 * 60 * 1000;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };
const extFor = type => EXT[type] || "bin";

/** Errors that stop the whole pass (no network, signed out, Drive full); anything else only skips one expense. */
const fatal = err => !err || err.status === 0 || err.status === 401 ||
  (err.status === 403 && /quota|insufficient|scope/i.test((err.reason || "") + " " + (err.message || "")));

export function createSync({ store, drive, isOnline, hasToken, onState = () => {}, onUnauthorized = () => {} }) {
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

  // ---------- push ----------

  async function push(f, years) {
    let pushed = 0;
    const errors = [];
    const ctx = { names: null };
    for (const q of await store.queueAll()) {
      try { if (await pushOne(f, q, years, ctx)) pushed++; }
      catch (err) { if (fatal(err)) throw err; console.warn("Couldn't sync expense", q.id, err); errors.push(err); }
    }
    return { pushed, errors };
  }

  async function pushOne(f, q0, years, ctx) {
    const id = q0.id, seq = q0.seq;
    let rec = await store.get(id);
    if (!rec) { await store.queueDelete(id); return false; }

    if (q0.needsReceiptUpload) {
      const localId = rec.receipt && rec.receipt.localId;
      const blob = rec.receipt && !rec.deleted && !rec.receipt.driveId ? await store.getBlob(id) : null;
      if (blob) {
        ctx.names = ctx.names || await drive.listNames(f.receiptsId);
        const type = blob.type || rec.receipt.type;
        const name = receiptName(rec.date, rec.vendor, rec.amountCents, extFor(type), ctx.names, id);
        const up = await drive.uploadFile({ name, parentId: f.receiptsId, blob, mimeType: type });
        ctx.names.add(name);
        // Attach the Drive file only if the record still points at the same photo (it may have changed meanwhile).
        const out = await store.patch(id, (cur, q) => {
          if (!cur || !cur.receipt || cur.receipt.localId !== localId || cur.receipt.driveId) return { orphan: true };
          return { rec: { ...cur, receipt: { ...cur.receipt, driveId: up.id, name, type } }, q: q ? { ...q, needsReceiptUpload: false } : undefined };
        });
        if (out.orphan) await drive.trash(up.id).catch(() => {});
      } else {
        await store.patch(id, (cur, q) => {
          const newerPhoto = cur && cur.receipt && !cur.deleted && !cur.receipt.driveId && cur.receipt.localId !== localId;
          return q && !newerPhoto ? { q: { ...q, needsReceiptUpload: false } } : {};
        });
      }
    }

    const q1 = await store.queueGet(id);
    for (const t of q1 ? q1.receiptToTrash : []) {
      try { await drive.trash(t); }
      catch (err) { if (!err || err.status !== 404) throw err; }
      await store.patch(id, (cur, q) => (q ? { q: { ...q, receiptToTrash: q.receiptToTrash.filter(x => x !== t) } } : {}));
    }

    const q2 = await store.queueGet(id);
    if (!q2) return true;
    if (q2.needsReceiptUpload) return false; // a newer photo goes up first; never publish a record without it
    rec = await store.get(id);
    if (q2.needsRecord) {
      const recordIds = await getMap("recordFileIds");
      const syncedYears = await getMap("recordYears");
      const up = await uploadInPlace({
        name: id + ".json", parentId: f.recordsId, mimeType: "application/json",
        blob: new Blob([JSON.stringify(rec)], { type: "application/json" }), fileId: recordIds[id],
      });
      recordIds[id] = up.id;
      await store.setSetting("recordFileIds", recordIds);
      years.add(rec.year);
      if (syncedYears[id] && syncedYears[id] !== rec.year) years.add(syncedYears[id]);
      syncedYears[id] = rec.year;
      await store.setSetting("recordYears", syncedYears);
    }
    const uploaded = JSON.stringify(rec);
    // Clear the entry only if nothing was saved while we were uploading.
    await store.patch(id, (cur, q) => {
      if (!q) return {};
      const untouched = q.seq === seq || JSON.stringify(cur) === uploaded;
      return untouched && !q.needsReceiptUpload && !q.receiptToTrash.length ? { q: null } : {};
    });
    return true;
  }

  // ---------- pull ----------

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
      if (local && JSON.stringify(local) === JSON.stringify(remote)) continue;
      if (pickWinner(local, remote) !== "remote") {
        // Drive holds an older or losing copy: make sure ours goes back up.
        await store.patch(remote.id, (cur, q) => (q ? {} : { q: { id: remote.id, seq: crypto.randomUUID(), needsRecord: true, needsReceiptUpload: false, receiptToTrash: [] } }));
        continue;
      }
      // Fetch the receipt before storing the record; if it fails, the sweep below retries it.
      const haveIt = local && local.receipt && remote.receipt && local.receipt.driveId === remote.receipt.driveId && await store.getBlob(remote.id);
      if (!remote.deleted && remote.receipt && remote.receipt.driveId && !haveIt) {
        try { await store.putBlob(remote.id, await drive.download(remote.receipt.driveId)); }
        catch (err) { if (fatal(err)) throw err; console.warn("Receipt download failed; will retry", remote.id, err); }
      }
      await store.patch(remote.id, (cur, q) => ({
        rec: remote,
        q: q && q.receiptToTrash.length ? { ...q, needsRecord: false, needsReceiptUpload: false } : null,
      }));
      years.add(remote.year);
      if (local && local.year !== remote.year) years.add(local.year);
      syncedYears[remote.id] = remote.year;
      pulled++;
      if (remote.deleted || !remote.receipt) await store.deleteBlob(remote.id);
    }
    await store.setSetting("recordFileIds", recordIds);
    await store.setSetting("recordYears", syncedYears);
    if (serverTime) await store.setSetting("lastPullTime", serverTime);
    await sweepMissingReceipts();
    return pulled;
  }

  /** Download receipts this device should have but doesn't (failed or interrupted downloads). Skips ones cleared by "Free up space". */
  async function sweepMissingReceipts() {
    const cleared = new Set((await store.getSetting("clearedBlobs")) || []);
    for (const r of await store.getAll()) {
      if (r.deleted || !r.receipt || !r.receipt.driveId || cleared.has(r.id)) continue;
      if (await store.getBlob(r.id)) continue;
      try { await store.putBlob(r.id, await drive.download(r.receipt.driveId)); }
      catch (err) { if (fatal(err)) throw err; console.warn("Receipt download failed; will retry", r.id, err); }
    }
  }

  /** Download one receipt on demand (viewing a receipt cleared by "Free up space"). */
  async function fetchReceipt(rec) {
    if (!rec || !rec.receipt || !rec.receipt.driveId) return null;
    const blob = await drive.download(rec.receipt.driveId);
    await store.putBlob(rec.id, blob);
    return blob;
  }

  // ---------- settings and CSV ----------

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

  // ---------- pass ----------

  async function pass() {
    const result = { pushed: 0, pulled: 0, csvYears: [] };
    const waiting = await waitingCount();
    if (!isOnline()) { set({ status: "offline", waiting }); return result; }
    if (!hasToken()) { set({ status: "tap", waiting }); return result; }
    set({ status: "syncing", waiting });
    const years = new Set();
    try {
      const f = await folders();
      result.pulled = await pull(f, years);
      const { pushed, errors } = await push(f, years);
      result.pushed = pushed;
      await syncSettings(f);
      await writeCsvs(f, years);
      result.csvYears = [...years];
      const left = await waitingCount();
      if (errors.length) set({ status: "error", waiting: left, lastSync: Date.now(), message: errors[0].message || String(errors[0]) });
      else set({ status: "synced", waiting: left, lastSync: Date.now(), message: "" });
    } catch (err) {
      console.error("Sync failed", err);
      const status = err && err.status === 401 ? "tap"
        : err && err.status === 403 && err.reason === "storageQuotaExceeded" ? "full"
        : err && err.status === 403 && /insufficient|scope/i.test(err.message || "") ? "reconnect"
        : "error";
      if (err && err.status === 404) await store.setSetting("folders", null);
      if (err && err.status === 401) onUnauthorized();
      set({ status, waiting: await waitingCount(), message: (err && err.message) || String(err) });
    }
    return result;
  }

  function runPass() {
    if (!running) running = pass().finally(() => { running = null; });
    return running;
  }

  return { runPass, fetchReceipt, state };
}
