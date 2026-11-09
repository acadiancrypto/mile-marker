// Mile Marker app entry point.
import { APP_VERSION } from "./config.js";
import { state, $, reload } from "./state.js";
import { openStore } from "./store.js";
import { createExpenses } from "./expenses.js";
import { initHome } from "./ui/home.js";
import { initForm } from "./ui/form.js";
import { initDetail, setReceiptFetcher } from "./ui/detail.js";
import { initCategories, loadCategories } from "./ui/categories.js";
import { setBeforeSave } from "./ui/form.js";
import { initSettings, updateSettings } from "./ui/settings.js";
import { renderBadge } from "./ui/badge.js";
import { GoogleDrive } from "./drive.js";
import { createSync } from "./sync.js";
import * as auth from "./auth.js";

const SAVE_DEBOUNCE_MS = 3000;
const INTERVAL_MS = 5 * 60 * 1000;

let sync = null;
let connected = false;
let needsInteractive = false;
let saveTimer = null;
let syncState = { status: "waiting", waiting: 0, lastSync: null };

const showBadge = () => renderBadge($("syncBadge"), { ...syncState, connected: connected && auth.configured() });

/** Ask for a sync a few seconds from now (after saves). */
export function requestSync() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(runSync, SAVE_DEBOUNCE_MS);
  if (state.store) state.store.queueAll().then(q => { syncState = { ...syncState, waiting: q.length }; showBadge(); });
}

async function runSync() {
  if (!sync || !connected || !auth.configured()) return;
  const r = await sync.runPass();
  await loadCategories();
  if (r.pulled) await reload();
  const f = await state.store.getSetting("folders");
  updateSettings({ lastSync: syncState.lastSync, folderUrl: f ? "https://drive.google.com/drive/folders/" + f.rootId : null });
}

/** Called inside a tap: get a token (quietly if possible), then sync. */
async function tapSync() {
  if (!auth.configured()) { $("settingsBtn").click(); return; }
  if (!connected) { await connect(); return; }
  if (!auth.hasToken()) {
    try { await auth.requestToken({ interactive: needsInteractive }); needsInteractive = false; }
    catch (err) {
      console.warn("Token request failed", err);
      needsInteractive = true;
      syncState = { ...syncState, status: "reconnect", message: "Google needs you to sign in again." };
      showBadge();
      return;
    }
  }
  await runSync();
}

async function connect() {
  try {
    await auth.init();
    await auth.requestToken({ interactive: true });
  } catch (err) {
    console.warn("Connect failed", err);
    showStatus(err && err.error === "scope_not_granted"
      ? "Mile Marker needs permission to save its own files in your Drive. Tap Connect again and tick the Drive box."
      : "Couldn’t connect to Google Drive. Check your connection and try again.");
    return;
  }
  showStatus("");
  connected = true;
  needsInteractive = false;
  await state.store.setSetting("driveConnected", true);
  updateSettings({ connected: true, email: await auth.fetchEmail() });
  showBadge();
  await runSync();
}

async function disconnect() {
  auth.signOut();
  connected = false;
  await state.store.setSetting("driveConnected", false);
  updateSettings({ connected: false, email: null });
  showBadge();
}

async function startSync() {
  sync = createSync({
    store: state.store,
    drive: new GoogleDrive(auth.getToken),
    isOnline: () => navigator.onLine,
    hasToken: auth.hasToken,
    onState: s => { syncState = s; showBadge(); },
    onUnauthorized: () => auth.clearToken(),
  });
  setReceiptFetcher(rec => (connected && navigator.onLine && auth.hasToken() ? sync.fetchReceipt(rec) : null));
  connected = !!(await state.store.getSetting("driveConnected"));
  initSettings({ connect, disconnect, syncNow: tapSync });
  updateSettings({ connected });
  $("syncBadge").onclick = tapSync;
  setBeforeSave(() => {
    if (connected && auth.configured() && !auth.hasToken() && !needsInteractive) {
      auth.requestToken({ interactive: false }).then(() => requestSync()).catch(() => { needsInteractive = true; });
    }
  });
  window.addEventListener("online", runSync);
  window.addEventListener("offline", () => { syncState = { ...syncState, status: "offline" }; showBadge(); });
  setInterval(() => { if (document.visibilityState === "visible") runSync(); }, INTERVAL_MS);
  setInterval(showBadge, 30_000);
  const q = await state.store.queueAll();
  syncState = { ...syncState, waiting: q.length };
  showBadge();
  if (auth.configured()) auth.init().catch(err => console.warn(err.message));
  if (connected) runSync();
}

function showStatus(msg) { $("status").textContent = msg || ""; $("status").hidden = !msg; }

async function boot() {
  $("sVersion").textContent = APP_VERSION;
  initHome();
  initForm();
  initDetail();
  initCategories();
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    for (const id of ["confirmSheet", "catSheet", "settingsSheet", "detailSheet", "formSheet"]) {
      if (!$(id).hidden) { $(id).hidden = true; break; }
    }
  });

  try {
    state.store = await openStore();
  } catch (err) {
    console.error(err);
    showStatus("This browser blocked on-device storage, so nothing can be saved. Turn off private browsing and reload.");
    $("addBtn").hidden = true;
    return;
  }
  let deviceId = await state.store.getSetting("deviceId");
  if (!deviceId) { deviceId = crypto.randomUUID(); await state.store.setSetting("deviceId", deviceId); }
  state.deviceId = deviceId;
  state.expenses = createExpenses({ store: state.store, deviceId, onSaved: () => requestSync() });
  await loadCategories();
  await reload();
  await startSync();
  return state;
}

function initInstallAndUpdates() {
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; deferred = null; });
  $("installBtn").onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $("installBtn").hidden = true;
  };

  if (!("serviceWorker" in navigator)) return;
  const toast = $("toast");
  const offerUpdate = worker => {
    toast.textContent = "Update ready · tap to reload";
    toast.hidden = false;
    toast.onclick = () => worker.postMessage("skipWaiting");
  };
  navigator.serviceWorker.register("sw.js", { type: "module" }).then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
  }).catch(err => console.warn("Offline mode unavailable:", err));
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

initInstallAndUpdates();
export const ready = boot();
