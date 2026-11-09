import { test, eq } from "./harness.js";
import { badgeText } from "../js/ui/badge.js";

const NOW = 1_800_000_000_000;
const s = (over) => ({ status: "synced", waiting: 0, lastSync: NOW - 10_000, connected: true, ...over });

test("badge: synced shows how long ago", () => {
  eq(badgeText(s({}), NOW), { text: "Synced · just now", tone: "ok" });
  eq(badgeText(s({ lastSync: NOW - 2 * 60_000 }), NOW), { text: "Synced · 2m ago", tone: "ok" });
  eq(badgeText(s({ lastSync: NOW - 3 * 3600_000 }), NOW), { text: "Synced · 3h ago", tone: "ok" });
  eq(badgeText(s({ lastSync: NOW - 50 * 3600_000 }), NOW), { text: "Synced · 2d ago", tone: "ok" });
});

test("badge: waiting, offline and tap", () => {
  eq(badgeText(s({ status: "waiting", waiting: 3 }), NOW), { text: "3 waiting", tone: "wait" });
  eq(badgeText(s({ status: "synced", waiting: 2 }), NOW), { text: "2 waiting", tone: "wait" });
  eq(badgeText(s({ status: "offline", waiting: 3 }), NOW), { text: "Offline · 3 waiting", tone: "wait" });
  eq(badgeText(s({ status: "offline", waiting: 0 }), NOW), { text: "Offline", tone: "wait" });
  eq(badgeText(s({ status: "tap", waiting: 1 }), NOW), { text: "Tap to sync", tone: "wait" });
  eq(badgeText(s({ status: "syncing" }), NOW), { text: "Syncing…", tone: "wait" });
});

test("badge: problems are amber", () => {
  eq(badgeText(s({ status: "reconnect" }), NOW), { text: "Reconnect Drive", tone: "warn" });
  eq(badgeText(s({ status: "full" }), NOW), { text: "Drive is full", tone: "warn" });
  eq(badgeText(s({ status: "error" }), NOW), { text: "Sync problem", tone: "warn" });
});

test("badge: not connected", () => {
  eq(badgeText(s({ connected: false, status: "waiting", waiting: 4 }), NOW), { text: "Connect Drive", tone: "wait" });
});
