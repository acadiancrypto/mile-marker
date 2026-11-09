// Expense categories: built-in list plus the user's own.
export const BUILT_IN = ["Gas", "Food", "Rent", "Lodging", "Hygiene", "Tolls & parking", "Vehicle repair & maintenance", "Airfare & transit", "Supplies & tools", "Phone & internet", "Other"];

export function allCategories(custom) {
  const seen = new Set(BUILT_IN.map(c => c.toLowerCase()));
  const out = [...BUILT_IN];
  for (const c of custom || []) {
    const k = c.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
}

export function addCategory(custom, name) {
  const clean = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Type a category name.");
  const hit = allCategories(custom).find(c => c.toLowerCase() === clean.toLowerCase());
  if (hit) return { list: [...(custom || [])], name: hit };
  return { list: [...(custom || []), clean], name: clean };
}
