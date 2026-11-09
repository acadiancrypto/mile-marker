// Tiny browser test harness: test(), eq(), ok(), throws(), run().
const tests = [];
export const failures = [];

export function test(name, fn) { tests.push({ name, fn }); }

function show(v) { try { return JSON.stringify(v); } catch { return String(v); } }

export function eq(actual, expected, msg) {
  const a = show(actual), e = show(expected);
  if (a !== e) throw new Error((msg ? msg + ": " : "") + "expected " + e + ", got " + a);
}

export function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }

export function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || "expected to throw");
}

export function fail(name, err) { failures.push({ name, message: err && err.message ? err.message : String(err) }); }

export async function run() {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; }
    catch (err) { fail(t.name, err); }
  }
  return { passed, failed: failures.length, total: passed + failures.length };
}
