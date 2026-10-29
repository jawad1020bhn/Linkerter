"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
const shared = require("../core/linkedin-shared.js");
const { createHistoryCoordinator, normalizeHistoryRecord } = require("../infrastructure/background.js");

const NOW = Date.parse("2026-02-01T12:00:00.000Z");

function createFakeChrome(seed = {}) {
  const areas = { local: new Map(Object.entries(seed.local || {})), session: new Map(Object.entries(seed.session || {})) };
  const area = (map) => ({
    async get(keys) {
      const wanted = Array.isArray(keys) ? keys : [keys];
      const output = {};
      for (const key of wanted) {
        if (map.has(key)) output[key] = structuredClone(map.get(key));
      }
      return output;
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) map.set(key, structuredClone(value));
    },
    async remove(keys) {
      for (const key of [].concat(keys)) map.delete(key);
    },
    async clear() {
      map.clear();
    }
  });
  return { chromeApi: { storage: { local: area(areas.local), session: area(areas.session) } }, areas };
}

function createCoordinator(seed) {
  const fake = createFakeChrome(seed);
  const coordinator = createHistoryCoordinator({ chromeApi: fake.chromeApi, now: () => NOW });
  return { ...fake, coordinator };
}

function postRecord(overrides = {}) {
  return {
    permalink: "https://www.linkedin.com/posts/acme-activity-100?trk=feed",
    author: { name: "Jane Recruiter", profileUrl: "https://www.linkedin.com/in/jane-recruiter?trk=feed" },
    fullText: "We're hiring a backend engineer.",
    category: "open_role",
    confidence: "strong",
    lastSeenAt: new Date(NOW).toISOString(),
    ...overrides
  };
}

test("history append is refused while the mode is off", async () => {
  const { coordinator, areas } = createCoordinator();
  const response = await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  assert.equal(response.ok, false);
  assert.equal(response.error, "history_disabled");
  assert.equal(response.accepted, 0);
  assert.equal(response.rejected, 1);
  assert.equal(areas.local.has("hiringPostHistory"), false);
});

test("persistent mode stores normalized records in local storage", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  const response = await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  assert.equal(response.ok, true);
  assert.equal(response.accepted, 1);
  assert.equal(response.store, "persistent");
  const stored = areas.local.get("hiringPostHistory");
  assert.equal(stored.length, 1);
  assert.match(stored[0].id, /^url:https:\/\/www\.linkedin\.com\/posts\/acme-activity-100$/);
  assert.equal(stored[0].permalink, "https://www.linkedin.com/posts/acme-activity-100");
  assert.equal(stored[0].author.profileUrl, "https://www.linkedin.com/in/jane-recruiter");
  assert.equal(stored[0].contentComplete, true);
});

test("session mode writes to session storage, never local", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "session" });
  const response = await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  assert.equal(response.store, "session");
  assert.equal(areas.session.get("hiringSessionPostHistory").length, 1);
  assert.equal(areas.local.has("hiringPostHistory"), false);
});

test("re-appending the same post merges it into one complete record", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  await coordinator.handle({
    type: "HISTORY_APPEND",
    records: [postRecord({ fullText: "We're hiring", contentComplete: false, extractionStatus: "partial" })]
  });
  await coordinator.handle({
    type: "HISTORY_APPEND",
    records: [postRecord({ fullText: "We're hiring a backend engineer.", contentComplete: true })]
  });
  const stored = areas.local.get("hiringPostHistory");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].fullText, "We're hiring a backend engineer.");
  assert.equal(stored[0].contentComplete, true);
  assert.equal(stored[0].extractionStatus, "complete");
});

test("records without any identity are rejected instead of stored", async () => {
  const { coordinator } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  const response = await coordinator.handle({
    type: "HISTORY_APPEND",
    records: [postRecord({ permalink: "https://evil.example/posts/x", author: { name: "" }, fullText: "" })]
  });
  assert.equal(response.ok, true);
  assert.equal(response.accepted, 0);
  assert.equal(response.rejected, 1);
  assert.equal(response.error, "invalid_data");
});

test("the record cap reports a history limit and keeps the newest records", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  const records = Array.from({ length: shared.HISTORY_LIMITS.maxRecords + 1 }, (_, index) =>
    postRecord({
      permalink: `https://www.linkedin.com/posts/acme-activity-${index}`,
      fullText: `Post number ${index}`,
      lastSeenAt: new Date(NOW - index * 1000).toISOString()
    }));
  const response = await coordinator.handle({ type: "HISTORY_APPEND", records });
  assert.equal(response.accepted, shared.HISTORY_LIMITS.maxRecords);
  assert.equal(response.rejected, 1);
  assert.equal(response.limitReached, true);
  assert.equal(response.error, "history_limit");
  assert.equal(areas.local.get("hiringPostHistory").length, shared.HISTORY_LIMITS.maxRecords);
});

test("status merges both stores and marks the provenance of each record", async () => {
  const { coordinator } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "session" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord({ fullText: "We're hiring a backend engineer. Apply now." })] });
  const response = await coordinator.handle({ type: "HISTORY_GET" });
  assert.equal(response.ok, true);
  assert.equal(response.count, 1);
  assert.equal(response.records.length, 1);
  assert.equal(response.records[0].historyStore, "combined");
  assert.deepEqual(response.records[0].historyStores, ["persistent", "session"]);
  assert.equal(response.stores.session.count, 1);
  assert.equal(response.stores.persistent.count, 1);
});

test("clearing all history empties both stores and turns saving off", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  const cleared = await coordinator.handle({ type: "HISTORY_CLEAR", scope: "all" });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.mode, "off");
  assert.equal(cleared.count, 0);
  assert.equal(areas.local.has("hiringPostHistory"), false);
  assert.equal(areas.session.has("hiringSessionPostHistory"), false);
});

test("LOCAL_DATA_CLEAR all wipes every storage area", async () => {
  const { coordinator, areas } = createCoordinator();
  await coordinator.handle({ type: "HISTORY_SET_MODE", mode: "persistent" });
  await coordinator.handle({ type: "HISTORY_APPEND", records: [postRecord()] });
  const response = await coordinator.handle({ type: "LOCAL_DATA_CLEAR", scopes: ["all"] });
  assert.deepEqual(response.cleared, ["all"]);
  assert.equal(areas.local.size, 0);
  assert.equal(areas.session.size, 0);
});

test("a legacy keepHistory flag migrates to persistent mode", async () => {
  const { coordinator, areas } = createCoordinator({ local: { hiringSettings: { keepHistory: true } } });
  const response = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(response.mode, "persistent");
  assert.equal(areas.local.get("hiringPreferences").historyMode, "persistent");
});

test("unknown message types are reported as not_found", async () => {
  const { coordinator } = createCoordinator();
  const response = await coordinator.handle({ type: "NOPE" });
  assert.deepEqual(response, { ok: false, error: "not_found" });
});

test("normalizeHistoryRecord stamps missing timestamps and rejects junk", () => {
  const record = normalizeHistoryRecord({ permalink: "https://www.linkedin.com/posts/acme-activity-1", fullText: "hello" }, () => NOW);
  assert.equal(record.lastSeenAt, new Date(NOW).toISOString());
  assert.equal(record.firstSeenAt, record.lastSeenAt);
  assert.equal(normalizeHistoryRecord({}, () => NOW), null);
  assert.equal(normalizeHistoryRecord("nope", () => NOW), null);
  assert.equal(normalizeHistoryRecord([], () => NOW), null);
});
