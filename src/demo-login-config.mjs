const publicEnvironment = import.meta.env || {};

export const DEMO_LOGIN = Object.freeze({
  username: String(publicEnvironment.VITE_DEMO_USERNAME || "demo@boveda.dev").trim().toLowerCase(),
  password: String(publicEnvironment.VITE_DEMO_PASSWORD || "boveda-demo"),
  displayName: "Demo supervisor",
});

