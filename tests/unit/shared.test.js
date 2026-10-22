"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../../linkedin-shared.js");

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const record = (id, lastSeenAt, extra = {}) => ({
  id,
  firstSeenAt: lastSeenAt,
  lastSeenAt,
  fullText: `text-${id}`,
  contentComplete: true,
  ...extra
});

test("shared CSV encoding neutralizes formula-leading untrusted strings", () => {
  for (const value of ["=2+2", "+CMD", "-2+2", "@SUM(A1)", "\t=1", "\r=1", "\n=1", "  =1"]) {
    const encoded = shared.csvCell(value);
    assert.equal(encoded, `"'${value}"`, value);
  }
  assert.equal(shared.csvCell("ordinary"), '"ordinary"');
  assert.equal(shared.csvCell(-12), '"-12"');
  assert.equal(shared.csvCell(0), '"0"');
});

test("shared CSV encoding preserves quotes, CRLF, arrays, and Unicode", () => {
  assert.equal(shared.csvCell("a,\"b\"\r\nc"), '"a,""b""\r\nc"');
  assert.equal(shared.csvCell(["توظيف", "فرنسا"]), '"[""توظيف"",""فرنسا""]"');
  assert.equal(shared.csvCell(null), '""');
  assert.equal(shared.csvCell(undefined), '""');
});

test("canonical URL parsing accepts only HTTPS LinkedIn feed routes", () => {
  for (const value of [
    "https://www.linkedin.com/",
    "https://www.linkedin.com/?trk=homepage",
    "https://www.linkedin.com/feed",
    "https://www.linkedin.com/feed/?follow=true",
    "https://www.linkedin.com/feed/following/#main"
  ]) {
    assert.equal(shared.parseLinkedInUrl(value).isFeed, true, value);
  }
  for (const value of [
    "http://www.linkedin.com/feed/",
    "https://www.linkedin.com.evil.invalid/feed/",
    "https://evil.invalid/?next=www.linkedin.com/feed/",
    "https://www.linkedin.com/jobs/",
    "not a URL"
  ]) {
    assert.equal(shared.parseLinkedInUrl(value).isFeed, false, value);
  }
});

test("canonical LinkedIn URLs remove tracking and reject lookalike hosts", () => {
  assert.equal(
    shared.canonicalizeLinkedInUrl("https://www.linkedin.com/posts/acme_activity-123?utm_source=share&foo=bar#comments", "permalink"),
    "https://www.linkedin.com/posts/acme_activity-123?foo=bar"
  );
  assert.equal(
    shared.canonicalizeLinkedInUrl("https://www.linkedin.com/in/example/?utm_medium=share#contact", "profile"),
    "https://www.linkedin.com/in/example/"
  );
  assert.equal(shared.canonicalizeLinkedInUrl("https://evil.invalid/posts/acme_activity-123", "permalink"), null);
  assert.equal(shared.canonicalizeLinkedInUrl("https://evil.invalid/?next=linkedin.com/in/fake", "profile"), null);
});

test("canonical post IDs retain collision-checkable identity", () => {
  const first = shared.canonicalPostId({ author: { name: "A" }, fullText: "First post" });
  const second = shared.canonicalPostId({ author: { name: "A" }, fullText: "Second post" });
  assert.notEqual(first, second);
  assert.equal(first, "text:a|first post");
  assert.equal(second, "text:a|second post");
  assert.equal(
    shared.canonicalPostId({ permalink: "https://www.linkedin.com/posts/a_activity-1?utm_source=share" }),
    shared.canonicalPostId({ permalink: "https://www.linkedin.com/posts/a_activity-1" })
  );
});

