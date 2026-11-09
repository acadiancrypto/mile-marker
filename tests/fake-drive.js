// In-memory stand-in for js/drive.js (same interface), shared by several fake "devices" in tests.
export class FakeDrive {
  constructor({ clock } = {}) {
    this.clock = clock || { t: Date.parse("2026-11-08T12:00:00Z") };
    this.files = new Map(); // id -> {id, name, parentId, blob, mimeType, modifiedTime, trashed, appProperties}
    this.next = 1;
    this.failures = [];
    this.calls = [];
  }
  now() { this.clock.t += 1; return new Date(this.clock.t).toISOString(); }
  failNext(method, status) { this.failures.push({ method, status }); }
  check(method) {
    this.calls.push(method);
    const i = this.failures.findIndex(f => f.method === method);
    if (i >= 0) { const f = this.failures.splice(i, 1)[0]; throw { status: f.status, message: "fake " + f.status }; }
  }
  live(parentId) { return [...this.files.values()].filter(f => f.parentId === parentId && !f.trashed); }
  isTrashed(id) { return !!(this.files.get(id) || {}).trashed; }
  filesIn(parentId) { return this.live(parentId); }

  async ensureFolders() {
    this.check("ensureFolders");
    const find = (name, parentId) => [...this.files.values()].find(f => f.folder && f.name === name && f.parentId === parentId && !f.trashed);
    const make = (name, parentId) => find(name, parentId) || this.add({ name, parentId, folder: true, mimeType: "application/vnd.google-apps.folder" });
    const root = make("Mile Marker", "root");
    return { rootId: root.id, receiptsId: make("Receipts", root.id).id, recordsId: make("Records", root.id).id };
  }
  add(f) {
    const file = { id: "f" + this.next++, trashed: false, modifiedTime: this.now(), ...f };
    this.files.set(file.id, file);
    return file;
  }
  async uploadFile({ name, parentId, blob, mimeType, fileId, appProperties }) {
    this.check("uploadFile");
    if (fileId) {
      const f = this.files.get(fileId);
      if (!f) throw { status: 404, message: "not found" };
      Object.assign(f, { name, blob, mimeType, modifiedTime: this.now() });
      return { id: f.id, modifiedTime: f.modifiedTime };
    }
    const f = this.add({ name, parentId, blob, mimeType, appProperties });
    return { id: f.id, modifiedTime: f.modifiedTime };
  }
  async listChanged(parentId, sinceIso) {
    this.check("listChanged");
    const files = this.live(parentId)
      .filter(f => !sinceIso || f.modifiedTime > sinceIso)
      .map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
    return { files, serverTime: new Date(this.clock.t).toISOString() };
  }
  async download(fileId) {
    this.check("download");
    const f = this.files.get(fileId);
    if (!f || !f.blob) throw { status: 404, message: "not found" };
    return f.blob;
  }
  async trash(fileId) {
    this.check("trash");
    const f = this.files.get(fileId);
    if (f) { f.trashed = true; f.modifiedTime = this.now(); }
  }
  async findByName(parentId, name) {
    this.check("findByName");
    const f = this.live(parentId).find(x => x.name === name);
    return f ? { id: f.id } : null;
  }
  async listNames(parentId) {
    this.check("listNames");
    return new Set(this.live(parentId).map(f => f.name));
  }
  folderUrl(id) { return "https://drive.google.com/drive/folders/" + id; }
}
