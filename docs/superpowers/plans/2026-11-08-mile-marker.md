# Mile Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable, offline-first expense and receipt app (PWA) for Android and Windows that syncs through the user's Google Drive.

**Architecture:** Plain ES modules with no build step. Pure logic modules (money, names, totals, csv, merge) are unit-tested in a browser test runner. IndexedDB is the source of truth on each device. `sync.js` pushes the queue to Drive and pulls newer records through a `drive` interface, which has a real implementation (`drive.js`) and a fake one (`tests/fake-drive.js`) for tests. A service worker caches the app shell.

**Tech Stack:** HTML/CSS/JS (ES2020 modules), IndexedDB, Service Worker, Google Identity Services token client, Google Drive REST v3, GitHub Pages. Local server: `python -m http.server 8080`.

**Spec:** `docs/superpowers/specs/2026-11-08-mile-marker-design.md`

## Global Constraints

- No npm, no bundler, no runtime dependencies. The only external script is `https://accounts.google.com/gsi/client`.
- Node is not installed. All tests run in the browser at `http://localhost:8080/tests/`.
- Money is always integer cents (`amountCents`).
- Drive scope: exactly `https://www.googleapis.com/auth/drive.file`.
- Drive layout: `Mile Marker/` with `Receipts/`, `Records/`, `settings.json` and `Mile Marker <year>.csv`. Folders are tagged with `appProperties.mileMarker`.
- Receipt name format: `<YYYY-MM-DD> <vendor> <amount>.<ext>`, e.g. `2026-11-08 Loves Travel Stop 48.75.jpg`.
- Photos are shrunk to JPEG, max side 2000 px, quality 0.85.
- Removed receipts go to Drive's trash (`trashed: true`). Never permanently delete.
- Sync triggers: launch, `online` event, every 5 min while visible, 3 s after a save (debounced), and a badge tap. Only one pass runs at a time.
- Pull overlap: `modifiedTime > lastPullTime − 2 min`.
- Merge: newer `updatedAt` wins. On a tie, the higher `deviceId` (string comparison) wins.
- Built-in categories, in order: Gas, Food, Rent, Lodging, Hygiene, Tolls & parking, Vehicle repair & maintenance, Airfare & transit, Supplies & tools, Phone & internet, Other.
- Visual design: carry over the tokens and styles from `../road-ledger/index.html` (highway green `#0a6b3d`, Barlow Condensed / Barlow / IBM Plex Mono, both light and dark themes).
- Icons already exist in `icons/` (do not regenerate).

## Review Focus

1. **Odd amount input** (`$1,234.5`, `12.`, `.99`, `0.005`, `-5`, `abc`): accept the first three, reject the rest with the form error. Test lives in Task 2.
2. **Vendor names with forbidden filename characters or emoji** (`A/B: "Shop"*?<>|`, a 200-char name, `🚚 Fuel`): the receipt name stays valid on Windows and Drive and is at most 120 chars. Test lives in Task 2.
3. **App closed mid-sync, after the receipt upload but before the record upload:** the next pass must not upload the receipt twice. Test lives in Task 8.
4. **Expense moved to a different year** (date edited from 2025-12-30 to 2026-01-02): both years' CSVs are rebuilt and the totals move. Test lives in Task 8.
5. **Both devices edit the same expense offline with an identical `updatedAt`:** both devices end up with the same record. Test lives in Task 4.

---

### Task 1: Project scaffold, test harness, local server

**Files:**
- Create: `index.html`, `styles.css`, `manifest.webmanifest`, `js/config.js`, `js/app.js` (stub), `tests/index.html`, `tests/harness.js`, `.gitignore`, `.claude/launch.json`

**Interfaces:**
- Produces: `tests/harness.js` exports `test(name: string, fn: () => void|Promise<void>)`, `eq(actual, expected, msg?)` (deep-equal via JSON), `ok(cond, msg?)`, `throws(fn, msg?)`, `run(): Promise<{passed:number, failed:number}>`. `tests/index.html` imports every `*.test.js` listed in an array, calls `run()`, and writes `All N passed` or `F failed / N` into `<h1 id="result">` plus a list of failures.
- Produces: `js/config.js` exports `GOOGLE_CLIENT_ID = ""` and `APP_VERSION = "1.0.0"`.

