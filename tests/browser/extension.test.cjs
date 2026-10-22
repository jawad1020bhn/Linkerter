"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { installFixtures } = require("./fixture-server.cjs");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeout = 15000, interval = 100, label = "browser condition" } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(interval);
  }
  const suffix = lastError ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}${suffix}`);
}

async function sendTab(context, tabId, message) {
  const worker = await context.getWorker();
  return worker.evaluate(async (id, value) => chrome.tabs.sendMessage(id, value), tabId, message);
}

async function waitForTabStatus(context, tabId, type, predicate, label) {
  return waitFor(async () => {
    const status = await sendTab(context, tabId, { type });
    return predicate(status) ? status : false;
  }, { label: label || `${type} status` });
}

async function clearStorage(context) {
  const worker = await context.getWorker();
  await worker.evaluate(async () => {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
  });
}

async function readStore(context, area, key) {
  const worker = await context.getWorker();
  return worker.evaluate(async (store, name) => {
    if (!chrome.storage[store]) throw new Error(`Missing chrome.storage.${store}`);
    const value = await chrome.storage[store].get(name);
    return value[name];
  }, area, key);
}

async function openFixture(context, route) {
  const page = await context.browser.newPage();
  await installFixtures(page);
  const response = await page.goto(`https://www.linkedin.com${route}`, { waitUntil: "networkidle0", timeout: 20000 });
  assert.equal(response.status(), 200);
  assert.match(page.url(), /^https:\/\/www\.linkedin\.com\//);
  return page;
}

async function openPopup(context) {
  const page = await context.browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 450, height: 780, deviceScaleFactor: 1 });
  await page.goto(`chrome-extension://${context.extensionId}/popup.html`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#monitorBtn");
  await waitFor(() => page.evaluate(() => Boolean(window.__LI_FEED_EXPORT__ && window.__LI_FEED_RESULTS__ && window.__LI_FEED_I18N__ && window.__LI_FEED_POPUP__)), {
    label: "popup shared modules"
  });
  assert.deepEqual(errors, [], "popup initialization must not throw");
  return page;
}

async function activateAndDismissOnboarding(popup) {
  await popup.waitForFunction(() => Boolean(document.querySelector("#onboarding") && document.querySelector("#localeSelect")));
  if (await popup.$eval("#onboarding", (node) => !node.hidden)) {
    await popup.click("#dismissOnboarding");
    await popup.waitForFunction(() => document.querySelector("#onboarding").hidden);
  }
}

async function testExtensionActivation(context) {
  const worker = await context.getWorker();
  assert.match(worker.url(), new RegExp(`^chrome-extension://${context.extensionId}/background\\.js$`));
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "2.0.0");
  const popup = await openPopup(context);
  try {
    await popup.waitForFunction(() => !document.querySelector("#onboarding").hidden);
    await activateAndDismissOnboarding(popup);
    assert.equal(await popup.$eval("#onboardingTitle", (node) => node.textContent.includes("Welcome")), true);
  } finally { await popup.close(); }
}

async function testRouteMatching(context) {
  const root = await openFixture(context, "/?fixture=root");
  try {
    const id = await targetId(context, root);
    const status = await waitForTabStatus(context, id, "GET_STATUS", (value) => value?.isFeed === true, "root feed content script");
    assert.equal(status.state, "stopped");
  } finally { await root.close(); }

  const jobs = await openFixture(context, "/jobs/");
  try {
    const id = await targetId(context, jobs);
    await assert.rejects(() => sendTab(context, id, { type: "GET_STATUS" }), "unsupported /jobs/ route must not have a feed receiver");
  } finally { await jobs.close(); }
}

// Puppeteer's public API does not expose a tab ID directly. The extension's
// tabs permission resolves the actual tab by URL, avoiding private CDP fields.
async function targetId(context, page) {
  const worker = await context.getWorker();
  const url = page.url();
  const ids = await worker.evaluate(async (expected) => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((tab) => tab.url === expected).map((tab) => tab.id);
  }, url);
  assert.equal(ids.length, 1, `expected one tab for ${url}, found ${ids.length}`);
  return ids[0];
}

async function testConcurrentPersistentHistory(context) {
  await clearStorage(context);
  const first = await openFixture(context, "/feed/?fixture=browser-a");
  const second = await openFixture(context, "/feed/?fixture=browser-b");
  try {
    const [firstId, secondId] = await Promise.all([targetId(context, first), targetId(context, second)]);
    await Promise.all([firstId, secondId].map((id) => sendTab(context, id, {
      type: "START_HIRING_MONITOR",
      options: { historyMode: "persistent", autoExpand: false }
    })));
    await Promise.all([firstId, secondId].map((id) => waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status.archiveCount >= 1, "persistent monitor extraction")));
    await Promise.all([firstId, secondId].map((id) => sendTab(context, id, { type: "STOP_HIRING_MONITOR" })));
    const history = await readStore(context, "local", "localHistory");
    const ids = history.records.map((record) => record.id).sort();
    assert.deepEqual(ids, ["urn:li:activity:browser-a", "urn:li:activity:browser-b"]);
    assert.ok(history.records.every((record) => record.fullText.includes("synthetic test content")));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
}

