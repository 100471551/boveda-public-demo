import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const localEnvironment = { ...process.env, VITE_BOVEDA_RUNTIME: "local" };
const children = [
  spawn(process.execPath, ["--watch", "engine/server.mjs"], { stdio: "inherit", env: localEnvironment }),
  spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))], { stdio: "inherit", env: localEnvironment }),
];

let stopping = false;
let exitCode = 0;
let closed = 0;
let forceTimer;

function stop(signal = "SIGTERM", code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
  forceTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 5000);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop("SIGTERM", 1);
  });
  child.on("close", (code, signal) => {
    closed += 1;
    if (!stopping) stop("SIGTERM", code || (signal ? 1 : 0) || 1);
    if (closed === children.length) {
      clearTimeout(forceTimer);
      process.exitCode = exitCode;
    }
  });
}
