"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor, fixture } = require("../helpers/load-monitor.js");

// One post shaped like current LinkedIn markup: an occludable-update wrapper, an
// article card carrying the activity URN, and real feed-shared-update-v2__* children.
const REALISTIC_CARD = `<main><div class="scaffold-finite-scroll__content" role="main">
 <div class="occludable-update" data-urn="urn:li:activity:7250000000000000001">
  <article class="feed-shared-update-v2 update-components-actor occludable-update" data-urn="urn:li:activity:7250000000000000001">
    <div class="feed-shared-update-v2__actor update-components-actor"><span class="update-components-actor__name">Acme Algeria</span></div>
    <div class="feed-shared-update-v2__content"><div class="feed-shared-update-v2__description-wrapper">
      <span class="feed-shared-text">We are hiring a Senior Backend Engineer in Algiers. Apply now via our careers page.</span>
      <button class="update-components-text-v2__see-more" aria-label="see more">see more</button>
    </div></div>
    <div class="feed-shared-update-v2__control-menu"><button aria-label="Open control menu">Open control menu</button></div>
    <div class="feed-shared-update-v2__social-actions">
      <a href="https://www.linkedin.com/posts/acme_activity-7250000000000000001-abc">Permalink</a>
      <time datetime="1761000000">2h</time>
    </div>
  </article>
 </div>
</div></main>`;

async function scanCard(html) {
  const { document, api } = loadMonitor(html);
  // Background (hidden-tab) monitoring inspects every card rather than only near-viewport cards.
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ autoExpand: false, historyMode: "off" });
  await api.scan();
  const status = api.getStatus({ filter: "all", sort: "newest", page: 1, pageSize: 100 });
  const cleanup = () => api.stopMonitor();
  return { document, api, status, cleanup };
}

test("one realistic LinkedIn card produces one post root and one archive record", async () => {
  const { status, cleanup } = await scanCard(REALISTIC_CARD);
  try {
  assert.equal(status.domHealth.postRootsFound, 1, "nested card children must not become independent post roots");
  assert.equal(status.archiveCount, 1);
  assert.equal(status.counts.open_role, 1);
  assert.equal(status.results.length, 1);
  assert.equal(status.results[0].id, "urn:li:activity:7250000000000000001");
  } finally { await cleanup(); }
});

test("a collapsed feed card is archived once under its URN identity", async () => {
  const { status, cleanup } = await scanCard(fixture("collapsed.html"));
  try {
  assert.equal(status.domHealth.postRootsFound, 1);
  assert.equal(status.archiveCount, 1);
  assert.equal(status.counts.open_role, 1);
  assert.equal(status.results[0].id, "urn:li:activity:123");
  assert.equal(status.results[0].contentComplete, false);
  assert.equal(status.results[0].extractionStatus, "partial");
  } finally { await cleanup(); }
});

test("a nested reshare stays two distinct posts with scoped text", async () => {
  const { status, cleanup } = await scanCard(fixture("reposts.html"));
  try {
  assert.equal(status.domHealth.postRootsFound, 2);
  assert.equal(status.archiveCount, 2);
  const ids = status.results.map((record) => record.id).sort();
  assert.deepEqual([...ids], ["urn:li:activity:inner", "urn:li:activity:outer"]);
  const outer = status.results.find((record) => record.id === "urn:li:activity:outer");
  const inner = status.results.find((record) => record.id === "urn:li:activity:inner");
  assert.match(outer.snippet, /outer role/);
  assert.doesNotMatch(outer.snippet, /inner role/);
  assert.match(inner.snippet, /inner role/);
  } finally { await cleanup(); }
});

test("extracted text excludes see-more labels and card chrome", async () => {
  const { status, cleanup } = await scanCard(REALISTIC_CARD);
  try {
    assert.ok(status.results.length >= 1);
    for (const record of status.results) {
      assert.doesNotMatch(record.snippet, /see more/i, `control label leaked into ${record.id}`);
      assert.doesNotMatch(record.snippet, /open control menu/i, `control menu leaked into ${record.id}`);
      assert.doesNotMatch(record.snippet, /permalink/i, `permalink label leaked into ${record.id}`);
      assert.doesNotMatch(record.snippet, /\b2h\b/, `timestamp leaked into ${record.id}`);
      assert.match(record.snippet, /Senior Backend Engineer/);
    }
  } finally { await cleanup(); }

  const collapsed = await scanCard(fixture("collapsed.html"));
  try {
    for (const record of collapsed.status.results) {
      assert.doesNotMatch(record.snippet, /see more/i, `control label leaked into ${record.id}`);
      assert.doesNotMatch(record.snippet, /see more comments/i);
      assert.match(record.snippet, /visible part/);
    }
  } finally { await collapsed.cleanup(); }
});

test("a body node without its own URN inherits the enclosing card identity", async () => {
  const { document, api, cleanup } = await scanCard(REALISTIC_CARD);
  try {
  const wrapper = document.querySelector(".feed-shared-update-v2__description-wrapper");
  assert.ok(wrapper, "fixture must contain the real description-wrapper child");
  assert.equal(wrapper.hasAttribute("data-urn"), false, "the wrapper carries no identity of its own");
  const record = api.extractPostRecord(wrapper, { capturedAtMs: Date.now() });
  assert.equal(record.id, "urn:li:activity:7250000000000000001");
  assert.equal(record.sourcePostId, "urn:li:activity:7250000000000000001");
  const roots = api.collectPostRoots();
  assert.equal(roots.length, 1);
  } finally { await cleanup(); }
});

test("duplicate accounting reports no false merges once roots are deduplicated", async () => {
  const { api, status, cleanup } = await scanCard(REALISTIC_CARD);
  try {
    assert.equal(status.duplicateMergedCount, 0);
    await api.scan();
    assert.equal(api.getStatus().archiveCount, 1);
    assert.equal(api.getStatus().duplicateMergedCount, 0);
  } finally { await cleanup(); }
});
