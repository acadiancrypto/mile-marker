// Home screen: totals, monthly bars, category bars, the expense list and CSV export.
import { state, $, onRender, rerender, el, MON, MONTH_FULL } from "../state.js";
import { formatCents } from "../money.js";
import { visible, yearTotal, monthTotals, categoryTotals, missingReceipts } from "../totals.js";
import { buildYearCsv } from "../csv.js";
import { openDetail } from "./detail.js";

export function initHome() {
  const sel = $("year");
  const cur = new Date().getFullYear();
  for (let y = cur; y >= cur - 7; y--) sel.appendChild(new Option(String(y), String(y)));
  sel.value = String(state.year);
  sel.onchange = () => {
    state.year = +sel.value;
    state.month = state.year === cur ? new Date().getMonth() + 1 : 12;
    rerender();
  };
  $("chipMonth").onclick = () => { state.scope = "month"; rerender(); };
  $("chipYear").onclick = () => { state.scope = "year"; rerender(); };
  $("search").oninput = e => { state.q = e.target.value; rerender(); };
  $("exportBtn").onclick = exportCsv;
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(rerender, 150); });
  onRender(renderHome);
}

function exportCsv() {
  const blob = new Blob([buildYearCsv(state.records, state.year)], { type: "text/csv" });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Mile Marker " + state.year + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function renderHome() {
  const now = new Date();
  const live = visible(state.records).filter(r => r.year === state.year);
  const monthItems = live.filter(r => r.month === state.month);
  const isCur = state.year === now.getFullYear() && state.month === now.getMonth() + 1;
  const monthSum = monthItems.reduce((a, r) => a + r.amountCents, 0);

  $("tMonthLbl").textContent = isCur ? "This month" : MONTH_FULL[state.month - 1] + " " + state.year;
  $("tMonth").textContent = formatCents(monthSum);
  $("tMonthSub").textContent = monthItems.length + (monthItems.length === 1 ? " expense" : " expenses");
  $("tYearLbl").textContent = state.year === now.getFullYear() ? "Year to date" : state.year + " total";
  $("tYear").textContent = formatCents(yearTotal(state.records, state.year));
  $("tYearSub").textContent = live.length + (live.length === 1 ? " expense" : " expenses");
  const missing = missingReceipts(state.records, state.year);
  $("tMissing").textContent = missing;
  $("tMissingSub").textContent = missing ? "in " + state.year + " (no receipt on file)" : "every expense has a receipt";

  const byM = monthTotals(state.records, state.year);
  const max = Math.max(...byM, 1);
  const bars = $("bars");
  bars.textContent = "";
  byM.forEach((v, i) => {
    const b = el("button", "bar" + (i + 1 === state.month ? " sel" : ""));
    b.type = "button";
    b.title = MONTH_FULL[i] + ": " + formatCents(v);
    b.setAttribute("aria-label", MONTH_FULL[i] + " " + formatCents(v));
    const c = el("div", "col");
    c.style.height = (v / max * 100) + "%";
    b.append(c, el("span", "m", window.innerWidth > 500 ? MON[i] : MON[i][0]));
    b.onclick = () => { state.month = i + 1; state.scope = "month"; rerender(); };
    bars.appendChild(b);
  });

  const cats = categoryTotals(state.records, state.year, state.scope === "month" ? state.month : null);
  $("catScope").textContent = state.scope === "month" ? MONTH_FULL[state.month - 1] : "All of " + state.year;
  const cw = $("cats");
  cw.textContent = "";
  if (!cats.length) { const p = el("p", "muted", "Nothing logged for this period yet."); p.style.margin = "0"; cw.appendChild(p); }
  const cmax = cats.length ? cats[0][1] : 1;
  for (const [c, v] of cats) {
    const d = el("div", "cat");
    const t = el("div", "track");
    const f = el("div", "fill");
    f.style.width = (v / cmax * 100) + "%";
    t.appendChild(f);
    d.append(el("span", null, c + (c === "Food" ? " (business meals 50%)" : "")), el("span", "num", formatCents(v)), t);
    cw.appendChild(d);
  }

  $("chipMonth").textContent = isCur ? "This month" : MONTH_FULL[state.month - 1];
  $("chipMonth").setAttribute("aria-pressed", String(state.scope === "month"));
  $("chipYear").setAttribute("aria-pressed", String(state.scope === "year"));
  const q = state.q.trim().toLowerCase();
  let list = state.scope === "month" ? monthItems : live;
  if (q) list = list.filter(r => [r.vendor, r.items, r.purpose, r.category, r.payment].join(" ").toLowerCase().includes(q));
  list = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  $("logTitle").textContent = state.scope === "month" ? MONTH_FULL[state.month - 1] + " expenses" : state.year + " expenses";
  $("logTotal").textContent = list.length ? formatCents(list.reduce((a, r) => a + r.amountCents, 0)) : "";

  const log = $("log");
  log.textContent = "";
  if (!list.length) {
    const d = el("div", "empty");
    d.append(el("strong", null, q ? "No matches" : "No expenses here yet"),
      el("span", null, q ? "Try a different search." : "Tap “+ Add expense” to log gas, food, lodging or anything else. Snap the receipt, or type it in if you don’t have one."));
    log.appendChild(d);
    return;
  }
  for (const r of list) {
    const row = el("button", "row");
    row.type = "button";
    const [, m, dd] = r.date.split("-");
    const dt = el("div", "date");
    dt.append(el("b", null, String(+dd)), el("span", null, MON[+m - 1]));
    const what = el("div", "what");
    const meta = el("div", "meta");
    meta.append(el("span", null, r.category), el("span", "pill " + (r.receipt ? "ok" : "warn"), r.receipt ? "Receipt" : "No receipt"));
    what.append(el("div", "vendor", r.vendor), meta);
    row.append(dt, what, el("div", "amt num", formatCents(r.amountCents)));
    row.onclick = () => openDetail(r);
    log.appendChild(row);
  }
}
