// Shared screen state and a tiny render hub.
const now = new Date();

export const state = {
  records: [],          // every record on this device, tombstones included
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  scope: "month",       // "month" | "year"
  q: "",
  custom: [],           // custom categories
  store: null,
  expenses: null,
};

export const $ = id => document.getElementById(id);

const renderers = [];
export const onRender = fn => renderers.push(fn);
export const rerender = () => renderers.forEach(fn => fn());

export async function reload() {
  state.records = await state.store.getAll();
  rerender();
}

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
