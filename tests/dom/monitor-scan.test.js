"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor } = require("../helpers/load-monitor.js");

function syntheticRecords() {
  const seekers = Array.from({ length: 30 }, (_, index) => ({
    id: `seeker-${index}`, category: "job_seeker", fullText: `Open to work ${index}`,
    author: { name: "Seeker" }, lastSeenAt: new Date(1000 + index).toISOString()
  }));
  const openings = Array.from({ length: 50 }, (_, index) => ({
    id: `opening-${index}`, category: "open_role", fullText: `We are hiring engineer ${index}`,
    author: { name: "Employer" }, lastSeenAt: new Date(100000 + index).toISOString()
  }));
  return [...seekers, ...openings];
}

test("category and search filtering happen before pagination with stable ordering", () => {
  const { api } = loadMonitor();
  const records = syntheticRecords();
  const second = api.queryRecords(records, { filter: "open_role", sort: "newest", page: 2, pageSize: 25 });
  assert.equal(second.total, 50);
  assert.equal(second.page, 2);
  assert.equal(second.pageSize, 25);
  assert.equal(second.hasMore, false);
  assert.equal(second.results.length, 25);
  assert.equal(second.results[0].id, "opening-24");
  const searched = api.queryRecords(records, { search: "engineer 49", page: 1, pageSize: 25 });
  assert.equal(searched.total, 1);
  assert.equal(searched.results[0].id, "opening-49");
  const oldest = api.queryRecords(records, { filter: "open_role", sort: "oldest", page: 1, pageSize: 25 });
  assert.equal(oldest.results[0].id, "opening-0");
});

test("1,000-root rescan performs no unchanged reclassification and uses bounded batches", async () => {
  const html = `<main>${Array.from({ length: 1000 }, (_, index) => `<article data-urn="urn:li:activity:${index}"><div class="feed-shared-text">We are hiring engineer ${index}</div></article>`).join("")}</main>`;
  const base = globalThis.__LI_FEED_HIRING_CLASSIFIER__ || (require("../../linkedin-hiring-rules.js"), require("../../linkedin-hiring-classifier.js"), globalThis.__LI_FEED_HIRING_CLASSIFIER__);
  let classifications = 0;
  const classifier = { ...base, classify(...args) { classifications += 1; return base.classify(...args); } };
  const { document, api } = loadMonitor(html, { classifier, manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ autoExpand: false, historyMode: "off" });
  await api.scan();
  assert.equal(classifications, 1000);
  await api.scan();
  assert.equal(classifications, 1000);
  assert.ok(api.getStatus().scan.batches >= 40);
  assert.ok(api.getStatus().scan.cacheHits >= 1000);
  const timings = api.getStatus().scan;
  assert.ok(Number.isFinite(timings.lastScanMs));
  assert.ok(Number.isFinite(timings.totalScanMs) && timings.totalScanMs >= timings.lastScanMs);
  assert.ok(Number.isFinite(timings.maxScanMs) && timings.maxScanMs >= timings.lastScanMs);
  await api.stopMonitor();
});

test("sustained events cannot starve the trailing scan", async () => {
  const { document, api, timers, runTimer } = loadMonitor("<main><article data-urn='urn:li:activity:1'><div class='feed-shared-text'>We are hiring.</div></article></main>", { manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ autoExpand: false });
  const firstTimer = timers.keys().next().value;
  for (let index = 0; index < 30; index += 1) api.scheduleScan(1000);
  assert.equal(timers.size, 1);
  assert.ok(timers.has(firstTimer));
  assert.equal(api.getStatus().scan.scans, 0);
  await runTimer(firstTimer);
  assert.equal(api.getStatus().scan.scans, 1);
  await api.stopMonitor();
});

test("storage events do not rewrite another tab's active filter or expansion state", async () => {
  const { document, api, dispatchStorageChanged } = loadMonitor("<main></main>", { manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ filter: "open_role", matchesOnly: false, autoExpand: true });
  dispatchStorageChanged({ hiringPreferences: { newValue: {
    filter: "closed", matchesOnly: true, autoExpand: false, historyMode: "session", historyRetentionDays: 7
  } } });
  const status = api.getStatus();
  assert.equal(status.activeFilter, "open_role");
  assert.equal(status.matchesOnly, false);
  assert.equal(status.autoExpand, true);
  assert.equal(status.historyMode, "session");
  await api.stopMonitor();
});
