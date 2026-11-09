// Mile Marker app entry point.
import { APP_VERSION } from "./config.js";
import { state, $, reload } from "./state.js";
import { openStore } from "./store.js";
import { createExpenses } from "./expenses.js";
import { initHome } from "./ui/home.js";
import { initForm } from "./ui/form.js";
import { initDetail } from "./ui/detail.js";
import { initCategories, loadCategories } from "./ui/categories.js";

let syncHook = () => {};
/** Ask for a sync soon (wired up when Drive sync is connected). */
export const requestSync = () => syncHook();
export const setSyncHook = fn => { syncHook = fn; };

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
  return state;
}

export const ready = boot();
