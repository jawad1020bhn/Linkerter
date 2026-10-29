#!/usr/bin/env node
/* Capture the Chrome Web Store assets from the preview server.
 *
 *   node scripts/build-store-assets.cjs              -> store/*.png
 *   node scripts/build-store-assets.cjs --only promo -> only matching frame ids
 *
 * Each frame is a plain HTML page served at /store/<id> by scripts/preview-popup.cjs,
 * composed at the exact pixel size the store requires. The capture uses the Playwright
 * CLI that is already installed on this machine (`npx --no-install playwright`), so the
 * repository keeps its zero-dependency promise: no npm package is added to package.json.
 *
 * If Playwright is missing the script fails with the install hint instead of silently
 * producing half a store listing.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const { frames, STORE_SIZES } = require("./store-frames.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "store");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PREVIEW_PORT || 4174);
const BASE = `http://${HOST}:${PORT}`;
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

/** Poll /healthz until the preview server answers, so captures never race the listener. */
function waitForServer(deadlineMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`${BASE}/healthz`, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => {
      if (Date.now() - started > deadlineMs) {
        reject(new Error(`Preview server did not answer on ${BASE} within ${deadlineMs}ms`));
        return;
      }
      setTimeout(attempt, 120);
    };
    attempt();
  });
}

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "preview-popup.cjs")], {
    cwd: ROOT,
    env: { ...process.env, PREVIEW_HOST: HOST, PREVIEW_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) process.stderr.write(`preview server exited (${code})\n${output}`);
  });
  return child;
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  // Windows does not always deliver SIGTERM to a child that owns a socket; the process
  // is a short-lived dev tool, so a hard stop after the captures is acceptable.
  setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 1500).unref();
}

/** Quote one shell argument. Windows needs this because .cmd shims cannot be spawned directly. */
function quoteArg(value) {
  const text = String(value);
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

/** One Playwright CLI capture at an exact viewport. */
/** Run the Playwright CLI once. Returns { ok, output } instead of throwing so the caller
 *  can retry against the installed Chrome when the bundled browser is missing. */
function runCapture(frame, extraArgs = [], timeoutMs = 90000) {
  const size = STORE_SIZES[frame.kind];
  const target = path.join(OUT_DIR, `${frame.id}.png`);
  fs.rmSync(target, { force: true });
  const args = [
    "--no-install",
    "playwright",
    "screenshot",
    ...extraArgs,
    "--viewport-size",
    `${size.width},${size.height}`,
    "--wait-for-selector",
    "body[data-ready='true']",
    "--wait-for-timeout",
    "250",
    `${BASE}/store/${frame.id}`,
    target
  ];
  // `npx` is a .cmd shim on Windows, which Node refuses to spawn without a shell. The
  // command is passed as one pre-quoted string so paths with spaces survive.
  const command = [NPX, ...args.map(quoteArg)].join(" ");
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, output: `${output}\nTimed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => finish({ ok: false, output: `${output}\n${error.message}` }));
    child.on("exit", (code) => finish({ ok: code === 0 && fs.existsSync(target), output }));
  });
}

/** Capture one frame, falling back to the locally installed Chrome when the Playwright
 *  browser bundle is absent. A store asset that silently fails is worse than a slower run. */
async function capture(frame) {
  const size = STORE_SIZES[frame.kind];
  if (!size) throw new Error(`No store size registered for kind "${frame.kind}"`);
  let result = await runCapture(frame);
  if (!result.ok && /Executable doesn't exist|was just installed/i.test(result.output)) {
    log(`  bundled browser missing for ${frame.id}; retrying with installed Chrome`);
    result = await runCapture(frame, ["--channel", "chrome"]);
  }
  if (!result.ok) {
    throw new Error(
      `Playwright could not capture ${frame.id}.\n${result.output.trim()}\n` +
      "Install the browser once with: npx playwright install chromium"
    );
  }
  return path.join(OUT_DIR, `${frame.id}.png`);
}

async function main() {
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex === -1 ? null : String(process.argv[onlyIndex + 1] || "");
  const selected = frames.filter((frame) => !only || frame.id.includes(only));
  if (!selected.length) {
    fail(`No store frame matches "${only}".`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = startServer();
  try {
    await waitForServer();
    for (const frame of selected) {
      const file = await capture(frame);
      const bytes = fs.statSync(file).size;
      const size = STORE_SIZES[frame.kind];
      log(`${frame.id.padEnd(24)} ${size.width}x${size.height}  ${(bytes / 1024).toFixed(1)} KB`);
    }
    log(`\n${selected.length} asset(s) written to store/`);
  } catch (error) {
    fail(error.message);
  } finally {
    stopServer(server);
  }
}

if (require.main === module) void main();

module.exports = { capture, startServer, waitForServer, stopServer, OUT_DIR };