test("merge preserves complete text while refreshing observation and metrics", () => {
  const previous = record("same", "2026-10-20T10:00:00.000Z", {
    fullText: "Complete historical text",
    category: "possible",
    metrics: { reactions: 4, comments: null }
  });
  const next = record("same", "2026-10-21T10:00:00.000Z", {
    fullText: "Truncated…",
    contentComplete: false,
    extractionStatus: "partial",
    category: "open_role",
    metrics: { reactions: 8, comments: 2 }
  });
  const merged = shared.mergePostRecords(previous, next);
  assert.equal(merged.fullText, "Complete historical text");
  assert.equal(merged.contentComplete, true);
  assert.equal(merged.extractionStatus, "complete");
  assert.equal(merged.firstSeenAt, previous.firstSeenAt);
  assert.equal(merged.lastSeenAt, next.lastSeenAt);
  assert.equal(merged.category, "open_role");
  assert.deepEqual(merged.metrics, { reactions: 8, comments: 2 });
});

test("enabled retention prunes expiry while disabled history retains old records", () => {
  const boundary = new Date(NOW - 7 * 86_400_000).toISOString();
  const expired = new Date(NOW - 7 * 86_400_000 - 1).toISOString();
  const records = [record("boundary", boundary), record("expired", expired)];
  const enabled = shared.pruneHistory(records, { enabled: true, retentionDays: 7, now: NOW });
  assert.deepEqual(enabled.records.map((item) => item.id), ["boundary"]);
  assert.equal(enabled.truncated, true);
  const disabled = shared.pruneHistory(records, { enabled: false, retentionDays: 7, now: NOW });
  assert.deepEqual(disabled.records.map((item) => item.id), ["boundary", "expired"]);
});

test("retention removes invalid and future observation timestamps", () => {
  const records = [
    record("valid", new Date(NOW).toISOString()),
    record("invalid", "not-a-date"),
    record("future", new Date(NOW + 60_000).toISOString())
  ];
  const result = shared.pruneHistory(records, { enabled: true, retentionDays: 30, now: NOW });
  assert.deepEqual(result.records.map((item) => item.id), ["valid"]);
});

test("history pruning enforces count and real UTF-8 byte limits", () => {
  const records = [
    record("new", new Date(NOW).toISOString(), { fullText: "توظيف" }),
    record("old", new Date(NOW - 1000).toISOString(), { fullText: "قديم" })
  ];
  const one = shared.pruneHistory(records, { enabled: false, retentionDays: 30, now: NOW, maxRecords: 1 });
  assert.deepEqual(one.records.map((item) => item.id), ["new"]);
  assert.equal(one.truncated, true);
  const allBytes = Buffer.byteLength(JSON.stringify(records), "utf8");
  const capped = shared.pruneHistory(records, { enabled: false, retentionDays: 30, now: NOW, maxBytes: allBytes - 1 });
  assert.ok(capped.records.length < records.length);
  assert.ok(capped.bytes <= allBytes - 1);
});

test("settings and hiring preferences migrate v1 values without losing choices", () => {
  assert.deepEqual(shared.sanitizeSettings({ mode: "quick", maxMinutes: 60, maxSteps: 500, pauseOnInput: false }), {
    mode: "fast", maxMinutes: 60, maxSteps: 500, pauseOnInput: false
  });
  assert.deepEqual(shared.sanitizeSettings({ mode: "super_fast", maxMinutes: 60, maxSteps: 500, pauseOnInput: false }), {
    mode: "super_fast", maxMinutes: 15, maxSteps: 120, pauseOnInput: true
  });
  const defaults = shared.sanitizeHiringPreferences({});
  assert.equal(defaults.historyMode, "off");
  assert.equal(defaults.includeFullText, false);
  assert.equal(defaults.includeEmails, false);
  const migrated = shared.sanitizeHiringPreferences({ keepHistory: true, includeFullText: true, includeEmails: true, filter: "closed" });
  assert.equal(migrated.historyMode, "persistent");
  assert.equal(migrated.includeFullText, true);
  assert.equal(migrated.includeEmails, true);
  assert.equal(migrated.filter, "closed");
});
