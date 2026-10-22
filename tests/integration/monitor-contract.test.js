"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor } = require("../helpers/load-monitor.js");

const HTML = `<main>
  <article data-urn="urn:li:activity:open"><div class="feed-shared-text">We are hiring a data engineer. Apply now.</div></article>
  <article data-urn="urn:li:activity:partial"><div class="feed-shared-text">An ordinary update with more text to reveal <button aria-label="See more">See more</button></div></article>
</main>`;

test("status paginates detected records, omits partial-only archive entries, and exposes historyMode", async () => {
  const { document, api, dispatchMessage } = loadMonitor(HTML, { manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  await dispatchMessage({ type: "START_HIRING_MONITOR", options: { autoExpand: false, historyMode: "session" } });
  await api.scan();
  const status = await dispatchMessage({ type: "GET_HIRING_STATUS", query: { filter: "all", page: 1, pageSize: 1 } });
  assert.equal(status.historyMode, "session");
  assert.equal(status.total, 1);
  assert.equal(status.archiveCount, 1);
  assert.equal(status.page, 1);
  assert.equal(status.pageSize, 1);
  assert.equal(status.hasMore, false);
  assert.equal(status.results[0].id, "urn:li:activity:open");
  assert.equal(status.results[0].fullText, undefined);
  assert.equal(status.results[0].snippet.includes("data engineer"), true);
  await dispatchMessage({ type: "STOP_HIRING_MONITOR" });
});

test("detail messages return one full canonical record and not-found errors", async () => {
  const { document, api, dispatchMessage } = loadMonitor(HTML, { manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  await dispatchMessage({ type: "START_HIRING_MONITOR", options: { autoExpand: false } });
  await api.scan();
  const detail = await dispatchMessage({ type: "GET_HIRING_POST", id: "urn:li:activity:open" });
  assert.equal(detail.ok, true);
  assert.equal(detail.post.fullText.includes("Apply now"), true);
  assert.equal(detail.post.extractionStatus, "complete");
  const missing = await dispatchMessage({ type: "GET_HIRING_POST", id: "missing" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "not_found");
  await dispatchMessage({ type: "STOP_HIRING_MONITOR" });
});

test("only changed deltas are sent and stopping flushes the coordinator", async () => {
  const { document, api, messages, dispatchMessage } = loadMonitor(HTML, { manualTimers: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  await dispatchMessage({ type: "START_HIRING_MONITOR", options: { autoExpand: false, historyMode: "session" } });
  await api.scan();
  await api.flushHistoryDelta();
  await api.scan();
  await dispatchMessage({ type: "STOP_HIRING_MONITOR" });
  const deltas = messages.filter((message) => message.type === "HISTORY_DELTA");
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].records.length, 1);
  assert.equal(deltas[0].records[0].id, "urn:li:activity:open");
  assert.equal(messages.filter((message) => message.type === "HISTORY_FLUSH").length, 1);
});
