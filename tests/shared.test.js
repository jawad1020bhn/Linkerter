"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const sha256 = require("../core/sha256.js");
const shared = require("../core/linkedin-shared.js");

test("sha256 matches the published NIST vector for \"abc\"", () => {
  assert.equal(sha256.sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256.digest("abc"),
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sanitizeSettings maps legacy mode names", () => {
  assert.equal(shared.sanitizeSettings({ mode: "quick" }).mode, "fast");
  assert.equal(shared.sanitizeSettings({ mode: "super_safe" }).mode, "super_fast");
  assert.equal(shared.sanitizeSettings({ mode: "nonsense" }).mode, "standard");
});

test("super_fast clamps time and steps and forces pause-on-input", () => {
  const settings = shared.sanitizeSettings({ mode: "super_fast", maxMinutes: 60, maxSteps: 500, pauseOnInput: false });
  assert.deepEqual(settings, { mode: "super_fast", maxMinutes: 15, maxSteps: 120, pauseOnInput: true });
});

test("sanitizeSettings rejects values outside the offered options", () => {
  assert.deepEqual(shared.sanitizeSettings({ maxMinutes: 7, maxSteps: 999 }), {
    mode: "standard", maxMinutes: 15, maxSteps: 180, pauseOnInput: true
  });
});

test("sanitizeHiringPreferences treats a legacy keepHistory flag as persistent mode", () => {
  assert.equal(shared.sanitizeHiringPreferences({ keepHistory: true }).historyMode, "persistent");
  assert.equal(shared.sanitizeHiringPreferences({ historyMode: "session" }).historyMode, "session");
  assert.equal(shared.sanitizeHiringPreferences({ historyMode: "bogus" }).historyMode, "off");
  assert.equal(shared.sanitizeHiringPreferences({ historyRetentionDays: 12 }).historyRetentionDays, 30);
});

test("parseLinkedInUrl only accepts https LinkedIn feed URLs", () => {
  assert.equal(shared.parseLinkedInUrl("https://www.linkedin.com/feed/").isFeed, true);
  assert.equal(shared.parseLinkedInUrl("https://www.linkedin.com/").isFeed, true);
  assert.equal(shared.parseLinkedInUrl("https://linkedin.com/feed").isFeed, true);
  assert.equal(shared.parseLinkedInUrl("http://www.linkedin.com/feed").isFeed, false);
  assert.equal(shared.parseLinkedInUrl("https://evil.example/feed").isFeed, false);
  assert.equal(shared.parseLinkedInUrl("https://www.linkedin.com/jobs/").isFeed, false);
  assert.equal(shared.parseLinkedInUrl("not a url").isFeed, false);
});

test("canonicalizeLinkedInUrl strips tracking parameters but keeps the update URN", () => {
  assert.equal(
    shared.canonicalizeLinkedInUrl(
      "https://www.linkedin.com/posts/foo_bar-activity-123?trk=abc&update=urn%3Ali%3Aactivity%3A123#frag",
      "permalink"),
    "https://www.linkedin.com/posts/foo_bar-activity-123?update=urn%3Ali%3Aactivity%3A123"
  );
});

test("canonicalizeLinkedInUrl rejects foreign hosts, credentials, odd ports and wrong paths", () => {
  assert.equal(shared.canonicalizeLinkedInUrl("https://evil.example/posts/a-activity-1", "permalink"), null);
  assert.equal(shared.canonicalizeLinkedInUrl("https://user:pw@www.linkedin.com/in/jane", "profile"), null);
  assert.equal(shared.canonicalizeLinkedInUrl("https://www.linkedin.com:8443/in/jane", "profile"), null);
  assert.equal(shared.canonicalizeLinkedInUrl("https://www.linkedin.com/jobs/view/1", "permalink"), null);
});

test("canonicalizeLinkedInUrl accepts profile and company pages", () => {
  assert.equal(shared.canonicalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe?trk=x", "profile"),
    "https://www.linkedin.com/in/jane-doe");
  assert.equal(shared.canonicalizeLinkedInUrl("https://www.linkedin.com/company/acme/", "profile"),
    "https://www.linkedin.com/company/acme/");
});

test("canonicalPostId prefers source id, then permalink, then normalized text", () => {
  assert.equal(shared.canonicalPostId({ id: "urn:li:activity:1" }), "urn:li:activity:1");
  assert.equal(shared.canonicalPostId({ sourcePostId: "712345" }), "urn:712345");
  assert.equal(
    shared.canonicalPostId({ permalink: "https://www.linkedin.com/posts/a-activity-9?trk=x" }),
    "url:https://www.linkedin.com/posts/a-activity-9"
  );
  assert.equal(
    shared.canonicalPostId({
      author: { name: "  Élodie  Martin " },
      fullText: "  Nous   recrutons ! "
    }),
    "text:elodie martin|nous recrutons !"
  );
});

test("mergePostRecords keeps the earliest first-seen and prefers complete text", () => {
  const previous = {
    id: "urn:1", fullText: "short", contentComplete: false,
    firstSeenAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-02T00:00:00.000Z",
    author: { name: "A", profileUrl: null }, metrics: { reactions: 1 }
  };
  const next = {
    id: "urn:1", fullText: "the complete post text", contentComplete: true,
    firstSeenAt: "2026-01-03T00:00:00.000Z", lastSeenAt: "2026-01-03T00:00:00.000Z",
    author: { name: "B" }
  };
  const merged = shared.mergePostRecords(previous, next);
  assert.equal(merged.fullText, "the complete post text");
  assert.equal(merged.contentComplete, true);
  assert.equal(merged.extractionStatus, "complete");
  assert.equal(merged.firstSeenAt, "2026-01-01T00:00:00.000Z");
  assert.equal(merged.lastSeenAt, "2026-01-03T00:00:00.000Z");
  assert.equal(merged.author.name, "B");
  assert.equal(merged.author.profileUrl, null);
  assert.equal(merged.metrics.reactions, 1);
});

test("mergePostRecords keeps partial text as partial and takes the longer body", () => {
  const merged = shared.mergePostRecords(
    { id: "urn:1", fullText: "short", contentComplete: false, lastSeenAt: "2026-01-01T00:00:00.000Z" },
    { id: "urn:1", fullText: "a much longer partial body", contentComplete: false, lastSeenAt: "2026-01-02T00:00:00.000Z" }
  );
  assert.equal(merged.fullText, "a much longer partial body");
  assert.equal(merged.contentComplete, false);
  assert.equal(merged.extractionStatus, "partial");
});

test("pruneHistory drops expired records only when retention is enabled", () => {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  const old = { id: "urn:old", lastSeenAt: "2025-11-01T00:00:00.000Z" };
  const recent = { id: "urn:recent", lastSeenAt: "2026-01-30T00:00:00.000Z" };
  const enabled = shared.pruneHistory([old, recent], { enabled: true, retentionDays: 30, now });
  assert.deepEqual(enabled.records.map((record) => record.id), ["urn:recent"]);
  assert.equal(enabled.truncated, true);
  const disabled = shared.pruneHistory([old, recent], { enabled: false, retentionDays: 30, now });
  assert.deepEqual(disabled.records.map((record) => record.id), ["urn:recent", "urn:old"]);
});

test("pruneHistory keeps the newest records under the record cap and preserves object identity", () => {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  const older = { id: "urn:a", lastSeenAt: "2026-01-01T00:00:00.000Z" };
  const newer = { id: "urn:b", lastSeenAt: "2026-01-31T00:00:00.000Z" };
  const result = shared.pruneHistory([older, newer], { enabled: false, now, maxRecords: 1 });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0], newer);
  assert.equal(result.truncated, true);
});