- [ ] **Step 1:** `git init` in `projects/mile-marker`. `.gitignore` covers `.claude/settings.local.json`.
- [ ] **Step 2:** Write `.claude/launch.json` with configuration `mile-marker`: `runtimeExecutable: "python"`, `runtimeArgs: ["-m","http.server","8080"]`, `port: 8080`.
- [ ] **Step 3:** Write the harness and `tests/index.html` with one self-test: `test("harness works", () => eq(1+1, 2))`.
- [ ] **Step 4:** Start the preview, open `http://localhost:8080/tests/`. Expected: `All 1 passed`.
- [ ] **Step 5:** Write the `index.html` shell: header (logo `icons/icon.svg` at 32 px, title "Mile Marker", sync badge `#syncBadge`, settings button), the same markup regions as the road-ledger artifact (tiles, bars, cats, filters, log, FAB, sheets), and `<script type="module" src="js/app.js">`. Link `manifest.webmanifest`, `icons/favicon-32.png` and `icons/apple-touch-icon.png`. Move the artifact's CSS into `styles.css`, wrapped in a normal `<html><head>` document. Add `.badge` states `ok|wait|warn`.
- [ ] **Step 6:** `manifest.webmanifest`: `name` and `short_name` "Mile Marker", `start_url "./"`, `scope "./"`, `display "standalone"`, `background_color "#eef1ef"`, `theme_color "#0a6b3d"`, icons 192/512 (`purpose "any"`) plus maskable 192/512 (`purpose "maskable"`).
- [ ] **Step 7:** Open `http://localhost:8080/`. Expected: the styled empty shell with the logo and no console errors.
- [ ] **Step 8:** Commit `chore: scaffold Mile Marker PWA and browser test harness`.

### Task 2: money.js and names.js

**Files:** Create `js/money.js`, `js/names.js`, `tests/money.test.js`, `tests/names.test.js`

**Interfaces:**
- Produces: `parseCents(s: string): number|null`. Strips `$`, `,` and spaces. Accepts `^\d*(\.\d{0,2})?$` with at least one digit. Returns null for empty, negative or invalid input, or more than 2 decimals.
- Produces: `formatCents(c: number): string` returns `"$1,234.50"`, and `"-$5.00"` for negatives.
- Produces: `receiptName(date: string, vendor: string, cents: number, ext: string, taken?: Set<string>, id?: string): string`
- Produces: `safeFilePart(s: string): string`

- [ ] **Step 1: Failing tests:**
  - `parseCents("48.75")===4875`, `("$1,234.5")===123450`, `("12.")===1200`, `(".99")===99`, `("7")===700`
  - `parseCents` returns null for `("0.005")`, `("-5")`, `("abc")`, `("")`, `(".")`
  - `formatCents(123450)==="$1,234.50"`, `formatCents(-500)==="-$5.00"`, `formatCents(0)==="$0.00"`
  - `receiptName("2026-11-08","Love's Travel Stop",4875,"jpg")==="2026-11-08 Loves Travel Stop 48.75.jpg"`
  - `receiptName("2026-11-08",'A/B: "Shop"*?<>|',100,"pdf")==="2026-11-08 AB Shop 1.00.pdf"`
  - the emoji vendor `"🚚 Fuel"` gives `"2026-11-08 Fuel 1.00.jpg"`
  - an empty vendor after cleanup becomes `"receipt"`
  - a 200-char vendor gives a total length ≤ 120
  - with `taken` containing the plain name and `id="abcdef12-…"`, the result is `"2026-11-08 Loves Travel Stop 48.75 abcdef.jpg"`
