// Google Drive REST v3 client (drive.file scope). Same interface as tests/fake-drive.js.
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const RETRY_MS = [1000, 4000, 15000];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

export class GoogleDrive {
  constructor(getToken) { this.getToken = getToken; }

  async call(url, opts = {}, as = "json") {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + this.getToken() } });
      } catch (err) {
        if (attempt < RETRY_MS.length) { await sleep(RETRY_MS[attempt]); continue; }
        throw { status: 0, message: "Network error" };
      }
      if (res.ok) return as === "blob" ? res.blob() : res.status === 204 ? null : res.json();
      if ((res.status === 429 || res.status >= 500) && attempt < RETRY_MS.length) { await sleep(RETRY_MS[attempt]); continue; }
      let message = res.statusText, reason = "";
      try { const j = await res.json(); message = j.error.message; reason = (j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || ""; } catch { /* not JSON */ }
      throw { status: res.status, message, reason };
    }
  }

  async list(query, fields = "id,name,modifiedTime") {
    const out = [];
    let pageToken = "";
    do {
      const u = new URL(API);
      u.searchParams.set("q", query);
      u.searchParams.set("fields", "nextPageToken,files(" + fields + ")");
      u.searchParams.set("pageSize", "1000");
      u.searchParams.set("spaces", "drive");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const r = await this.call(u.toString());
      out.push(...r.files);
      pageToken = r.nextPageToken || "";
    } while (pageToken);
    return out;
  }

  async folder(name, parentId, tag) {
    const query = parentId
      ? `${q(parentId)} in parents and name=${q(name)} and mimeType=${q(FOLDER)} and trashed=false`
      : `name=${q(name)} and mimeType=${q(FOLDER)} and appProperties has { key='mileMarker' and value=${q(tag)} } and trashed=false`;
    const hit = (await this.list(query, "id"))[0];
    if (hit) return hit.id;
    const meta = { name, mimeType: FOLDER, appProperties: { mileMarker: tag } };
    if (parentId) meta.parents = [parentId];
    const r = await this.call(API + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) });
    return r.id;
  }

  async ensureFolders() {
    const rootId = await this.folder("Mile Marker", null, "root");
    const [receiptsId, recordsId] = [await this.folder("Receipts", rootId, "receipts"), await this.folder("Records", rootId, "records")];
    return { rootId, receiptsId, recordsId };
  }

  async uploadFile({ name, parentId, blob, mimeType, fileId, appProperties }) {
    const meta = { name };
    if (!fileId) { meta.parents = [parentId]; if (appProperties) meta.appProperties = appProperties; }
    const boundary = "mm" + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, blob, `\r\n--${boundary}--`,
    ]);
    const url = (fileId ? UPLOAD + "/" + encodeURIComponent(fileId) : UPLOAD) + "?uploadType=multipart&fields=id,modifiedTime";
    return this.call(url, { method: fileId ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body });
  }

  /** Files in a folder changed after sinceIso. serverTime is the newest modifiedTime seen (Drive's own clock), or sinceIso if nothing changed. */
  async listChanged(parentId, sinceIso) {
    let query = `${q(parentId)} in parents and trashed=false`;
    if (sinceIso) query += ` and modifiedTime > ${q(sinceIso)}`;
    const files = await this.list(query);
    const newest = files.reduce((m, f) => (f.modifiedTime > m ? f.modifiedTime : m), sinceIso || "");
    return { files, serverTime: newest || null };
  }

  download(fileId) { return this.call(API + "/" + encodeURIComponent(fileId) + "?alt=media", {}, "blob"); }

  trash(fileId) {
    return this.call(API + "/" + encodeURIComponent(fileId) + "?fields=id", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  }

  async findByName(parentId, name) {
    const hit = (await this.list(`${q(parentId)} in parents and name=${q(name)} and trashed=false`, "id"))[0];
    return hit ? { id: hit.id } : null;
  }

  async listNames(parentId) {
    return new Set((await this.list(`${q(parentId)} in parents and trashed=false`, "name")).map(f => f.name));
  }

  folderUrl(id) { return "https://drive.google.com/drive/folders/" + id; }
}