test("pruneHistory rejects malformed records and future timestamps", () => {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  const result = shared.pruneHistory(
    [null, "nope", { id: "urn:no-date" }, { id: "urn:future", lastSeenAt: "2026-03-01T00:00:00.000Z" }],
    { enabled: false, now });
  assert.deepEqual(result.records, []);
  assert.equal(result.truncated, true);
});

test("csvCell neutralizes spreadsheet formulas but leaves trusted numbers alone", () => {
  assert.equal(shared.csvCell("=1+1"), "\"'=1+1\"");
  assert.equal(shared.csvCell("@SUM(A1)"), "\"'@SUM(A1)\"");
  assert.equal(shared.csvCell(42), "\"42\"");
  assert.equal(shared.csvCell('say "hi"'), "\"say \"\"hi\"\"\"");
  assert.equal(shared.csvCell(null), "\"\"");
});

test("pipelinePostKey mirrors the result-row identity", () => {
  assert.equal(shared.pipelinePostKey({ id: "urn:li:activity:1" }), "urn:li:activity:1");
  assert.equal(shared.pipelinePostKey({ sourcePostId: "712345" }), "712345");
  assert.equal(shared.pipelinePostKey({ permalink: "https://www.linkedin.com/posts/a-activity-9" }),
    "https://www.linkedin.com/posts/a-activity-9");
  assert.equal(shared.pipelinePostKey({}), "");
  assert.equal(shared.pipelinePostKey(null), "");
});

test("isNewSince compares firstSeenAt with the previous run baseline", () => {
  const baseline = "2026-02-01T00:00:00.000Z";
  assert.equal(shared.isNewSince({ firstSeenAt: "2026-02-02T00:00:00.000Z" }, baseline), true);
  assert.equal(shared.isNewSince({ firstSeenAt: "2026-01-31T00:00:00.000Z" }, baseline), false);
  assert.equal(shared.isNewSince({ firstSeenAt: baseline }, baseline), false, "the baseline instant is not new");
  assert.equal(shared.isNewSince({ firstSeenAt: "not a date" }, baseline), false);
  assert.equal(shared.isNewSince({ firstSeenAt: "2026-02-02T00:00:00.000Z" }, null), true,
    "with no earlier run every detection is new");
  assert.equal(shared.isNewSince({ firstSeenAt: "2026-02-02T00:00:00.000Z" }, "garbage"), true);
});

