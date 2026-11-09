# Mile Marker: Offline Expense & Receipt App, Design

Date: 2026-11-08
Status: Approved in chat, waiting for written review

## 1. Purpose

A personal expense log for someone who works on the road. It has to:

- run as one installed app on an Android phone and a Windows PC
- work fully offline (open the app, log expenses, take receipt photos)
- sync by itself through the user's Google Drive when online, so receipts photographed on the phone show up on the PC
- show monthly and yearly totals, and keep records that are ready for an IRS audit (receipts, business purpose, CSV export)

Single user. There's no multi-user sharing. It replaces the claude.ai artifact version (https://claude.ai/artifact/87v6Va2ea1G9xv5mGEfSve), which can't work offline. That version holds no real data, so there's no migration.

**Success looks like this:** an expense with a photo logged on the phone in airplane mode shows up, with its photo, on the PC within a few minutes of the phone getting signal back, and that year's CSV and receipt files can be browsed in Google Drive without the app.

## 2. Architecture

An installable web app (PWA), plain HTML/CSS/JS ES modules, no build step, hosted on GitHub Pages over HTTPS.

| Piece | Choice |
|---|---|
| Offline shell | A service worker caches the app files (cache first, versioned cache name, old caches deleted on activate) |
| Local storage | IndexedDB through a small wrapper of our own (no dependency) |
| Google sign-in | Google Identity Services token client (`https://accounts.google.com/gsi/client`), scope `https://www.googleapis.com/auth/drive.file` only |
| Drive access | Drive REST API v3 called with `fetch` (multipart upload, list, get media, update, trash) |
| Install | Web app manifest (name "Mile Marker", icons 192/512 plus maskable, `display: standalone`), plus an install button on `beforeinstallprompt` |

`drive.file` is a non-sensitive scope: the app sees only the files it creates, and the Google Cloud project doesn't need Google's verification.

### Module layout (`projects/mile-marker/`)

```
index.html          app shell and markup
styles.css          the existing Road Ledger visual design, renamed
manifest.webmanifest
sw.js               service worker
icons/              app icons
js/
  app.js            starts up, routes between screens, ties modules together
  ui/*.js           screens: home, expense form, detail, categories, settings
  money.js          parse and format cents                       (pure)
  totals.js         month, year and category totals; missing count (pure)
  csv.js            build the yearly CSV                         (pure)
  names.js          receipt filenames, safe file-name cleanup    (pure)
  merge.js          sync rules: local record vs remote record    (pure)
  image.js          shrink photos to JPEG, max side 2000px, quality 0.85
  store.js          IndexedDB: expenses, blobs, settings, sync queue
  drive.js          Drive REST wrapper (folders, upload, list, download, trash)
  auth.js           GIS token client, token cache, reconnect state
  sync.js           runs a sync pass using store, drive and merge
tests/
  index.html        browser test runner (a small assert harness, no Node needed)
  *.test.js         tests for the pure modules and for sync against a fake Drive
```

Pure modules have no DOM or network access, so they can be tested on their own. Node isn't installed on this PC, so tests run in the browser from `tests/index.html`.

## 3. Data

### Expense record (the same shape locally and in Drive)

```json
{
  "id": "uuid",
  "date": "2026-11-08", "year": 2026, "month": 11,
  "vendor": "Love's Travel Stop", "amountCents": 4875,
  "category": "Gas", "payment": "Business card",
  "items": "", "purpose": "",
  "receipt": { "driveId": "…", "name": "2026-11-08 Loves Travel Stop 48.75.jpg", "type": "image/jpeg" } | null,
  "noReceipt": false, "noReceiptReason": "",
  "deleted": false,
  "createdAt": 1731000000000, "updatedAt": 1731000000000, "deviceId": "uuid"
}
```

Money is always whole cents.

### IndexedDB stores (on each device)

- `expenses`: records keyed by `id`, including tombstones (records with `deleted: true`)
- `blobs`: receipt files keyed by expense `id` (local copy of the photo or PDF)
- `queue`: pending work keyed by expense `id`: `{needsRecord, needsReceiptUpload, receiptToTrash}`
- `settings`: `deviceId`, custom categories plus their `updatedAt`, Drive folder ids, `lastPullTime`, the token's expiry time (never the token itself across sessions)

### Google Drive layout

```
Mile Marker/
  Receipts/   "<date> <vendor> <amount>.<ext>"   e.g. 2026-11-08 Loves Travel Stop 48.75.jpg
  Records/    "<id>.json"   one per expense, tombstones included
  settings.json             custom categories + updatedAt
  Mile Marker <year>.csv    rewritten after a sync that changed that year
```

The app finds folders by name plus the `appProperties.mileMarker` tag, and creates them if they're missing. Receipt names are cleaned of characters Windows and Drive don't allow, and a short id suffix is added if the name is already taken.

## 4. Sync

A sync pass runs at launch, on the `online` event, every 5 minutes while the app is open and visible, after each save (debounced 3 s), and when the user taps the badge. Only one pass runs at a time.

