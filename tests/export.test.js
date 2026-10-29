"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const shared = require("../core/linkedin-shared.js");
require("../core/sha256.js");
require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");
const exporter = require("../features/popup/popup-export.js");

const NOW = "2026-02-01T12:00:00.000Z";

function samplePost(overrides = {}) {
  return {
    id: "urn:li:activity:100",
    sourcePostId: "100",
    permalink: "https://www.linkedin.com/posts/acme-activity-100?trk=feed",
    category: "open_role",
    confidence: "strong",
    score: 6,
    scoreBasis: "openScore",
    evidence: [{ label: "Hiring phrase", phrase: "we're hiring", occurrences: [0] }],
    signals: { activeOpening: true, email: "full" },
    fullText: "We're hiring a backend engineer.",
    author: { name: "=Evil Recruiter", profileUrl: "https://www.linkedin.com/in/evil?trk=x" },
    metrics: { reactions: 3, comments: 1, reposts: 0, views: null },
    postAge: { label: "2d", ageDaysApprox: 2 },
    extracted: { emails: ["jobs@acme.com"], jobTitles: ["Backend Engineer"], hashtags: ["hiring"], links: ["https://acme.example/jobs"] },
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...overrides
  };
}

test("projectPost hides full text, emails and author metadata unless requested", () => {
  const projected = exporter.projectPost(samplePost(), {});
  assert.equal(projected.fullText, undefined);
  assert.equal(projected.extracted.emails, undefined);
  assert.equal(projected.extracted.jobTitles[0], "Backend Engineer");
  assert.equal(projected.author.name, "=Evil Recruiter");
  assert.equal(projected.permalink, "https://www.linkedin.com/posts/acme-activity-100");
  assert.equal(projected.confidenceRank, shared.CONFIDENCE_RANK.strong);
});

test("projectPost includes gated fields when the user opts in", () => {
  const projected = exporter.projectPost(samplePost(), { includeFullText: true, includeEmails: true });
  assert.equal(projected.fullText, "We're hiring a backend engineer.");
  assert.deepEqual(projected.extracted.emails, ["jobs@acme.com"]);
});

test("projectPost marks openings older than 60 days as stale", () => {
  const projected = exporter.projectPost(samplePost({ postAge: { label: "3mo", ageDaysApprox: 95 } }), {});
  assert.equal(projected.postAge.stale, true);
});

test("buildJsonPayload carries schema, provenance and projected posts", () => {
  const payload = exporter.buildJsonPayload([samplePost()], {
    now: () => NOW,
    exportRunId: "run-1",
    extensionVersion: "2.0.0",
    locale: "en"
  });
  assert.equal(payload.schemaVersion, shared.SCHEMA_VERSION);
  assert.equal(payload.exportRunId, "run-1");
  assert.equal(payload.exportedAt, NOW);
  assert.equal(payload.posts.length, 1);
  assert.equal(payload.posts[0].fullText, undefined);
  assert.match(payload.provenance.rulesHash, /^sha256:/);
  assert.match(payload.provenance.classifierHash, /^sha256:/);
  assert.equal(payload.fieldsIncluded.fullText, false);
});

test("buildJsonPayload filters to the selected category on request", () => {
  const payload = exporter.buildJsonPayload(
    [samplePost(), samplePost({ id: "urn:li:activity:101", category: "job_seeker" })],
    { preferences: { exportFilteredOnly: true, filter: "job_seeker" }, now: () => NOW, exportRunId: "run-2" });
  assert.equal(payload.posts.length, 1);
  assert.equal(payload.posts[0].category, "job_seeker");
  assert.equal(payload.selectedCategory, "job_seeker");
});

test("buildCsv emits a BOM, a stable header and one row per post", () => {
  const csv = exporter.buildCsv([samplePost()], { now: () => NOW, exportRunId: "run-3" });
  assert.equal(csv.startsWith("\uFEFF"), true);
  const lines = csv.slice(1).split("\r\n");
  const headerIndex = lines.findIndex((line) => line.startsWith('"id"'));
  assert.ok(headerIndex > 0, "metadata lines precede the header");
  const header = lines[headerIndex];
  assert.ok(header.includes('"signal_activeOpening"'));
  assert.ok(header.includes('"fullText"'));
  assert.equal(lines.length, headerIndex + 2);
  const row = lines[headerIndex + 1];
  assert.ok(row.includes("'=Evil Recruiter"), "formula-like author names are neutralized");
});