- [ ] **Step 2:** Run `/tests/`. Expected: these fail (module not found).
- [ ] **Step 3:** Implement. `safeFilePart`: drop apostrophes, remove `\/:*?"<>|`, control characters and non-BMP characters (emoji), collapse whitespace, trim, cut to 80 chars. The amount uses plain `12.34` with no `$` or commas.
- [ ] **Step 4:** Run `/tests/`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: money parsing and receipt file names`.

### Task 3: totals.js and csv.js

**Files:** Create `js/totals.js`, `js/csv.js`, `tests/totals.test.js`, `tests/csv.test.js`

**Interfaces:**
- Consumes: `formatCents` is not used. The CSV writes plain decimals.
- Produces:
  - `visible(records): Expense[]` (removes `deleted`)
  - `yearTotal(records, year): number`
  - `monthTotals(records, year): number[12]`
  - `categoryTotals(records, year, month|null): [category, cents][]`, sorted descending
  - `missingReceipts(records, year): number` (no `receipt` and not deleted)
- Produces: `buildYearCsv(records, year): string`. Header `Date,Vendor,Category,Amount,Paid with,Items,Business purpose,Receipt file,No-receipt reason`. Rows sorted by date ascending, then a blank line, then `,,TOTAL,<sum>`. Line ending `\r\n`. A field containing `,` `"` or a newline is quoted with doubled `"`.

- [ ] **Step 1: Failing tests,** with a fixture of 5 records across 2026-01, 2026-11 (×2, one Food), 2025-12, and one 2026 tombstone:
  - `yearTotal(fx,2026)` equals the sum of the three live 2026 records
  - `monthTotals` index 10 holds the two November records
  - `categoryTotals(fx,2026,11)[0][0]` is the larger category
  - `missingReceipts` counts only live records with no receipt
  - the CSV's first line is the header
  - a vendor `Smith, "Big" Co` is written as `"Smith, ""Big"" Co"`
  - the CSV leaves out the tombstone and the 2025 row
  - the last line is `,,TOTAL,<x.xx>`
- [ ] **Step 2:** Run. Expected: fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: pass.
- [ ] **Step 5:** Commit `feat: totals and yearly CSV`.

### Task 4: merge.js (sync rules)

**Files:** Create `js/merge.js`, `tests/merge.test.js`

**Interfaces:**
- Produces: `pickWinner(local: Expense|undefined, remote: Expense): "remote"|"local"`
- Produces: `mergeSettings(local: {categories:string[], updatedAt:number}, remote: same|null): same` (the newer `updatedAt` wins, whole value)

- [ ] **Step 1: Failing tests:**
  - local undefined → `"remote"`
  - remote newer → `"remote"`
  - remote older → `"local"`
  - equal `updatedAt` with remote `deviceId "b"` vs local `"a"` → `"remote"`, and swapped → `"local"`
  - a remote tombstone that is newer → `"remote"`
  - running both devices' perspective on the same tie pair gives the same final record (Review Focus 5)
  - `mergeSettings` returns the newer one, and returns local when remote is null
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, see them pass.
- [ ] **Step 5:** Commit `feat: sync merge rules`.

### Task 5: store.js (IndexedDB)

**Files:** Create `js/store.js`, `tests/store.test.js`

**Interfaces:**
- Produces: `openStore(name = "mile-marker"): Promise<Store>`, where Store has:
  - `getAll(): Promise<Expense[]>` (tombstones included)
  - `get(id)`
  - `put(expense)`
  - `putBlob(id, blob)`, `getBlob(id): Promise<Blob|undefined>`, `deleteBlob(id)`
  - `queueGet(id)`, `queueAll(): Promise<QueueEntry[]>`, `queuePut(entry)`, `queueDelete(id)`
  - `getSetting(key)`, `setSetting(key, value)`
  - `clearSyncedBlobs(): Promise<number>` (deletes blobs whose expense has `receipt.driveId` and no queue entry needing a receipt upload, and returns the count)
  - `onChange(fn): () => void` (fires after any put/delete in this tab)
- `QueueEntry = {id, needsRecord: boolean, needsReceiptUpload: boolean, receiptToTrash: string[]}`
- Object stores: `expenses`, `blobs`, `queue` (all keyPath `id`, blobs stored as `{id, blob}`), and `settings` (keyPath `key`).

- [ ] **Step 1: Failing tests** (use the db name `mm-test-<random>` and delete it afterwards):
  - put then get round-trips a record
  - `getAll` includes a tombstone
  - a blob round-trips with the same `size` and `type`
  - a queue entry round-trips and `queueDelete` removes it
  - settings round-trip
  - `clearSyncedBlobs` deletes only the blob of the synced expense and returns 1
  - `onChange` fires on put
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement with raw IndexedDB, promise-wrapped, version 1.
- [ ] **Step 4:** Run, see them pass.
- [ ] **Step 5:** Commit `feat: IndexedDB store`.

### Task 6: Screens wired to the local store (offline app works with no Drive)

**Files:** Create `js/image.js`, `js/categories.js`, `js/ui/home.js`, `js/ui/form.js`, `js/ui/detail.js`, `js/ui/categories.js`. Modify `js/app.js`. Test: `tests/image.test.js`, `tests/categories.test.js`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `shrinkImage(file: Blob): Promise<Blob>` (JPEG, max side 2000, quality 0.85. Returns the original when it isn't an image, when it's SVG or GIF, when decoding fails, or when the result isn't smaller)
  - `BUILT_IN` (the Global Constraints list)
  - `allCategories(custom: string[]): string[]` (built-in first, then custom with case-insensitive duplicates dropped)
  - `addCategory(custom, name): {list, name}` (trims and collapses spaces, and returns the existing name on a case-insensitive match)
  - `app.js` exports `saveExpense(fields, receiptFile|null, opts)` and `deleteExpense(id)`, which write to the store and the queue and then call `requestSync()` (a no-op until Task 9)
  - Each `ui/*.js` exports `render…(state)` / `open…()` functions, ported from the road-ledger artifact's code and reading from store data instead of `claude.use("db")`.

- [ ] **Step 1: Failing tests:**
  - shrinking a 4000×3000 canvas PNG blob gives `type==="image/jpeg"` and a max side of 2000
  - a `text/plain` blob comes back unchanged
  - `allCategories(["gas","Laundry"])` ends with `"Laundry"` and doesn't repeat Gas
  - `addCategory([], "  Car  wash ")` gives `{list:["Car wash"], name:"Car wash"}`
  - `addCategory(["Car wash"], "car WASH").name === "Car wash"`
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement `image.js` and `categories.js`.
- [ ] **Step 4:** Run, see them pass.
- [ ] **Step 5:** Port the UI from `../road-ledger/index.html`:
  - Save writes the record with a new `updatedAt`, `deviceId` (from settings, created on first launch with `crypto.randomUUID()`), and stores the receipt blob under the expense id.
  - It sets the queue entry to `{needsRecord: true, needsReceiptUpload: !!newFile, receiptToTrash: [...old driveIds replaced or removed]}`.
  - Delete writes a tombstone (`deleted: true`), deletes the local blob, and queues the receipt's `driveId` for trash.
  - The receipt box has two buttons: "Take photo" (`accept="image/*" capture="environment"`) and "Choose file" (`accept="image/*,application/pdf"`).
  - Detail view shows the receipt from the local blob through `URL.createObjectURL`. When there's no blob locally it shows "Receipt not on this device yet".
  - Custom categories are stored under setting `categories` = `{categories, updatedAt}`.
  - CSV export downloads with `<a download>` from a Blob, file `Mile Marker <year>.csv`, using `buildYearCsv`.
  - If a store write rejects with `QuotaExceededError`, the form shows "This device is out of space. Open Settings → Free up space on this device." and the entry isn't lost from the form.
- [ ] **Step 6:** Manual check in the preview:
  1. Add an expense with an image file and one with "No receipt".
  2. The tiles, bars and categories update.
  3. Edit changes the month bar.
  4. Delete removes the expense from the list.
  5. Reloading keeps everything.
  6. CSV downloads.
  7. Phone width (375 px) has no horizontal scroll.
  8. Dark mode reads correctly.
- [ ] **Step 7:** Commit `feat: offline expense screens on IndexedDB`.

### Task 7: drive.js and fake drive

**Files:** Create `js/drive.js`, `tests/fake-drive.js`, `tests/fake-drive.test.js`

**Interfaces:**
- Produces the same `Drive` interface from both files. Every method is async and rejects with `{status:number, message}`.
  - `ensureFolders(): {rootId, receiptsId, recordsId}` (finds by name plus `appProperties.mileMarker`, otherwise creates)
  - `uploadFile({name, parentId, blob, mimeType, fileId?, appProperties?}): {id, modifiedTime}` (creates, or updates the content when `fileId` is given)
  - `listChanged(parentId, sinceIso|null): {files:[{id,name,modifiedTime}], serverTime}` (`serverTime` comes from the response's `Date` header, or for the fake from its clock)
  - `download(fileId): Blob`
  - `trash(fileId)`
  - `findByName(parentId, name): {id}|null`
  - `listNames(parentId): Set<string>`
  - `folderUrl(id): string`
- The real implementation is constructed as `new GoogleDrive(getToken: () => string)`. It uses `fetch` against `https://www.googleapis.com/drive/v3/files` and `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, queries with `'<parent>' in parents and trashed=false`, and retries 429/5xx at 1 s, 4 s and 15 s.
- The fake is constructed as `new FakeDrive({clock})`, keeps files in memory, can be shared by two "devices", and has `failNext(method, status)` for tests.

- [ ] **Step 1: Failing fake tests:**
  - `ensureFolders` twice returns the same ids
  - upload then `listChanged(recordsId, null)` lists the file
  - `listChanged` with a later `since` leaves it out
  - after `trash`, it's left out of the listing
  - `failNext("uploadFile",503)` rejects once with status 503
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement `FakeDrive`, then `GoogleDrive`. The real one is tested only manually in Task 10.
- [ ] **Step 4:** Run, see them pass.
- [ ] **Step 5:** Commit `feat: Drive client and in-memory fake`.

### Task 8: sync.js

**Files:** Create `js/sync.js`, `tests/sync.test.js`

**Interfaces:**
- Consumes: Store (Task 5), Drive (Task 7), `pickWinner` and `mergeSettings` (Task 4), `buildYearCsv` (Task 3), `receiptName` (Task 2).
- Produces: `createSync({store, drive, isOnline: () => boolean, hasToken: () => boolean, onState: (s) => void})`, which returns `{runPass(): Promise<SyncResult>, state}`.
  - `SyncState = {status: "synced"|"waiting"|"offline"|"tap"|"reconnect"|"error", waiting: number, lastSync: number|null, message?: string}`
  - `SyncResult = {pushed, pulled, csvYears: number[]}`
  - Calling `runPass` while one is running returns the running pass's promise.

- [ ] **Step 1: Failing tests** (two stores A and B with different `deviceId`, one shared `FakeDrive`):
  - A saves an expense with a receipt, then `runPass` on A, then on B. B has the record and the blob with the same size. B's `getAll` matches A's.
  - B edits, B syncs, A syncs. A has B's edit.
  - A deletes, both sync. B has a tombstone and no blob. The fake shows the receipt file trashed.
  - When offline, the state is `offline` with `waiting:1`, nothing is pushed, and the queue is kept.
  - When `hasToken()` is false, the state is `tap`.
  - `failNext("uploadFile",503)` on the record upload: after the receipt upload succeeded, the queue entry has `needsReceiptUpload:false` and the receipt's `driveId` saved. The next pass uploads the record only, and the fake shows exactly one receipt file (Review Focus 3).
  - Moving an expense's date from 2025-12-30 to 2026-01-02 gives `csvYears` containing both 2025 and 2026, and the 2025 CSV no longer has the row (Review Focus 4).
  - A second receipt with an identical name gets the id suffix (uses `drive.listNames`).
  - The CSV file for the year is created once, then updated in place (same file id).
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement following spec §4.
  - Write the receipt's `driveId` and name into the record and clear `needsReceiptUpload` before uploading the record.
  - Store Records file ids in the setting `recordFileIds` (`{[expenseId]: fileId}`) so updates replace files in place. On pull, fill it in from the listing.
  - Do the same for `csvFileIds` and `settingsFileId`.
  - `lastPullTime` = `serverTime` from `listChanged`.
  - A pulled record that won't parse is skipped with `console.warn`.
- [ ] **Step 4:** Run, see them pass.
- [ ] **Step 5:** Commit `feat: two-way Drive sync`.

### Task 9: auth.js, sync badge, settings sheet, sync triggers

**Files:** Create `js/auth.js`, `js/ui/settings.js`, `js/ui/badge.js`. Modify `js/app.js`, `index.html`. Test: `tests/badge.test.js`

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID` (Task 1), `createSync` (Task 8), `GoogleDrive` (Task 7).
- Produces:
  - `auth.init(): Promise<void>` (loads the GIS script)
  - `auth.hasToken(): boolean` (valid and >60 s left)
  - `auth.getToken(): string`
  - `auth.requestToken({interactive: boolean}): Promise<void>`. Must be called inside a tap handler. `interactive: false` uses `prompt: ''`, and `true` uses `prompt: 'consent'` the first time.
  - `auth.signOut()` (revokes and clears)
  - `auth.email(): string|null` (from the userinfo-free `tokeninfo` endpoint, or left blank if it's unavailable)
  - `auth.connected` (setting `driveConnected: boolean`)
- Produces: `badgeText(state: SyncState, now: number): {text, tone: "ok"|"wait"|"warn"}`. The exact copy:
  - `Synced · just now` (under 60 s), `Synced · 2m ago`, `Synced · 3h ago`
  - `3 waiting`
  - `Offline · 3 waiting`
  - `Tap to sync`
  - `Reconnect Drive`
  - `Drive is full` (for status 403 with a storageQuotaExceeded reason)
  - `Sync problem`
  - When not connected: `Connect Drive`

- [ ] **Step 1: Failing tests:** each `badgeText` case above with exact text and tone. `ok` for synced, `wait` for waiting/offline/tap/connect, `warn` for reconnect/full/problem.
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement `badge.js`, then `auth.js`, then `settings.js`. Settings contains:
  - Connect/Disconnect Google Drive, plus the email
  - Last sync
  - "Open Drive folder" (an `<a target=_blank>` to `drive.folderUrl(rootId)`)
  - "Free up space on this device" (calls `clearSyncedBlobs` and shows the count)
  - The version
  - A "Connect Google Drive" banner on Home while not connected
- [ ] **Step 4:** Wire the triggers in `app.js`:
  - launch, the `online` event, a 5-min interval when `document.visibilityState==="visible"`, and 3 s debounced after `saveExpense`/`deleteExpense`
  - a badge tap: if there's no token, call `requestToken({interactive:false})` first, falling back to `interactive:true` if that rejects
  - the Save button handler also calls `requestToken({interactive:false})` when connected and the token has expired
  - If `GOOGLE_CLIENT_ID` is empty, the badge shows `Connect Drive` and Settings explains that setup is needed.
- [ ] **Step 5:** Run the tests, see them pass. In the preview, the badge shows `Connect Drive` and Settings opens with no console errors.
- [ ] **Step 6:** Commit `feat: Google sign-in, sync badge and settings`.

### Task 10: Service worker, install, setup guide, real-device check

**Files:** Create `sw.js`, `docs/SETUP.md`. Modify `js/app.js`, `index.html`

**Interfaces:**
- Consumes: everything above.
- Produces: `sw.js` with cache name `mile-marker-v<APP_VERSION>`. It precaches every app file (the HTML, CSS, all `js/**`, the manifest, `icons/*`, and Google Fonts CSS is runtime-cached). It serves cache-first for same-origin GET and network-only for `googleapis.com` and `accounts.google.com`. On activate it deletes caches that don't match. `app.js` registers it, shows an "Update ready, tap to reload" toast on `controllerchange`, and shows the Install button from `beforeinstallprompt`.

- [ ] **Step 1:** Implement `sw.js` and the registration and install button.
- [ ] **Step 2:** Manual check in the preview:
  1. Load once.
  2. Set the browser to offline (DevTools network offline, or stop the server).
  3. Reload. The app still opens.
  4. Add an expense. The badge shows `Offline · 1 waiting` (when connected) or the list updates (when not connected).
  5. Restart the server and go back online. No errors.
- [ ] **Step 3:** Run `/tests/` one last time. Expected: all pass.
- [ ] **Step 4:** Write `docs/SETUP.md`: the user-facing steps from spec §7 (GitHub repo plus Pages, Google Cloud project, Drive API, the consent screen set to In production, the OAuth Web client with origins `https://<user>.github.io` and `http://localhost:8080`, pasting the ID into `js/config.js`, pushing, and installing on the phone and PC). Plain language, numbered, with one line on what each screen is called.
- [ ] **Step 5:** Commit `feat: offline service worker, install prompt, setup guide`.
- [ ] **Step 6 (with the user):** Walk through SETUP.md. On the phone in airplane mode, log an expense with a camera photo, turn airplane mode off, tap the badge. On the PC, tap the badge. The expense and photo appear. In Drive, `Mile Marker/Receipts/<name>.jpg` and `Mile Marker 2026.csv` exist. Fix anything found and commit.