1. **Check:** skip if offline or not connected. Google access tokens from the GIS token client last about 1 hour, and renewing one opens a brief popup that browsers only allow during a user tap. So: if the token is valid, continue. If it has expired, set the state to "Tap to sync" and stop. The app requests a new token (`prompt: ''`, which usually closes by itself with no questions) inside the handler of the user's next tap on Save, the badge or Sync now, then runs the pass. **Known limitation:** after an hour away, the first sync waits for one tap. Saves are never blocked.
2. **Push:** for each queue entry:
   - upload the receipt blob if it's waiting (multipart, into Receipts/), and store its `driveId` in the record
   - create or update `Records/<id>.json`
   - move any replaced or removed receipt file to Drive's trash (`trashed: true`, never deleted for good)
   - clear the queue entry only after every step succeeds
3. **Pull:** list `Records/` files with `modifiedTime > lastPullTime − 2 min` (the overlap covers clock skew), download each, then apply `merge.js`:
   - the record doesn't exist locally → take the remote one
   - the remote `updatedAt` is newer → take the remote one (on a tie, the higher `deviceId` wins, so every device ends up the same)
   - otherwise keep the local one
   - when a remote record that wins brings a receipt this device doesn't have, download the receipt blob in the background
   - when a remote record that wins is a tombstone, delete the local blob
4. **Settings:** the newer of local and remote `settings.json` wins; merge the category lists by `updatedAt`.
5. **CSV:** for each year touched in this pass, rebuild `Mile Marker <year>.csv` from local records (tombstones left out) and upload it.
6. Save `lastPullTime` as the server time from the list response.

Deleting creates a tombstone (`deleted: true`, a new `updatedAt`) instead of removing the record, so the other device finds out. The receipt goes to Drive's trash. Tombstones never show in the UI.

**Freeing up space:** in Settings, "Free up space on this device" deletes local copies of receipts that are already synced. When one is viewed later, it downloads again (if online).

## 5. Screens

These carry over from the artifact version: home (this month, year so far, missing receipts, monthly bars you can tap, category bars, list with search, month/year filter), add/edit sheet, detail sheet, category manager (built-in Gas, Food, Rent, Lodging, Hygiene, Tolls & parking, Vehicle repair & maintenance, Airfare & transit, Supplies & tools, Phone & internet, Other, plus custom ones), the IRS record-keeping note, and CSV export (a local file download).

New:

- **Receipt controls:** a "Take photo" button (`<input type=file accept=image/* capture=environment>`) and a "Choose file" button (images or PDF).
- **Sync badge** in the header: `Synced · 2m ago` / `3 waiting` / `Offline · 3 waiting` / `Tap to sync` / `Reconnect Drive` (amber) / `Sync problem` (amber). Tap it to sync now. When something failed, a short message says what.
- **Settings sheet:** connect or disconnect Google Drive (shows the account email), last sync time, an "Open Drive folder" link, "Free up space on this device", and the app version.
- **Install button:** shown when the browser offers installation and hidden after install.
- **First launch:** an empty home screen that says how to add the first expense, plus a "Connect Google Drive" banner. The app works fully before you connect, and items wait in the queue.

## 6. Errors

| Situation | What happens |
|---|---|
| Offline | Saves to the device. Badge shows Offline plus the waiting count. Sync resumes on `online` |
| Token expired | Badge says "Tap to sync". The next tap on Save, the badge or Sync now renews the token silently and syncs. The queue is kept |
| Consent revoked / Google account signed out | Badge says "Reconnect Drive" (amber). Tapping it opens the full Google sign-in. The queue is kept |
| Drive 403 storage full | Badge shows "Drive is full". Items stay waiting |
| Drive 429 / 5xx | Retry with backoff (1 s, 4 s, 15 s) within the pass, then wait for the next pass |
| Receipt the app can't read (HEIC without decode support, etc.) | Upload the original file if Drive accepts it, and save it locally either way |
| IndexedDB quota exceeded | Show a message suggesting "Free up space on this device" |
| A remote record that won't parse | Skip it and log it to the console. It doesn't block the rest |

## 7. Setup (the user does this with guidance)

1. Create a GitHub account and a public repo `mile-marker`, then turn on Pages (from the main branch, root folder).
2. Create a Google Cloud project, turn on the Google Drive API, and set up the OAuth consent screen (External; app name Mile Marker; scope drive.file; set it to "In production" so the grant doesn't lapse after 7 days as it does in testing mode. That's allowed without verification because drive.file is non-sensitive). Create an OAuth client ID (Web), with the authorized JavaScript origins `https://<user>.github.io` and `http://localhost:8080` for local testing.
3. Paste the client ID into `js/config.js`, then push.
4. On the phone (Chrome) and the PC (Chrome or Edge): open the site, tap Install, open Settings, then Connect Google Drive.

## 8. Testing

- **Automated (browser runner):** money parsing and formatting, totals by month, year and category, CSV escaping and totals, receipt file names (forbidden characters, length, duplicates), every merge case (new, newer, older, tie, tombstone), and a full sync pass against an in-memory fake Drive (push, then pull on a second fake device, then a conflict, then a delete).
- **Manual here:** run the app on localhost in the browser pane, check the screens, use offline mode (service worker serves the app shell, saves queue up), and try the install prompt.
- **Manual with the user after setup:** real Drive connect, a phone photo in airplane mode syncing to the PC, the yearly CSV and receipt files showing in Drive, reconnecting after the token expires.

## 9. Out of scope (for now)

Mileage tracking, sharing with an accountant, reading receipt text automatically, a Play Store listing, background sync while the app is closed (Background Sync isn't reliable on all devices; syncing happens whenever the app is open).
