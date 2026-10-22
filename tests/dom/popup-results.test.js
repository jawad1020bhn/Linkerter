"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { renderResults, renderDetail, postKey } = require("../../popup-results.js");

function setup() {
  const dom = new JSDOM("<!doctype html><body><div id='results'></div><section id='detail'></section></body>", { url: "chrome-extension://test/popup.html" });
  return { dom, document: dom.window.document, container: dom.window.document.querySelector("#results"), detail: dom.window.document.querySelector("#detail") };
}

const post = {
  id: "urn:1", category: "open_role", confidence: "strong", snippet: "We are hiring an engineer",
  evidence: ["Hiring phrase"], contentComplete: true, extractionStatus: "complete",
  permalink: "https://www.linkedin.com/posts/acme_activity-1?utm_source=tracker",
  author: { name: "Acme", profileUrl: "https://www.linkedin.com/company/acme/" }, fullText: "Complete post text"
};

test("keyed identical renders preserve row, focused review control, and selection", () => {
  const { document, container } = setup();
  const labels = new Map([["urn:1", { label: "useful" }]]);
  renderResults(container, [post], { reviewLabels: labels });
  const row = container.querySelector("[data-post-id='urn:1']");
  const select = row.querySelector(".review-select");
  select.focus();
  select.value = "irrelevant";
  renderResults(container, [{ ...post }], { reviewLabels: labels });
  assert.equal(container.querySelector("[data-post-id='urn:1']"), row);
  assert.equal(row.querySelector(".review-select"), select);
  assert.equal(document.activeElement, select);
  assert.equal(select.value, "irrelevant");
});

test("changed keyed rows update safe text in place and preserve action callbacks", () => {
  const { document, container } = setup();
  const details = [];
  const reviews = [];
  renderResults(container, [post], { onDetail: (id) => details.push(id), onReview: (id, label) => reviews.push([id, label]) });
  const row = container.querySelector("[data-post-id='urn:1']");
  const select = row.querySelector(".review-select");
  select.focus();
  renderResults(container, [{ ...post, snippet: "<img src=x onerror=alert(1)> Updated", category: "possible" }], {
    onDetail: (id) => details.push(id), onReview: (id, label) => reviews.push([id, label])
  });
  assert.equal(container.querySelector("[data-post-id='urn:1']"), row);
  assert.equal(document.activeElement, select);
  assert.match(row.querySelector(".match-snippet").textContent, /Updated/);
  assert.equal(row.querySelector("img"), null);
  row.querySelector(".detail-button").click();
  select.value = "useful";
  select.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  assert.deepEqual(details, ["urn:1"]);
  assert.deepEqual(reviews, [["urn:1", "useful"]]);
});

test("reorder and removal reuse surviving keyed nodes and validate original-post links", () => {
  const { container } = setup();
  const second = { ...post, id: "urn:2", permalink: "https://evil.example/post", snippet: "Second" };
  renderResults(container, [post, second]);
  const firstRow = container.querySelector("[data-post-id='urn:1']");
  const secondRow = container.querySelector("[data-post-id='urn:2']");
  assert.equal(secondRow.querySelector(".original-post-link"), null);
  assert.match(firstRow.querySelector(".original-post-link").href, /^https:\/\/www\.linkedin\.com\//);
  assert.equal(firstRow.querySelector(".original-post-link").rel, "noopener noreferrer");
  renderResults(container, [second, post]);
  assert.equal(container.querySelector("[data-post-id='urn:1']"), firstRow);
  assert.equal(container.querySelector("[data-post-id='urn:2']"), secondRow);
  renderResults(container, [post]);
  assert.equal(container.querySelector("[data-post-id='urn:2']"), null);
  assert.equal(container.querySelector("[data-post-id='urn:1']"), firstRow);
  assert.equal(postKey({ sourcePostId: "fallback" }), "fallback");
});

test("full-detail rendering uses textContent and keeps unavailable metadata honest", () => {
  const { container, detail } = setup();
  renderDetail(detail, {
    ...post, fullText: "<script>alert(1)</script>\nFull detail", metrics: { reactions: 3, comments: null },
    postAge: { label: "2d", publishedAt: "2026-10-20T12:00:00.000Z" },
    permalink: "javascript:alert(1)"
  });
  assert.equal(detail.querySelector("script"), null);
  assert.match(detail.querySelector(".detail-full-text").textContent, /Full detail/);
  assert.match(detail.querySelector(".detail-metrics").textContent, /Reactions: 3/);
  assert.match(detail.querySelector(".detail-metrics").textContent, /Comments: unavailable/);
  assert.match(detail.querySelector(".detail-age").textContent, /2d/);
  assert.match(detail.querySelector(".detail-evidence").textContent, /Hiring phrase/);
  assert.equal(detail.querySelector(".original-post-link"), null);
  assert.equal(container.children.length, 0);
});
