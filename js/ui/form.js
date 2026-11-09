// Add / edit expense sheet, including the receipt picker and the delete confirmation.
import { state, $, el, reload, todayStr } from "../state.js";
import { parseCents } from "../money.js";
import { allCategories } from "../categories.js";
import { addCustom, onCategoriesChanged } from "./categories.js";

let editing = null;
let pickedFile = null;
let removeReceipt = false;
let previewUrl = null;
let beforeSave = () => {};

/** Lets app.js hook the Save tap (used to renew the Google token inside the tap). */
export const setBeforeSave = fn => { beforeSave = fn; };

export function initForm() {
  $("addBtn").onclick = () => openForm(null);
  $("cancelBtn").onclick = closeForm;
  const pick = e => { const f = e.target.files[0]; if (f) { pickedFile = f; removeReceipt = false; setPreview(); } e.target.value = ""; };
  $("fCamera").onchange = pick;
  $("fFile").onchange = pick;
  $("rRemove").onclick = () => { pickedFile = null; if (editing && editing.receipt) removeReceipt = true; setPreview(); };
  $("fNoReceipt").onchange = e => { $("fNoReason").hidden = !e.target.checked; if (e.target.checked) $("fNoReason").focus(); };
  $("fCat").onchange = e => { const n = e.target.value === "__new"; $("fNewCat").hidden = !n; if (n) $("fNewCat").focus(); };
  $("form").onsubmit = onSubmit;
  $("delBtn").onclick = askDelete;
  $("confirmNo").onclick = () => { $("confirmSheet").hidden = true; };
  $("confirmYes").onclick = doDelete;
  onCategoriesChanged(() => rebuildCats());
}

function rebuildCats(keep) {
  const sel = $("fCat");
  const cur = keep !== undefined ? keep : sel.value;
  sel.textContent = "";
  const list = allCategories(state.custom);
  if (cur && cur !== "__new" && !list.includes(cur)) list.push(cur);
  for (const c of list) sel.appendChild(new Option(c, c));
  sel.appendChild(new Option("+ New category…", "__new"));
  if (cur) sel.value = cur;
}

export function openForm(e) {
  editing = e || null;
  pickedFile = null;
  removeReceipt = false;
  $("formTitle").textContent = e ? "Edit expense" : "New expense";
  $("fDate").value = e ? e.date : todayStr();
  $("fAmount").value = e ? (e.amountCents / 100).toFixed(2) : "";
  $("fVendor").value = e ? e.vendor : "";
  rebuildCats(e ? e.category : "Gas");
  $("fNewCat").hidden = true;
  $("fNewCat").value = "";
  $("fPay").value = e ? e.payment : "Business card";
  $("fItems").value = e ? e.items || "" : "";
  $("fPurpose").value = e ? e.purpose || "" : "";
  $("fNoReceipt").checked = !!(e && e.noReceipt);
  $("fNoReason").value = e ? e.noReceiptReason || "" : "";
  $("fNoReason").hidden = !$("fNoReceipt").checked;
  $("delBtn").hidden = !e;
  $("formErr").hidden = true;
  $("saveBtn").disabled = false;
  $("saveBtn").textContent = "Save";
  setPreview();
  $("formSheet").hidden = false;
  setTimeout(() => $(e ? "fVendor" : "fAmount").focus(), 50);
}

function closeForm() {
  $("formSheet").hidden = true;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
}

async function setPreview() {
  const p = $("rPreview");
  p.textContent = "";
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  let blob = null, label = "";
  if (pickedFile) { blob = pickedFile; label = pickedFile.name || "New receipt"; }
  else if (editing && editing.receipt && !removeReceipt) { blob = await state.store.getBlob(editing.id); label = editing.receipt.name || "Receipt on file"; }
  const has = !!(pickedFile || (editing && editing.receipt && !removeReceipt));
  if (blob && blob.type !== "application/pdf") {
    previewUrl = URL.createObjectURL(blob);
    const img = el("img"); img.src = previewUrl; img.alt = "Receipt preview";
    p.appendChild(img);
  } else if (has) {
    p.appendChild(el("strong", null, (blob && blob.type === "application/pdf" ? "PDF: " : "") + label));
  }
  $("rRemove").hidden = !has;
  $("cameraLbl").textContent = has ? "Retake photo" : "Take photo";
  $("fileLbl").textContent = has ? "Replace file" : "Choose file";
  $("fNoReceipt").closest("label").hidden = has;
  if (has) { $("fNoReceipt").checked = false; $("fNoReason").hidden = true; }
}

function formError(msg) {
  $("formErr").textContent = msg;
  $("formErr").hidden = false;
  $("saveBtn").disabled = false;
  $("saveBtn").textContent = "Save";
}

async function onSubmit(ev) {
  ev.preventDefault();
  try { beforeSave(); } catch (e) { console.warn(e); }
  const date = $("fDate").value;
  const cents = parseCents($("fAmount").value);
  const vendor = $("fVendor").value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return formError("Pick a date.");
  if (cents === null || cents <= 0) return formError("Enter the amount, like 48.75.");
  if (!vendor) return formError("Enter the vendor or place.");
  let category = $("fCat").value;
  if (category === "__new") {
    if (!$("fNewCat").value.trim()) return formError("Type a name for the new category.");
    category = await addCustom($("fNewCat").value);
  }
  $("saveBtn").disabled = true;
  $("saveBtn").textContent = "Saving…";
  $("formErr").hidden = true;
  const fields = {
    date, vendor, amountCents: cents, category, payment: $("fPay").value,
    items: $("fItems").value.trim(), purpose: $("fPurpose").value.trim(),
    noReceipt: $("fNoReceipt").checked, noReceiptReason: $("fNoReason").value.trim(),
  };
  try {
    const r = await state.expenses.save(fields, { existing: editing, file: pickedFile, removeReceipt });
    closeForm();
    if (r.year !== state.year) { state.year = r.year; $("year").value = String(r.year); }
    state.month = r.month;
    await reload();
  } catch (err) {
    console.error(err);
    if (err && err.name === "QuotaExceededError") return formError("This device is out of space. Open Settings → Free up space on this device.");
    formError("Couldn’t save. Try again.");
  }
}

function askDelete() {
  const e = editing;
  $("confirmText").textContent = e.vendor + ", $" + (e.amountCents / 100).toFixed(2) + " on " + e.date + "." +
    (e.receipt ? " The receipt moves to the trash in your Google Drive, where you can restore it for 30 days." : "");
  $("confirmSheet").hidden = false;
}

async function doDelete() {
  $("confirmYes").disabled = true;
  try {
    await state.expenses.remove(editing);
    $("confirmSheet").hidden = true;
    closeForm();
    await reload();
  } catch (err) {
    console.error(err);
    $("confirmText").textContent = "Couldn’t delete. Try again.";
  }
  $("confirmYes").disabled = false;
}