test("buildCsv leaves full-text cells empty unless requested", () => {
  const withoutText = exporter.buildCsv([samplePost()], { now: () => NOW, exportRunId: "run-4" });
  assert.equal(withoutText.includes("We're hiring a backend engineer."), false);
  const withText = exporter.buildCsv([samplePost()], {
    preferences: { includeFullText: true }, now: () => NOW, exportRunId: "run-5"
  });
  assert.equal(withText.includes("We're hiring a backend engineer."), true);
});

test("buildHtml escapes markup in exported text", () => {
  const html = exporter.buildHtml([samplePost({ fullText: "<script>alert(1)</script>" })], {
    preferences: { includeFullText: true }, now: () => NOW
  });
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
});

test("classifier string evidence still projects into structured evidence", () => {
  const projected = exporter.projectPost(
    samplePost({ evidence: ["Hiring phrase: we're hiring", "Email address"], evidenceDetail: undefined }), {});
  assert.deepEqual(projected.evidence, [
    { label: "Hiring phrase", phrase: "we're hiring", occurrences: [] },
    { label: "Email address", phrase: null, occurrences: [] }
  ]);
});

test("buildMarkdown renders one section per post", () => {
  const markdown = exporter.buildMarkdown([samplePost()], { now: () => NOW });
  assert.match(markdown, /^# LinkedIn hiring posts \(1\)/);
  assert.match(markdown, /## \[open_role · strong\]/);
  assert.ok(markdown.includes("Hiring phrase: we're hiring"));
});

test("mergeExportSources dedupes by id and records provenance", () => {
  const history = samplePost({ fullText: "short", lastSeenAt: "2026-01-01T00:00:00.000Z" });
  const current = samplePost({ lastSeenAt: "2026-02-01T00:00:00.000Z" });
  const merged = exporter.mergeExportSources([current], [history]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].historyStore, "combined");
  assert.deepEqual(merged[0].historyStores.sort(), ["current", "persistent"]);
});

test("migratePost canonicalizes identity fields and fills defaults", () => {
  const migrated = exporter.migratePost({
    permalink: "https://www.linkedin.com/posts/acme-activity-9?trk=x",
    author: "Jane Doe",
    text: "Hello",
    likesCount: 4
  });
  assert.equal(migrated.permalink, "https://www.linkedin.com/posts/acme-activity-9");
  assert.deepEqual(migrated.author, { name: "Jane Doe", profileUrl: null });
  assert.equal(migrated.category, "none");
  assert.equal(migrated.metrics.reactions, 4);
  assert.match(migrated.id, /^url:/);
});

test("sanitizeDiagnostic keeps counters and drops post content, emails and URLs", () => {
  const diagnostic = exporter.sanitizeDiagnostic({
    generatedAt: NOW,
    extensionVersion: "2.0.0!",
    browserVersion: "Chrome 140",
    counts: { posts: 3, bad: "nope" },
    operations: { historyGet: 2 },
    errors: { storage_unavailable: 1 },
    selectorHealth: { level: "ok", message: "healthy", postText: "secret", email: "a@b.c" },
    postText: "secret post body",
    email: "jane@example.com",
    url: "https://www.linkedin.com/posts/secret"
  });
  const serialized = JSON.stringify(diagnostic);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("jane@example.com"), false);
  assert.equal(serialized.includes("linkedin.com/posts"), false);
  assert.equal(diagnostic.extensionVersion, "2.0.0");
  assert.equal(diagnostic.counts.posts, 3);
  assert.equal(diagnostic.counts.bad, undefined);
  assert.deepEqual(diagnostic.errors, [{ code: "storage_unavailable", count: 1 }]);
});
