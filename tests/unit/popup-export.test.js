"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const exporter = require("../../popup-export.js");

const complete = {
  id: "urn:1", sourcePostId: "1", category: "open_role", confidence: "strong", score: 7,
  evidence: ["Hiring phrase"], signals: { activeOpening: true, recruiterSearch: false },
  fullText: "Complete historical text", contentComplete: true, extractionStatus: "complete",
  firstSeenAt: "2026-10-20T00:00:00.000Z", lastSeenAt: "2026-10-20T00:00:00.000Z",
  author: { name: "Employer", profileUrl: "https://www.linkedin.com/company/acme/" },
  permalink: "https://www.linkedin.com/posts/acme_activity-1",
  extracted: { emails: ["jobs@example.com"], jobTitles: ["Engineer"], hashtags: ["hiring"], links: [] },
  metrics: { reactions: 2, comments: 1, reposts: null, views: null },
  postAge: { label: "1d", publishedAt: null, ageSecondsApprox: 86400, ageDaysApprox: 1 }
};

test("fresh-install projection defaults omit full text and emails but retain complete signals", () => {
  const projected = exporter.projectPost(complete);
  assert.equal(projected.fullText, undefined);
  assert.equal(projected.extracted?.emails, undefined);
  assert.equal(projected.extracted.jobTitles[0], "Engineer");
  assert.deepEqual({ ...projected.signals }, complete.signals);
  assert.equal(projected.author.name, "Employer");
  assert.equal(projected.metrics.reactions, 2);
});

test("JSON schema v2 applies selected fields and categories", () => {
  const payload = exporter.buildJsonPayload([complete, { ...complete, id: "urn:2", category: "closed" }], {
    preferences: { exportFilteredOnly: true, filter: "open_role", includeFullText: true, includeEmails: false },
    now: () => "2026-10-21T00:00:00.000Z"
  });
  assert.equal(payload.schemaVersion, "2.0");
  assert.equal(payload.posts.length, 1);
  assert.equal(payload.posts[0].fullText, complete.fullText);
  assert.equal(payload.posts[0].extracted.emails, undefined);
  assert.equal(payload.selectedCategory, "open_role");
});

test("CSV neutralizes every formula-leading untrusted string variant", () => {
  for (const formula of ["=2+2", "+CMD", "-2+2", "@SUM(A1)", "\t=1", "\r=1", "\n=1", "  =1"]) {
    const csv = exporter.buildCsv([{ ...complete, fullText: formula }], { preferences: { includeFullText: true } });
    assert.ok(csv.includes(`\"'${formula}\"`), JSON.stringify(formula));
  }
});

test("CSV preserves multiline Unicode, uses a BOM and CRLF rows, and honors sensitive defaults", () => {
  const csv = exporter.buildCsv([{ ...complete, fullText: "توظيف\r\nسطر ثانٍ" }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes("\r\n"));
  assert.ok(!csv.includes("Complete historical text"));
  assert.ok(!csv.includes("jobs@example.com"));
  assert.ok(!csv.includes("fullText"));
  assert.ok(!csv.includes("emails"));
});

test("v1/v2 source merges preserve complete history and refresh metadata", () => {
  const v1 = {
    id: "urn:1", text: "Complete historical text", textIsComplete: true,
    observedAt: "2026-10-20T00:00:00.000Z", likesCount: 2, category: "possible"
  };
  const v2 = {
    ...complete, fullText: "Complete", contentComplete: false, extractionStatus: "partial",
    lastSeenAt: "2026-10-21T00:00:00.000Z", category: "open_role", metrics: { reactions: 9 }
  };
  const merged = exporter.mergeExportSources({ posts: [v2] }, { records: [v1] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].fullText, "Complete historical text");
  assert.equal(merged[0].contentComplete, true);
  assert.equal(merged[0].metrics.reactions, 9);
  assert.equal(merged[0].category, "open_role");
});

test("diagnostics exclude content, emails, all URLs, and free-form error messages", () => {
  const forbidden = ["SECRET POST", "person@example.com", "https://www.linkedin.com/in/example/", "https://www.linkedin.com/posts/a_activity-1", "https://www.linkedin.com/feed/"];
  const result = exporter.sanitizeDiagnostic({
    fullText: forbidden[0], emails: [forbidden[1]], tabUrl: forbidden[4],
    browserVersion: "130.0.1.2", messageSchemaVersion: "2.0", extensionVersion: "2.0.0",
    errors: [{ code: "storage_unavailable", message: forbidden[0], count: 2 }],
    selectorHealth: { postRootsFound: 4, message: forbidden[0] },
    timings: { scanMs: 12.5 },
    post: { fullText: forbidden[0], permalink: forbidden[3], author: { profileUrl: forbidden[2] } }
  });
  const json = JSON.stringify(result);
  for (const value of forbidden) assert.equal(json.includes(value), false);
  assert.equal(json.includes("fullText"), false);
  assert.equal(json.includes("tabUrl"), false);
  assert.equal(json.includes("permalink"), false);
  assert.equal(json.includes("profileUrl"), false);
  assert.equal(result.selectorHealth.postRootsFound, 4);
  assert.equal(result.browserVersion, "130.0.1.2");
  assert.equal(result.messageSchemaVersion, "2.0");
  assert.equal(result.extensionVersion, "2.0.0");
  assert.equal(result.errors[0].code, "storage_unavailable");
});

test("diagnostic download is explicit and revokes its object URL", () => {
  let clicked = false;
  let removed = false;
  const revoked = [];
  const anchor = { style: {}, click() { clicked = true; }, remove() { removed = true; } };
  const documentRef = { createElement: () => anchor, body: { append() {} } };
  const urlApi = { createObjectURL: () => "blob:diagnostic", revokeObjectURL: (url) => revoked.push(url) };
  const result = exporter.downloadDiagnostic({ selectorHealth: { postRootsFound: 1 } }, {
    documentRef, urlApi, now: () => "2026-10-21T00:00:00.000Z", revokeDelayMs: 0
  });
  assert.equal(result.ok, true);
  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.deepEqual(revoked, ["blob:diagnostic"]);
  assert.equal(result.diagnostic.selectorHealth.postRootsFound, 1);
});
