"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../../linkedin-shared.js");
const { createChromeMock } = require("../helpers/chrome-mock.js");
const { createHistoryCoordinator } = require("../../background.js");

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const iso = (offsetDays = 0) => new Date(NOW + offsetDays * 86400000).toISOString();
const record = (key, fullText = key, extra = {}) => {
  const lastSeenAt = extra.lastSeenAt || iso();
  return {
    id: `urn:${key}`,
    sourcePostId: key,
    permalink: `https://www.linkedin.com/feed/update/urn:li:activity:${key}/`,
    fullText,
    contentComplete: true,
    firstSeenAt: extra.firstSeenAt || lastSeenAt,
    lastSeenAt,
    ...extra
  };
};
const preferences = (historyMode, historyRetentionDays = 30) => ({ historyMode, historyRetentionDays });

function setup(mode = "persistent", seed = {}) {
  const chrome = createChromeMock({
    local: { hiringPreferences: preferences(mode), ...(seed.local || {}) },
    session: seed.session || {}
  });
  return { chrome, coordinator: createHistoryCoordinator({ chromeApi: chrome, now: () => NOW }) };
}

test("concurrent tab appends behind a read barrier never lose A or B", async () => {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const { chrome, coordinator } = setup("session");
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    chrome._session.beforeGet = () => barrier;
    const a = coordinator.handle({ type: "HISTORY_APPEND", records: [record("a")] });
    const b = coordinator.handle({ type: "HISTORY_APPEND", records: [record("b")] });
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const responses = await Promise.all([a, b]);
    assert.ok(responses.every((response) => response.ok));
    const stored = chrome._session._data.hiringSessionPostHistory;
    assert.deepEqual(new Set(stored.map((item) => item.id)), new Set(["urn:a", "urn:b"]));
  }
});

test("same-ID writes preserve complete text and refresh observations and metrics", async () => {
  const full = record("same", "complete text", { contentComplete: true, metrics: { reactions: 1 }, lastSeenAt: iso(-1) });
  const partial = record("same", "complete", { contentComplete: false, metrics: { reactions: 9 } });
  const { coordinator } = setup("persistent", { local: { hiringPostHistory: [full] } });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [partial] });
  const result = await coordinator.handle({ type: "HISTORY_GET" });
  assert.equal(result.records[0].fullText, "complete text");
  assert.equal(result.records[0].contentComplete, true);
  assert.equal(result.records[0].metrics.reactions, 9);
  assert.equal(result.records[0].lastSeenAt, partial.lastSeenAt);
});

test("500-record and real UTF-8 3 MB limits are enforced before persistence", async () => {
  const existing = Array.from({ length: 500 }, (_, index) => record(`id-${index}`, "x", { lastSeenAt: iso(-2) }));
  const { chrome, coordinator } = setup("persistent", { local: { hiringPostHistory: existing } });
  const appended = await coordinator.handle({ type: "HISTORY_APPEND", records: [record("newest", "new")] });
  assert.equal(appended.ok, true);
  assert.equal(appended.limitReached, true);
  assert.equal(chrome._local._data.hiringPostHistory.length, 500);
  assert.ok(chrome._local._data.hiringPostHistory.some((item) => item.id === "urn:newest"));

  const oversized = setup("session");
  const result = await oversized.coordinator.handle({ type: "HISTORY_APPEND", records: [record("huge", "é".repeat(1600000))] });
  assert.equal(result.ok, true);
  assert.equal(result.accepted, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.limitReached, true);
  assert.equal(result.error, "history_limit");
  assert.equal(oversized.chrome._session._data.hiringSessionPostHistory.length, 0);
});

test("retention uses the injected clock and off mode preserves old records", async () => {
  const old = record("old", "old", { lastSeenAt: "2020-01-01T00:00:00.000Z" });
  const recent = record("recent", "recent");
  const enabled = setup("persistent", { local: { hiringPostHistory: [old, recent] } });
  const pruned = await enabled.coordinator.handle({ type: "HISTORY_GET" });
  assert.deepEqual(pruned.records.map((item) => item.id), ["urn:recent"]);
  assert.deepEqual(enabled.chrome._local._data.hiringPostHistory.map((item) => item.id), ["urn:recent"]);

  const disabled = setup("off", { local: { hiringPostHistory: [old] } });
  const retained = await disabled.coordinator.handle({ type: "HISTORY_GET" });
  assert.deepEqual(retained.records.map((item) => item.id), ["urn:old"]);
  assert.deepEqual(disabled.chrome._local._data.hiringPostHistory, [old]);
});

test("off, session, and persistent modes control writes without copying stores", async () => {
  const { chrome, coordinator } = setup("off");
  const rejected = await coordinator.handle({ type: "HISTORY_APPEND", records: [record("off")] });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "history_disabled");
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "session" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [record("session")] });
  assert.equal(chrome._local._data.hiringPostHistory, undefined);
  assert.equal(chrome._session._data.hiringSessionPostHistory.length, 1);
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [record("persistent")] });
  assert.equal(chrome._session._data.hiringSessionPostHistory.length, 1);
  assert.equal(chrome._local._data.hiringPostHistory.length, 1);
  assert.notEqual(chrome._local._data.hiringPostHistory[0].id, "urn:session");
});

