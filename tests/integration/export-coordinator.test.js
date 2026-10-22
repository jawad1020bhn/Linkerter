"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../../linkedin-shared.js");
const { createChromeMock } = require("../helpers/chrome-mock.js");
const { createHistoryCoordinator } = require("../../background.js");
const exporter = require("../../popup-export.js");

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const record = (id, lastSeenAt, extra = {}) => ({
  id: `urn:${id}`, fullText: `text ${id}`, contentComplete: true,
  firstSeenAt: lastSeenAt, lastSeenAt, category: "open_role", ...extra
});

test("coordinator prunes expired history before export merging", async () => {
  const chrome = createChromeMock({ local: {
    hiringPreferences: { historyMode: "persistent", historyRetentionDays: 30 },
    hiringPostHistory: [record("old", "2020-01-01T00:00:00.000Z"), record("recent", new Date(NOW).toISOString())]
  } });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome, now: () => NOW });
  const history = await coordinator.handle({ type: "HISTORY_GET" });
  assert.deepEqual(history.records.map((item) => item.id), ["urn:recent"]);
  const merged = exporter.mergeExportSources([record("current", new Date(NOW).toISOString())], history.records);
  assert.deepEqual(new Set(merged.map((item) => item.id)), new Set(["urn:current", "urn:recent"]));
});

test("selected clear scopes preserve unselected data and all-data clear is complete", async () => {
  const chrome = createChromeMock({
    local: { hiringPreferences: { historyMode: "persistent" }, hiringSettings: { mode: "fast" }, hiringPostHistory: [record("p", new Date(NOW).toISOString())] },
    session: { hiringSessionPostHistory: [record("s", new Date(NOW).toISOString())] }
  });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome, now: () => NOW });
  await coordinator.handle({ type: "LOCAL_DATA_CLEAR", scopes: ["settings"] });
  assert.equal(chrome._local._data.hiringSettings, undefined);
  assert.equal(chrome._local._data.hiringPostHistory.length, 1);
  await coordinator.handle({ type: "LOCAL_DATA_CLEAR", scopes: ["all"] });
  assert.deepEqual(chrome._local._data, {});
  assert.deepEqual(chrome._session._data, {});
});

test("storage failures are surfaced to export callers", async () => {
  const chrome = createChromeMock();
  chrome._local.beforeGet = () => { throw new Error("storage unavailable"); };
  const coordinator = createHistoryCoordinator({ chromeApi: chrome, now: () => NOW });
  const result = await coordinator.handle({ type: "HISTORY_GET" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "storage_unavailable");
  assert.equal(result.records, undefined);
});

test("diagnostics contain operational counts but no archived post or URL data", async () => {
  const secret = "SECRET POST person@example.com https://www.linkedin.com/posts/a_activity-1";
  const chrome = createChromeMock({ local: { hiringPreferences: { historyMode: "persistent" } } });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome, now: () => NOW });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [record("secret", new Date(NOW).toISOString(), { fullText: secret })] });
  const result = await coordinator.handle({ type: "GET_DIAGNOSTICS" });
  assert.equal(result.ok, true);
  const json = JSON.stringify(result.diagnostic);
  assert.equal(json.includes(secret), false);
  assert.equal(json.includes("person@example.com"), false);
  assert.equal(json.includes("linkedin.com"), false);
  assert.equal(json.includes("fullText"), false);
  assert.ok(result.diagnostic.operations.historyAppend >= 1);
});
