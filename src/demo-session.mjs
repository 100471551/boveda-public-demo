import { DEMO_LOGIN } from "./demo-login-config.mjs";

export const DEMO_SESSION_STORAGE_KEY = "boveda.demo-session.v1.1.0";
export const DEMO_SESSION_KIND = "shared-public-demo";

function boundedSession(session) {
  if (session?.kind !== DEMO_SESSION_KIND || !session?.signedInAt) return null;
  return { kind: DEMO_SESSION_KIND, displayName: DEMO_LOGIN.displayName, signedInAt: session.signedInAt };
}

export function createDemoSession(username, password, now = () => new Date().toISOString()) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (normalizedUsername !== DEMO_LOGIN.username || String(password || "") !== DEMO_LOGIN.password) return null;
  return { kind: DEMO_SESSION_KIND, displayName: DEMO_LOGIN.displayName, signedInAt: now() };
}

export function readDemoSession(storage = globalThis.localStorage) {
  try {
    const session = JSON.parse(storage.getItem(DEMO_SESSION_STORAGE_KEY) || "null");
    return boundedSession(session);
  } catch { return null; }
}

export function storeDemoSession(session, storage = globalThis.localStorage) {
  try {
    const safeSession = boundedSession(session);
    if (!safeSession) return false;
    storage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(safeSession));
    return true;
  }
  catch { return false; }
}

export function clearDemoSession(storage = globalThis.localStorage) {
  try { storage.removeItem(DEMO_SESSION_STORAGE_KEY); return true; }
  catch { return false; }
}
