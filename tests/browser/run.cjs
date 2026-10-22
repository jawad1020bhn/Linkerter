"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const { run } = require("./extension.test.cjs");

const rootDir = path.resolve(__dirname, "..", "..");
const resultsDir = path.join(rootDir, "test-results", "browser");
const requireChrome = process.env.REQUIRE_CHROME === "1";

function executable(candidate) {
  if (!candidate) return false;
  try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ].filter(Boolean);
  return candidates.find(executable) || null;
}

async function writeSummary(summary) {
  await fsp.mkdir(resultsDir, { recursive: true });
  await fsp.writeFile(path.join(resultsDir, "summary.json"), `${JSON.stringify({ date: new Date().toISOString(), ...summary }, null, 2)}\n`);
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    const message = "real Chrome MV3 integration NOT RUN — no Chrome/Chromium executable found; set CHROME_PATH to an executable";
    await writeSummary({ status: "NOT RUN", reason: "Chrome executable unavailable" });
    console.log(message);
    if (requireChrome) throw new Error(message);
    return;
  }

  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "linkerter-chrome-"));
  const downloadsDir = path.join(resultsDir, "downloads");
  const screenshotsDir = path.join(rootDir, "docs", "store", "screenshots");
  await Promise.all([
    fsp.mkdir(downloadsDir, { recursive: true }),
    fsp.mkdir(screenshotsDir, { recursive: true })
  ]);
  for (const name of await fsp.readdir(downloadsDir)) await fsp.rm(path.join(downloadsDir, name), { force: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      userDataDir: profileDir,
      protocolTimeout: 60000,
      args: [
        `--disable-extensions-except=${rootDir}`,
        `--load-extension=${rootDir}`,
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--no-first-run"
      ]
    });
    const version = await browser.version();
    const prefix = "chrome-extension://";
    const target = await browser.waitForTarget((candidate) => candidate.type() === "service_worker" && candidate.url().startsWith(prefix), { timeout: 20000 });
    const extensionId = new URL(target.url()).hostname;
    const getWorker = async () => {
      const serviceTarget = await browser.waitForTarget((candidate) => candidate.type() === "service_worker" && candidate.url().startsWith(`chrome-extension://${extensionId}/`), { timeout: 20000 });
      const worker = await serviceTarget.worker();
      if (!worker) throw new Error("MV3 service worker target has no executable worker");
      return worker;
    };
    const worker = await getWorker();
    await worker.evaluate(async () => {
      await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
    });
    await run({
      browser,
      extensionId,
      getWorker,
      rootDir,
      downloadsDir,
      screenshotsDir
    });
    await writeSummary({ status: "PASS", chrome: version, tests: 6, screenshots: ["docs/store/screenshots/popup-en.png", "docs/store/screenshots/popup-ar.png"] });
    console.log(`PASS: real browser integration with ${version}`);
  } catch (error) {
    await writeSummary({ status: "FAIL", error: error.stack || error.message });
    throw error;
  } finally {
    if (browser) await browser.close();
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
