// Google sign-in with the Google Identity Services token client (drive.file scope only).
// Access tokens last about an hour. Renewing one opens a popup, which browsers only allow during a tap,
// so requestToken() must be called from inside a click/submit handler.
import { GOOGLE_CLIENT_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GSI = "https://accounts.google.com/gsi/client";
const KEY = "mm-token";

let client = null;
let token = null;
let expiresAt = 0;
let loading = null;

try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
  if (saved && saved.expiresAt > Date.now()) { token = saved.token; expiresAt = saved.expiresAt; }
} catch { /* storage blocked */ }

export const configured = () => !!GOOGLE_CLIENT_ID;
export const hasToken = () => !!token && Date.now() < expiresAt - 60_000;
export const getToken = () => token;

/** Loads the Google script ahead of time so a later tap can open the popup right away. */
export function init() {
  if (!configured()) return Promise.resolve();
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GSI; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error("Google sign-in couldn’t load. Check your connection.")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** interactive=false renews quietly (prompt ''); true shows Google's account/consent screen. */
export function requestToken({ interactive }) {
  return new Promise((resolve, reject) => {
    const oauth = window.google && window.google.accounts && window.google.accounts.oauth2;
    if (!oauth) { reject(new Error("Google sign-in isn’t loaded yet. Check your connection and try again.")); return; }
    if (!client) client = oauth.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, callback: () => {} });
    client.callback = r => {
      if (r.error) { reject(r); return; }
      if (!oauth.hasGrantedAllScopes(r, SCOPE)) { reject({ error: "scope_not_granted" }); return; }
      token = r.access_token;
      expiresAt = Date.now() + Number(r.expires_in || 3600) * 1000;
      try { sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt })); } catch { /* ignore */ }
      resolve();
    };
    client.error_callback = e => reject(e);
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

/** Forget the current token (Drive said it's no longer valid); the next tap renews it. */
export function clearToken() {
  token = null; expiresAt = 0;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function signOut() {
  const t = token;
  token = null; expiresAt = 0;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  const oauth = window.google && window.google.accounts && window.google.accounts.oauth2;
  if (t && oauth) oauth.revoke(t, () => {});
}

/** The connected account's email, via Drive's about endpoint; null if unavailable. */
export async function fetchEmail() {
  if (!hasToken()) return null;
  try {
    const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return (await r.json()).user.emailAddress || null;
  } catch { return null; }
}
