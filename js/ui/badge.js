// Sync badge text (pure) and rendering.

function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

/** state: {status, waiting, lastSync, connected} -> {text, tone: "ok"|"wait"|"warn"} */
export function badgeText(state, now) {
  if (!state.connected) return { text: "Connect Drive", tone: "wait" };
  switch (state.status) {
    case "offline": return { text: state.waiting ? "Offline · " + state.waiting + " waiting" : "Offline", tone: "wait" };
    case "tap": return { text: "Tap to sync", tone: "wait" };
    case "syncing": return { text: "Syncing…", tone: "wait" };
    case "reconnect": return { text: "Reconnect Drive", tone: "warn" };
    case "full": return { text: "Drive is full", tone: "warn" };
    case "error": return { text: "Sync problem", tone: "warn" };
  }
  if (state.waiting) return { text: state.waiting + " waiting", tone: "wait" };
  if (state.lastSync) return { text: "Synced · " + ago(now - state.lastSync), tone: "ok" };
  return { text: "Tap to sync", tone: "wait" };
}

export function renderBadge(el, state) {
  const { text, tone } = badgeText(state, Date.now());
  el.textContent = text;
  el.className = "badge " + tone;
  el.title = state.message ? "Last problem: " + state.message : "Tap to sync now";
}
