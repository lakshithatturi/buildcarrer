import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.dirname(projectDirectory);
const host = process.env.HOST || "127.0.0.1";
const apiPort = Number(process.env.PORT) || 3001;
const apiHealthUrl = `http://${host}:${apiPort}/api/health`;
const viteCli = path.join(
  rootDirectory,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const children = [];
let shuttingDown = false;

async function hasHealthyApi() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(apiHealthUrl, { signal: controller.signal });
    const health = await response.json();
    return response.ok && health.service === "buildcarrers-api";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function stopChildren(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const { child } of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

function startChild(name, executable, args) {
  const child = spawn(executable, args, {
    cwd: rootDirectory,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  children.push({ name, child });
  child.once("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    stopChildren(1);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`${name} exited with ${signal || `code ${code}`}.`);
    }
    stopChildren(code ?? 1);
  });

  return child;
}

process.once("SIGINT", () => stopChildren(0));
process.once("SIGTERM", () => stopChildren(0));

if (await hasHealthyApi()) {
  console.log(`Using existing BuildCarrers API at ${apiHealthUrl}`);
} else {
  startChild("BuildCarrers API", process.execPath, [
    path.join(rootDirectory, "server.js"),
  ]);
}

startChild("Vite", process.execPath, [viteCli, "--host", host]);
