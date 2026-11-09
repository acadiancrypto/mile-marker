// Settings sheet and the "Connect Google Drive" banner.
import { state, $ } from "../state.js";
import { APP_VERSION } from "../config.js";
import * as auth from "../auth.js";

let actions = { connect: () => {}, disconnect: () => {}, syncNow: () => {} };
let info = { connected: false, email: null, lastSync: null, folderUrl: null };

export function initSettings(handlers) {
  actions = handlers;
  $("sVersion").textContent = APP_VERSION;
  $("settingsBtn").onclick = () => { renderSettings(); $("settingsSheet").hidden = false; };
  $("sClose").onclick = () => { $("settingsSheet").hidden = true; };
  $("sConnect").onclick = () => actions.connect();
  $("bannerConnect").onclick = () => actions.connect();
  $("sDisconnect").onclick = () => actions.disconnect();
  $("sSync").onclick = () => actions.syncNow();
  $("sFree").onclick = async () => {
    const n = await state.store.clearSyncedBlobs();
    $("sFreeMsg").textContent = n ? "Removed " + n + (n === 1 ? " receipt copy" : " receipt copies") + " from this device. They’re still in Google Drive." : "Nothing to remove. Only receipts already in Google Drive can be cleared.";
    $("sFreeMsg").hidden = false;
  };
}

export function updateSettings(patch) {
  Object.assign(info, patch);
  $("connectBanner").hidden = info.connected || !auth.configured();
  if (!$("settingsSheet").hidden) renderSettings();
}

function renderSettings() {
  const ok = auth.configured();
  $("sSetupNote").hidden = ok;
  $("sDrive").textContent = !ok ? "Not set up" : info.connected ? "Connected" + (info.email ? " as " + info.email : "") : "Not connected";
  $("sLast").textContent = info.lastSync ? new Date(info.lastSync).toLocaleString() : "Never";
  $("sConnect").hidden = !ok || info.connected;
  $("sSync").hidden = !info.connected;
  $("sDisconnect").hidden = !info.connected;
  $("sFolder").hidden = !(info.connected && info.folderUrl);
  if (info.folderUrl) $("sFolder").href = info.folderUrl;
  $("sFreeMsg").hidden = true;
}