test("combined reads merge duplicate IDs and expose store provenance", async () => {
  const persistent = record("same", "complete text", { contentComplete: true, lastSeenAt: iso(-1) });
  const session = record("same", "complete", { contentComplete: false });
  const { coordinator } = setup("persistent", {
    local: { hiringPostHistory: [persistent, record("local-only")] },
    session: { hiringSessionPostHistory: [session, record("session-only")] }
  });
  const result = await coordinator.handle({ type: "HISTORY_GET" });
  const same = result.records.find((item) => item.id === "urn:same");
  assert.equal(same.fullText, "complete text");
  assert.deepEqual(same.historyStores, ["persistent", "session"]);
  assert.equal(same.historyStore, "combined");
  assert.equal(result.count, 3);
  assert.equal(result.store, "combined");
});

test("delta queues merge post changes and flush the final batch on stop", async () => {
  const { chrome, coordinator } = setup("session");
  await coordinator.handle({ type: "HISTORY_DELTA", monitorId: "tab-1", records: [
    record("same", "complete text", { contentComplete: true, lastSeenAt: iso(-1) })
  ] });
  const queued = await coordinator.handle({ type: "HISTORY_DELTA", monitorId: "tab-1", records: [
    record("same", "complete", { contentComplete: false, metrics: { reactions: 4 } })
  ] });
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, 1);
  assert.equal(chrome._session._data.hiringSessionPostHistory, undefined);
  const flushed = await coordinator.handle({ type: "HISTORY_FLUSH", monitorId: "tab-1" });
  assert.equal(flushed.ok, true);
  assert.equal(flushed.accepted, 1);
  const stored = chrome._session._data.hiringSessionPostHistory;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].fullText, "complete text");
  assert.equal(stored[0].metrics.reactions, 4);
});

test("delta flush reports disabled history instead of silently dropping records", async () => {
  const { coordinator } = setup("off");
  await coordinator.handle({ type: "HISTORY_DELTA", monitorId: "tab-1", records: [record("a")] });
  const flushed = await coordinator.handle({ type: "HISTORY_FLUSH", monitorId: "tab-1" });
  assert.equal(flushed.ok, false);
  assert.equal(flushed.error, "history_disabled");
  assert.equal(flushed.flushed, 0);
});

test("clear scopes and queued mode changes are ordered and complete", async () => {
  const { chrome, coordinator } = setup("persistent", {
    local: { hiringPostHistory: [record("persistent")] },
    session: { hiringSessionPostHistory: [record("session")] }
  });
  const cleared = await coordinator.handle({ type: "HISTORY_CLEAR", scope: "session" });
  assert.equal(cleared.mode, "off");
  assert.equal(chrome._session._data.hiringSessionPostHistory, undefined);
  assert.equal(chrome._local._data.hiringPostHistory.length, 1);

  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  const clearing = coordinator.handle({ type: "HISTORY_CLEAR", scope: "all" });
  const disabling = coordinator.handle({ type: "HISTORY_SET_MODE", mode: "off" });
  const appending = coordinator.handle({ type: "HISTORY_APPEND", records: [record("late")] });
  const [, , rejected] = await Promise.all([clearing, disabling, appending]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "history_disabled");
  assert.equal(chrome._local._data.hiringPostHistory, undefined);
  assert.equal(chrome._session._data.hiringSessionPostHistory, undefined);
});

test("history status reports actual bytes and last successful save metadata per store", async () => {
  const { chrome, coordinator } = setup("session");
  const initial = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(initial.bytes, 4);
  assert.equal(initial.lastSuccessfulSaveAt, null);
  const appended = await coordinator.handle({ type: "HISTORY_APPEND", records: [record("metadata")] });
  assert.equal(appended.ok, true);
  const status = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(status.bytes, Buffer.byteLength(JSON.stringify(chrome._session._data.hiringSessionPostHistory), "utf8") + 2);
  assert.equal(status.stores.session.bytes, Buffer.byteLength(JSON.stringify(chrome._session._data.hiringSessionPostHistory), "utf8"));
  assert.equal(status.stores.session.lastSuccessfulSaveAt, new Date(NOW).toISOString());
  assert.equal(status.lastSuccessfulSaveAt, new Date(NOW).toISOString());
  assert.equal(chrome._local._data.hiringHistoryMetadata, undefined);
  await coordinator.handle({ type: "HISTORY_CLEAR", scope: "session" });
  assert.equal(chrome._session._data.hiringHistoryMetadata, undefined);
});

test("local data clear removes selected settings and all history", async () => {
  const { chrome, coordinator } = setup("persistent", {
    local: { hiringPostHistory: [record("persistent")] },
    session: { hiringSessionPostHistory: [record("session")] }
  });
  const result = await coordinator.handle({ type: "LOCAL_DATA_CLEAR", scopes: ["all"] });
  assert.equal(result.ok, true);
  assert.deepEqual(chrome._local._data, {});
  assert.deepEqual(chrome._session._data, {});
});
