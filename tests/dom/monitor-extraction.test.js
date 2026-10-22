"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor, fixture } = require("../helpers/load-monitor.js");

test("body expansion ignores comment controls and uses only the selected body", () => {
  const { document, api } = loadMonitor(fixture("collapsed.html"));
  const root = document.querySelector("#post");
  const details = api.getPostTextDetails(root);
  assert.equal(details.control.id, "expand");
  assert.equal(details.body.id, "body");
  assert.equal(details.partial, true);
  assert.equal(api.isSeeMoreControl(document.querySelector("#comments"), root), false);
});

test("collapsed DOM without observed expansion does not claim complete content", () => {
  const { document, api } = loadMonitor(fixture("collapsed.html"));
  const record = api.extractPostRecord(document.querySelector("#post"), { capturedAtMs: 1700003600000 });
  assert.equal(record.contentComplete, false);
  assert.equal(record.extractionStatus, "partial");
  assert.equal(record.fullText.includes("visible part"), true);
});

test("canonical permalink, author, numeric epochs, and localized metrics are lossless", () => {
  const { document, api } = loadMonitor(fixture("collapsed.html"));
  const record = api.extractPostRecord(document.querySelector("#post"), { capturedAtMs: 1700003600000 });
  assert.equal(record.id, "urn:li:activity:123");
  assert.equal(record.permalink, "https://www.linkedin.com/posts/acme_activity-123?foo=bar");
  assert.equal(record.author.profileUrl, "https://www.linkedin.com/in/example/");
  assert.equal(record.postAge.publishedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(record.metrics.reactions, 1200);
  assert.equal(record.metrics.comments, 25);
  assert.equal(record.metrics.reposts, null);
});

test("millisecond epochs and French compact metrics are parsed explicitly", () => {
  const { document, api } = loadMonitor(fixture("expanded.html"));
  const record = api.extractPostRecord(document.querySelector("#post"), { capturedAtMs: 1700003600000 });
  assert.equal(record.postAge.publishedAt, "2023-11-14T22:13:20.123Z");
  assert.equal(record.metrics.comments, 2500);
  assert.equal(record.metrics.views, 1234);
  assert.equal(record.contentComplete, true);
});

test("Arabic-Indic digits, separators, and compact metric suffixes are parsed explicitly", () => {
  const { document, api } = loadMonitor(fixture("arabic.html"));
  const record = api.extractPostRecord(document.querySelector("#post"), { capturedAtMs: 1700003600000 });
  assert.equal(record.postAge.publishedAt, "2023-11-14T22:13:20.000Z");
  assert.deepEqual({ ...record.metrics }, { reactions: 2500, comments: 1200, reposts: 3, views: 12345 });
});

test("nested repost extraction stays scoped to each selected post body", () => {
  const { document, api } = loadMonitor(fixture("reposts.html"));
  const outer = api.getPostTextDetails(document.querySelector("#outer"));
  const inner = api.getPostTextDetails(document.querySelector("#inner"));
  assert.equal(outer.body.id, "outer-body");
  assert.equal(inner.body.id, "inner-body");
  assert.match(outer.text, /outer role/);
  assert.doesNotMatch(outer.text, /inner role/);
});

test("external lookalike hosts never become LinkedIn identity", () => {
  const { document, api } = loadMonitor("<article data-urn='urn:li:activity:1'><div class='feed-shared-text'>We are hiring.</div><a href='https://www.linkedin.com.evil.invalid/in/fake'>Fake</a><a href='https://evil.invalid/posts/acme_activity-2'>Fake post</a></article>");
  const record = api.extractPostRecord(document.querySelector("article"), { capturedAtMs: Date.now() });
  assert.equal(record.author.profileUrl, null, "a lookalike host must never become a profile identity");
  // The permalink is now built from the card's own post URN when no anchor canonicalizes. That
  // is trusted identity from the card itself; the lookalike hrefs must still be rejected.
  assert.equal(record.permalink, "https://www.linkedin.com/feed/update/urn:li:activity:1/");
  assert.ok(!/evil\.invalid/.test(record.permalink || ""), "a lookalike host became the permalink");
  assert.ok(!/evil\.invalid/.test(record.author.profileUrl || ""), "a lookalike host became the author");
});

test("missing selectors return explicit partial metadata rather than throwing", () => {
  const { document, api } = loadMonitor("<article data-urn='urn:li:activity:2'>We are hiring.</article>");
  const record = api.extractPostRecord(document.querySelector("article"), { capturedAtMs: Date.now() });
  assert.equal(record.extractionStatus, "partial");
  assert.equal(record.postAge.publishedAt, null);
  assert.deepEqual({ ...record.metrics }, { reactions: null, comments: null, reposts: null, views: null });
});