test("sanitizePipeline keeps valid states, drops junk and caps the newest entries", () => {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  const pipeline = shared.sanitizePipeline({
    "urn:1": { state: "saved", updatedAt: "2026-01-01T00:00:00.000Z" },
    "urn:2": { state: "applied", updatedAt: "2026-01-20T00:00:00.000Z" },
    "urn:3": { state: "bogus", updatedAt: "2026-01-20T00:00:00.000Z" },
    "urn:4": "saved",
    "": { state: "saved" },
    "urn:5": { state: "saved", updatedAt: "not a date" }
  }, { now, limit: 2 });
  assert.deepEqual(Object.keys(pipeline).sort(), ["urn:2", "urn:5"]);
  assert.equal(pipeline["urn:5"].updatedAt, new Date(now).toISOString());
  assert.deepEqual(shared.sanitizePipeline(null), {});
  assert.deepEqual(shared.sanitizePipeline([1, 2]), {});
});

test("setPipelineState is immutable, toggles off and never mutates the input", () => {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  const empty = Object.freeze({});
  const saved = shared.setPipelineState(empty, "urn:1", "saved", now);
  assert.notEqual(saved, empty);
  assert.equal(saved["urn:1"].state, "saved");
  assert.equal(saved["urn:1"].updatedAt, new Date(now).toISOString());
  const applied = shared.setPipelineState(saved, "urn:1", "applied", now + 1000);
  assert.equal(applied["urn:1"].state, "applied");
  assert.equal(saved["urn:1"].state, "saved", "the previous map is untouched");
  const cleared = shared.setPipelineState(applied, "urn:1", "", now + 2000);
  assert.equal(Object.hasOwn(cleared, "urn:1"), false);
  assert.equal(Object.hasOwn(shared.setPipelineState(saved, "", "saved", now), "urn:1"), true,
    "an empty key leaves the map unchanged");
});

test("pipelineCounts and applyPipelineFilter agree on every view", () => {
  const baselineAt = "2026-02-01T00:00:00.000Z";
  const states = {
    "urn:1": { state: "saved", updatedAt: "2026-02-02T00:00:00.000Z" },
    "urn:2": { state: "applied", updatedAt: "2026-02-02T00:00:00.000Z" }
  };
  const records = [
    { id: "urn:1", firstSeenAt: "2026-01-01T00:00:00.000Z" },
    { id: "urn:2", firstSeenAt: "2026-01-01T00:00:00.000Z" },
    { id: "urn:3", firstSeenAt: "2026-02-02T00:00:00.000Z" },
    { id: "urn:4", firstSeenAt: "2026-02-03T00:00:00.000Z" },
    // New but already triaged: it belongs to the Saved view, not to the New queue.
    { id: "urn:5", firstSeenAt: "2026-02-03T00:00:00.000Z" }
  ];
  const withTriagedNew = { ...states, "urn:5": { state: "saved", updatedAt: "2026-02-03T01:00:00.000Z" } };
  assert.deepEqual(shared.pipelineCounts(records, { states, baselineAt }),
    { all: 5, new: 3, saved: 1, applied: 1 });
  assert.deepEqual(shared.pipelineCounts(records, { states: withTriagedNew, baselineAt }),
    { all: 5, new: 2, saved: 2, applied: 1 });
  const ids = (filter) => shared.applyPipelineFilter(records, { filter, states, baselineAt }).map((record) => record.id);
  assert.deepEqual(ids("all"), ["urn:1", "urn:2", "urn:3", "urn:4", "urn:5"]);
  assert.deepEqual(ids("new"), ["urn:3", "urn:4", "urn:5"]);
  assert.deepEqual(shared.applyPipelineFilter(records, { filter: "new", states: withTriagedNew, baselineAt })
    .map((record) => record.id), ["urn:3", "urn:4"]);
  assert.deepEqual(ids("saved"), ["urn:1"]);
  assert.deepEqual(ids("applied"), ["urn:2"]);
  assert.deepEqual(ids("nonsense"), ["urn:1", "urn:2", "urn:3", "urn:4", "urn:5"]);
});

test("preferences no longer carry locale or theme fields", () => {
  const prefs = shared.sanitizeHiringPreferences({ locale: "fr", theme: "dark", filter: "possible" });
  assert.equal(Object.hasOwn(prefs, "locale"), false);
  assert.equal(Object.hasOwn(prefs, "theme"), false);
  assert.equal(prefs.filter, "possible", "unrelated preferences still sanitize");
});

test("utf8ByteLength counts characters, not UTF-16 code units", () => {
  assert.equal(shared.utf8ByteLength("abc"), 3);
  assert.equal(shared.utf8ByteLength("é"), 2);
  assert.equal(shared.utf8ByteLength("مرحبا"), 10);
  assert.equal(shared.utf8ByteLength("😀"), 4);
});
