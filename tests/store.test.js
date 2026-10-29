"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
const shared = require("../core/linkedin-shared.js");
const store = require("../features/popup/popup-store.js");

test("sanitizeReviewLabels accepts strings and objects, drops unknown labels", () => {
  const labels = store.sanitizeReviewLabels({
    "urn:1": "useful",
    "urn:2": { label: "irrelevant", updatedAt: "2026-01-02T00:00:00.000Z" },
    "urn:3": { label: "bogus" },
    "urn:4": { label: "false_positive", updatedAt: "not a date" },
    "": "useful"
  });
  assert.deepEqual([...labels.keys()].sort(), ["urn:1", "urn:2", "urn:4"]);
  assert.equal(labels.get("urn:2").label, "irrelevant");
  assert.match(labels.get("urn:4").updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(store.sanitizeReviewLabels(null).size, 0);
  assert.equal(store.sanitizeReviewLabels([]).size, 0);
});

test("sanitizeReviewLabels keeps the newest entries under the cap", () => {
  const raw = {};
  for (let index = 0; index < 5; index += 1) {
    raw[`urn:${index}`] = { label: "useful", updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString() };
  }
  const labels = store.sanitizeReviewLabels(raw, 2);
  assert.deepEqual([...labels.keys()], ["urn:3", "urn:4"]);
});

test("sanitizeHistory keeps identified records, newest first, capped", () => {
  const history = store.sanitizeHistory([
    { id: "urn:old", lastSeenAt: "2026-01-01T00:00:00.000Z" },
    { id: "urn:new", lastSeenAt: "2026-02-01T00:00:00.000Z" },
    { permalink: "https://www.linkedin.com/posts/a-activity-1" },
    { nope: true },
    null
  ], 2);
  assert.deepEqual(history.map((record) => record.id || record.permalink),
    ["urn:new", "urn:old"]);
  assert.deepEqual(store.sanitizeHistory("nope"), []);
});

test("sanitizeStoredPreferences merges defaults and honours legacy flags", () => {
  const legacy = store.sanitizeStoredPreferences({ keepHistory: true, includeMetrics: false });
  assert.equal(legacy.historyMode, "persistent");
  assert.equal(legacy.includePostAge, false, "schema-2 includeMetrics fed the age toggle");
  assert.equal(legacy.locale, "auto");
  assert.equal(legacy.theme, "auto");
  assert.equal(legacy.pipelineFilter, "all");

  const modern = store.sanitizeStoredPreferences({
    locale: "pt-BR", theme: "dark", pipelineFilter: "applied", filter: "closed",
    historyMode: "session", exportFormat: "markdown"
  });
  assert.equal(modern.locale, "pt");
  assert.equal(modern.theme, "dark");
  assert.equal(modern.pipelineFilter, "applied");
  assert.equal(modern.filter, "closed");
  assert.equal(modern.historyMode, "session");
  assert.equal(modern.exportFormat, "markdown");

  const junk = store.sanitizeStoredPreferences({ locale: "ja", theme: "neon", pipelineFilter: "x", filter: "x", historyMode: "x" });
  assert.equal(junk.locale, "auto");
  assert.equal(junk.theme, "auto");
  assert.equal(junk.pipelineFilter, "all");
  assert.equal(junk.filter, "all");
  assert.equal(junk.historyMode, "off");
});

test("nextPipelineState toggles the active state off and switches between states", () => {
  assert.equal(store.nextPipelineState("", "saved"), "saved");
  assert.equal(store.nextPipelineState("saved", "saved"), "");
  assert.equal(store.nextPipelineState("saved", "applied"), "applied");
  assert.equal(store.nextPipelineState("applied", "applied"), "");
  assert.equal(store.nextPipelineState("saved", "nonsense"), "");
});

test("pipelineChips reports every view in a fixed order with counts", () => {
  const chips = store.pipelineChips({ all: 12, new: 3, saved: 2, applied: 1 }, "saved");
  assert.deepEqual(chips.map((chip) => chip.id), ["all", "new", "saved", "applied"]);
  assert.deepEqual(chips.map((chip) => chip.count), [12, 3, 2, 1]);
  assert.deepEqual(chips.map((chip) => chip.active), [false, false, true, false]);
  assert.equal(chips[0].labelKey, "pipeline.all");
  assert.equal(store.pipelineChips({}, "nonsense")[0].active, true, "unknown views fall back to All");
});

test("describeDelta reports the new-since-last-run count only when there is a baseline", () => {
  assert.deepEqual(store.describeDelta({ all: 8, new: 3 }, "2026-02-01T00:00:00.000Z"),
    { count: 3, hasBaseline: true });
  assert.deepEqual(store.describeDelta({ all: 8, new: 8 }, null),
    { count: 0, hasBaseline: false });
  assert.deepEqual(store.describeDelta(null, "2026-02-01T00:00:00.000Z"),
    { count: 0, hasBaseline: true });
});

test("the store re-exports the shared pipeline and locale rules", () => {
  assert.equal(store.PIPELINE_LIMIT, shared.PIPELINE_LIMIT);
  assert.equal(store.SUPPORTED_LOCALES, shared.SUPPORTED_LOCALES);
  assert.equal(store.resolveTheme, shared.resolveTheme);
});