async function testPopupKeyboardAndDownload(context) {
  const feed = await openFixture(context, "/feed/?fixture=download-target");
  const popup = await openPopup(context);
  try {
    // An extension page opened as a tab can become active, unlike the toolbar
    // popup. Reinitialize while the fixture feed is active to test real targeting.
    await feed.bringToFront();
    await popup.reload({ waitUntil: "networkidle0" });
    await popup.waitForFunction(() => Boolean(window.__LI_FEED_POPUP__));
    await activateAndDismissOnboarding(popup);
    await popup.focus("#scrollTab");
    await popup.keyboard.press("ArrowRight");
    await popup.waitForFunction(() => document.activeElement?.id === "monitorTab" && document.querySelector("#monitorTab").getAttribute("aria-selected") === "true");
    await popup.keyboard.press("Home");
    await popup.waitForFunction(() => document.activeElement?.id === "scrollTab");
    await popup.keyboard.press("End");
    await popup.waitForFunction(() => document.activeElement?.id === "monitorTab");
    await popup.screenshot({ path: path.join(context.screenshotsDir, "popup-en.png") });

    await popup.waitForFunction(() => !document.querySelector("#exportBtn").disabled);
    assert.equal(await popup.$eval("#exportFields", (node) => node.querySelector('input[value="fullText"]').checked), false);
    assert.equal(await popup.$eval("#exportFields", (node) => node.querySelector('input[value="emails"]').checked), false);
    const client = await popup.createCDPSession();
    await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: context.downloadsDir });
    await popup.click("#exportBtn");
    const file = await waitFor(async () => {
      const names = (await fs.readdir(context.downloadsDir)).filter((name) => name.endsWith(".json"));
      return names.length ? path.join(context.downloadsDir, names[0]) : false;
    }, { label: "actual JSON download" });
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(payload.schemaVersion, "2.0");
    assert.ok(payload.posts.length >= 2);
    assert.ok(payload.posts.every((post) => post.fullText === undefined && post.emails === undefined));

    await popup.select("#localeSelect", "ar");
    await popup.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl" && document.querySelector("#onboarding").hidden);
    await popup.screenshot({ path: path.join(context.screenshotsDir, "popup-ar.png") });
    const stored = await readStore(context, "local", "hiringPreferences");
    assert.equal(stored.locale, "ar");
  } finally {
    await popup.close();
    await feed.close();
  }
}

async function testSpaNavigationCleanup(context) {
  await clearStorage(context);
  const page = await openFixture(context, "/feed/?fixture=spa-cleanup");
  try {
    const id = await targetId(context, page);
    await sendTab(context, id, { type: "START_HIRING_MONITOR", options: { historyMode: "off", filter: "closed", matchesOnly: true, autoExpand: false } });
    await waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status.archiveCount >= 1, "filtered SPA monitor");
    await waitFor(() => page.evaluate(() => document.querySelector("article")?.getAttribute("data-li-feed-hiring-filter-hidden") === "true"), { label: "extension-owned filtered card" });

    await page.evaluate(() => {
      history.pushState({}, "", "/jobs/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status.isFeed === false && status.monitoring === false, "monitor stopped after SPA route exit");
    await waitFor(() => page.evaluate(() => !document.querySelector("[data-li-feed-hiring-filter-hidden], [data-li-feed-hiring-filter-style]")), { label: "SPA filter artifact cleanup" });

    await page.evaluate(() => {
      history.pushState({}, "", "/feed/?fixture=spa-cleanup");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const restored = await waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status.isFeed === true, "feed route restored");
    assert.equal(restored.monitoring, false, "SPA return must not auto-resume monitoring");
  } finally { await page.close(); }
}

async function testSessionReloadWithoutAutoResume(context) {
  await clearStorage(context);
  const page = await openFixture(context, "/feed/?fixture=session-reload");
  try {
    const id = await targetId(context, page);
    await sendTab(context, id, { type: "START_HIRING_MONITOR", options: { historyMode: "session", autoExpand: false } });
    await waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status.archiveCount >= 1, "session monitor extraction");
    await sendTab(context, id, { type: "START", settings: { mode: "super_fast" } });
    await waitForTabStatus(context, id, "GET_STATUS", (status) => ["running", "paused"].includes(status.state), "active scroller before reload");
    await sendTab(context, id, { type: "STOP_HIRING_MONITOR" });
    assert.equal((await readStore(context, "session", "sessionHistory")).records.length, 1);

    await page.reload({ waitUntil: "networkidle0", timeout: 20000 });
    const scroll = await waitForTabStatus(context, id, "GET_STATUS", (status) => status?.state === "stopped", "stopped scroller after reload");
    const monitor = await waitForTabStatus(context, id, "GET_HIRING_STATUS", (status) => status?.monitoring === false, "stopped monitor after reload");
    assert.equal(scroll.state, "stopped");
    assert.equal(monitor.monitoring, false);
    assert.equal((await readStore(context, "session", "sessionHistory")).records.length, 1);
    assert.equal(await readStore(context, "local", "localHistory"), undefined);
  } finally { await page.close(); }
}

const tests = [
  ["real MV3 service-worker and popup activation", testExtensionActivation],
  ["exact root/feed matching and unsupported-route isolation", testRouteMatching],
  ["two-tab concurrent persistent history", testConcurrentPersistentHistory],
  ["real popup keyboard navigation and JSON download", testPopupKeyboardAndDownload],
  ["SPA route-exit cleanup without auto-resume", testSpaNavigationCleanup],
  ["session-history reload recovery without auto-resume", testSessionReloadWithoutAutoResume]
];

async function run(context) {
  let passed = 0;
  for (const [name, test] of tests) {
    await test(context);
    passed += 1;
    console.log(`PASS: ${name}`);
  }
  console.log(`Browser integration: ${passed}/${tests.length} PASS`);
}

module.exports = { run, tests };
