// IndexedDB storage: expenses (incl. tombstones), receipt blobs, the sync queue and settings.

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function openStore(name = "mile-marker") {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("expenses", { keyPath: "id" });
      db.createObjectStore("blobs", { keyPath: "id" });
      db.createObjectStore("queue", { keyPath: "id" });
      db.createObjectStore("settings", { keyPath: "key" });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(makeStore(open.result));
  });
}

function makeStore(db) {
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };

  function tx(names, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      let out;
      Promise.resolve(fn(t)).then(v => { out = v; }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const read = (store, fn) => tx([store], "readonly", t => fn(t.objectStore(store)));
  const write = async (store, fn) => { const v = await tx([store], "readwrite", t => fn(t.objectStore(store))); changed(); return v; };

  return {
    close: () => db.close(),
    getAll: () => read("expenses", s => req(s.getAll())),
    get: id => read("expenses", s => req(s.get(id))),
    put: e => write("expenses", s => req(s.put(e))),

    putBlob: (id, blob) => write("blobs", s => req(s.put({ id, blob }))),
    getBlob: id => read("blobs", s => req(s.get(id))).then(r => r ? r.blob : undefined),
    deleteBlob: id => write("blobs", s => req(s.delete(id))),

    queueGet: id => read("queue", s => req(s.get(id))),
    queueAll: () => read("queue", s => req(s.getAll())),
    queuePut: e => write("queue", s => req(s.put(e))),
    queueDelete: id => write("queue", s => req(s.delete(id))),

    getSetting: key => read("settings", s => req(s.get(key))).then(r => r ? r.value : undefined),
    setSetting: (key, value) => write("settings", s => req(s.put({ key, value }))),

    async clearSyncedBlobs() {
      const [all, queue, blobKeys] = await Promise.all([
        read("expenses", s => req(s.getAll())),
        read("queue", s => req(s.getAll())),
        read("blobs", s => req(s.getAllKeys())),
      ]);
      const pending = new Set(queue.filter(q => q.needsReceiptUpload).map(q => q.id));
      const have = new Set(blobKeys);
      const ids = all.filter(e => e.receipt && e.receipt.driveId && !pending.has(e.id) && have.has(e.id)).map(e => e.id);
      if (ids.length) await write("blobs", s => Promise.all(ids.map(id => req(s.delete(id)))));
      return ids.length;
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
