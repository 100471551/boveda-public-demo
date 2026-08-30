export const DEMO_SESSION_STORAGE_KEY = "boveda.demo-session.v1.1.0";

export function createDemoSession(email, now = () => new Date().toISOString()) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return null;
  const localPart = normalizedEmail.split("@")[0] || "demo";
  const displayName = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Demo supervisor";
  return { email: normalizedEmail, displayName, signedInAt: now() };
}

export function readDemoSession(storage = globalThis.localStorage) {
  try {
    const session = JSON.parse(storage.getItem(DEMO_SESSION_STORAGE_KEY) || "null");
    return session?.email && session?.displayName ? session : null;
  } catch { return null; }
}

export function storeDemoSession(session, storage = globalThis.localStorage) {
  try { storage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session)); return true; }
  catch { return false; }
}

export function clearDemoSession(storage = globalThis.localStorage) {
  try { storage.removeItem(DEMO_SESSION_STORAGE_KEY); return true; }
  catch { return false; }
}
