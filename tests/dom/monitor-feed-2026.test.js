"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor, fixture } = require("../helpers/load-monitor.js");

// Built from the 2026-10-22 authenticated export, which showed what the real feed looks like
// as opposed to what the fixtures assumed: no data-urn attributes, the post URN only in the
// permalink anchor, update-components-* class names, absolute French timestamps, an actor
// headline that used to be classified as post text, comments and reaction counts inside the
// card, reactor wrappers around shared posts, and sponsored placements.
async function scanFeed() {
  const { document, api } = loadMonitor(fixture("feed-2026.html"));
  // Background (hidden-tab) monitoring inspects every card rather than only near-viewport cards.
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ autoExpand: false, historyMode: "off" });
  await api.scan();
  const status = api.getStatus({ filter: "all", sort: "relevance", page: 1, pageSize: 100 });
  return { document, api, status, cleanup: () => api.stopMonitor() };
}

function recordFor(api, document, cardId) {
  return api.extractPostRecord(document.querySelector(cardId), { capturedAtMs: Date.parse("2026-10-22T12:00:00.000Z") });
}

test("a card with no data-urn is identified by the URN in its permalink anchor", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const record = recordFor(api, document, "#card-vacancy");
    assert.equal(record.sourcePostId, "urn:li:activity:7518631042765750001");
    assert.equal(record.id, "urn:li:activity:7518631042765750001");
    assert.equal(record.permalink, "https://www.linkedin.com/feed/update/urn:li:activity:7518631042765750001/");
    assert.ok(!record.id.startsWith("text:"), "a text identity makes cross-run deduplication impossible");
  } finally { await cleanup(); }
});

test("the author is the content author, and card chrome stays out of the post text", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const record = recordFor(api, document, "#card-vacancy");
    assert.equal(record.author.name, "Auteur A", "the actor name must be found inside the card");
    assert.equal(record.category, "open_role");
    const text = record.fullText;
    assert.match(text, /offre d/iu);
    assert.match(text, /recrut@entreprise-alpha\.example|recrutement@entreprise-alpha\.example/iu);
    for (const chrome of [
      "Post du fil d", "Chargée des ressources humaines", "18 oct", "modifié", "Suivre",
      "Permalien", "J’aime", "Commenter", "Afficher la traduction", "Ouvrir le menu de contrôle",
      "Bonne chance pour ce recrutement", "... plus", "voir plus"
    ]) {
      assert.ok(!text.includes(chrome), `card chrome leaked into post text: ${chrome}`);
    }
    assert.ok(!/(?:^|\s)15(?:\s|$)/u.test(text), "reaction counts leaked into post text");
    assert.equal(record.contentComplete, false, "an unexpanded see-more control means the text is not complete");
    assert.equal(record.extractionStatus, "partial");
  } finally { await cleanup(); }
});

test("text is complete when LinkedIn exposes no see-more control", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const record = recordFor(api, document, "#card-seeker");
    assert.equal(record.contentComplete, true);
    assert.equal(record.extractionStatus, "complete");
    assert.equal(record.category, "job_seeker");
    assert.equal(record.author.name, "Auteur W");
  } finally { await cleanup(); }
});

test("an absolute French timestamp becomes a publish date, and 'and' is never an age label", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const seeker = recordFor(api, document, "#card-seeker");
    assert.equal(seeker.postAge.label, "27 sept.");
    assert.notEqual(seeker.postAge.label, "and", "a bare unit letter must not parse an ordinary word as an age");
    assert.equal(new Date(seeker.postAge.publishedAt).getUTCMonth(), 8, "27 sept. is September");
    assert.ok(seeker.postAge.ageDaysApprox >= 20 && seeker.postAge.ageDaysApprox < 400);

    const vacancy = recordFor(api, document, "#card-vacancy");
    assert.equal(vacancy.postAge.label, "18 oct.");
    assert.equal(new Date(vacancy.postAge.publishedAt).getUTCMonth(), 9, "18 oct. is October");
    assert.notEqual(vacancy.postAge.label, "and");
  } finally { await cleanup(); }
});

test("a reactor wrapper attributes the post to its author, not to whoever liked it", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const record = recordFor(api, document, "#card-reshare");
    assert.equal(record.author.name, "Auteur H", "the profile that liked the post is not its author");
    assert.equal(record.sourcePostId, "urn:li:activity:7518631042765750003", "the shared post's identity deduplicates across reactors");
    assert.notEqual(record.sourcePostId, "urn:li:activity:7518631042765750004");
    assert.match(record.fullText, /nous recrutons/iu);
    assert.ok(!record.fullText.includes("aime ce contenu"), "the reactor label leaked into post text");
    assert.ok(!record.fullText.includes("Page Partage"), "the reactor name leaked into post text");
    assert.equal(record.category, "open_role");
  } finally { await cleanup(); }
});

test("a sponsored placement is never archived as a detected post", async () => {
  const { document, api, status, cleanup } = await scanFeed();
  try {
    const record = recordFor(api, document, "#card-sponsored");
    assert.equal(record.category, "none");
    assert.ok(record.signals.sponsored, "the sponsored placement must be reported as a signal");
    assert.equal(status.domHealth.sponsoredCards, 1);
    for (const result of status.results) {
      assert.ok(!/personalize your search/i.test(result.snippet || ""), "advertising entered the review list");
    }
  } finally { await cleanup(); }
});

test("engagement counts come from the post's own bar, never from comments or a reshare", async () => {
  const { document, api, cleanup } = await scanFeed();
  try {
    const vacancy = recordFor(api, document, "#card-vacancy");
    assert.deepEqual({ ...vacancy.metrics }, { reactions: 15, reposts: 1, comments: 3, views: null });

    const reshare = recordFor(api, document, "#card-reshare");
    assert.equal(reshare.metrics.reactions, 45, "the shared post's own count belongs to the record");
    assert.equal(reshare.metrics.comments, null, "the reactor bar's comment count is not this post's");
  } finally { await cleanup(); }
});

test("one scan of the real 2026 feed shape archives three posts, openings first", async () => {
  const { status, cleanup } = await scanFeed();
  try {
    assert.equal(status.domHealth.postRootsFound, 4, "one root per card, not one per card child");
    assert.equal(status.archiveCount, 3, "the sponsored placement is not a post");
    assert.equal(status.counts.open_role, 2);
    assert.equal(status.counts.job_seeker, 1);
    assert.deepEqual([...status.results].map((record) => record.id), [
      "urn:li:activity:7518631042765750001",
      "urn:li:activity:7518631042765750003",
      "urn:li:activity:7518631042765750002"
    ], "relevance order puts active openings before job seekers");
    for (const record of status.results) {
      assert.equal(record.confidence !== "none", true);
      assert.ok(record.permalink, "every archived post must be openable");
    }
  } finally { await cleanup(); }
});
