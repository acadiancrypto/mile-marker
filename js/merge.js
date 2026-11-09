// Sync rules (pure): the newest edit wins; a tie goes to the higher deviceId so every device agrees.

export function pickWinner(local, remote) {
  if (!local) return "remote";
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? "remote" : "local";
  return String(remote.deviceId) > String(local.deviceId) ? "remote" : "local";
}

export function mergeSettings(local, remote) {
  if (!remote) return local;
  return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
}
