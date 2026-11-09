// Category list sheet and the custom-category setting.
import { state, $, el } from "../state.js";
import { BUILT_IN, allCategories, addCategory } from "../categories.js";

const listeners = [];
export const onCategoriesChanged = fn => listeners.push(fn);

export async function loadCategories() {
  const s = await state.store.getSetting("categories");
  state.custom = s && Array.isArray(s.categories) ? s.categories : [];
}

export async function saveCustom(list) {
  await state.store.setSetting("categories", { categories: list, updatedAt: Date.now() });
  state.custom = list;
  listeners.forEach(fn => fn());
}

/** Adds (or reuses) a category and returns its final name. */
export async function addCustom(name) {
  const r = addCategory(state.custom, name);
  if (r.list.length !== state.custom.length) await saveCustom(r.list);
  return r.name;
}

export function initCategories() {
  $("manageCats").onclick = () => { $("catErr").hidden = true; $("catNew").value = ""; renderList(); $("catSheet").hidden = false; };
  $("catClose").onclick = () => { $("catSheet").hidden = true; };
  const add = async () => {
    $("catErr").hidden = true;
    try { await addCustom($("catNew").value); $("catNew").value = ""; renderList(); }
    catch (err) { $("catErr").textContent = err.message || "Couldn’t save the category."; $("catErr").hidden = false; }
  };
  $("catAdd").onclick = add;
  $("catNew").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  onCategoriesChanged(() => { if (!$("catSheet").hidden) renderList(); });
}

function renderList() {
  const l = $("catList");
  l.textContent = "";
  for (const c of allCategories(state.custom)) {
    const row = el("div", "catrow");
    row.appendChild(el("span", null, c));
    if (BUILT_IN.includes(c)) row.appendChild(el("span", "fixed", "Built in"));
    else {
      const b = el("button", "btn danger", "Remove");
      b.type = "button";
      b.onclick = async () => { b.disabled = true; await saveCustom(state.custom.filter(x => x !== c)); renderList(); };
      row.appendChild(b);
    }
    l.appendChild(row);
  }
}
