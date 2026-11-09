// Expense detail sheet, showing the receipt from this device.
import { state, $, el, MONTH_FULL } from "../state.js";
import { formatCents } from "../money.js";
import { openForm } from "./form.js";

let current = null;
let objectUrl = null;

export function initDetail() {
  $("dClose").onclick = closeDetail;
  $("dEdit").onclick = () => { const e = current; closeDetail(); openForm(e); };
}

function closeDetail() {
  $("detailSheet").hidden = true;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
}

export async function openDetail(e) {
  current = e;
  $("dTitle").textContent = e.vendor;
  $("dAmt").textContent = formatCents(e.amountCents);
  const dl = $("dList");
  dl.textContent = "";
  const add = (k, v) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); };
  const [y, m, d] = e.date.split("-");
  add("Date", MONTH_FULL[+m - 1] + " " + (+d) + ", " + y);
  add("Category", e.category);
  add("Paid with", e.payment);
  add("Items", e.items);
  add("Purpose", e.purpose);
  add("Receipt", e.receipt ? (e.receipt.name || "On this device, waiting to sync") : "None" + (e.noReceiptReason ? " — " + e.noReceiptReason : ""));

  const box = $("dReceipt");
  box.textContent = "";
  $("detailSheet").hidden = false;
  if (!e.receipt) return;
  const blob = await state.store.getBlob(e.id);
  if (current !== e) return;
  if (!blob) { box.appendChild(el("p", "muted", "Receipt not on this device yet. It downloads at the next sync.")); return; }
  objectUrl = URL.createObjectURL(blob);
  if ((blob.type || e.receipt.type) === "application/pdf") {
    const a = el("a", null, "Open receipt PDF");
    a.href = objectUrl; a.target = "_blank"; a.rel = "noopener";
    box.appendChild(a);
  } else {
    const img = el("img");
    img.src = objectUrl;
    img.alt = "Receipt for " + e.vendor;
    box.appendChild(img);
  }
}
