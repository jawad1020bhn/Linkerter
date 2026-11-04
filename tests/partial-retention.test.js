"use strict";

/*
 * The other half of the silent-loss fix: a `partial` that was classified must actually reach
 * the user.
 *
 * Before the fix, an incomplete card was dropped in two independent places —
 * `upsertExportRecord` (archive + history) and the `results` map — so it appeared nowhere.
 * The classifier side of the fix is worthless if either guard widens back to "drop anything
 * that is not open_role", which is exactly the mistake that was made the first time.
 *
 * These tests drive the real monitor through a fake DOM, so they fail if either layer is
 * loosened, and they also prove the self-replacement: once the same card classifies
 * definitively, its `partial` row is replaced rather than duplicated.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeElement, installWindow, clearWindow } = require("./helpers/fake-dom.js");

require("../core/sha256.js");
require("../core/linkedin-shared.js");

// Minimal chrome surface. The monitor registers listeners at load and talks to storage only
// on flush; the assertions below read the in-memory status, so the stubs can stay inert.
const listeners = [];
globalThis.chrome = {
  runtime: {
    onMessage: { addListener: (fn) => listeners.push(fn), removeListener: () => {} },
    sendMessage: () => Promise.resolve(),
    getURL: (value) => value,
    id: "test-extension"
  },
  storage: {
    local: {
      get: (_keys, callback) => { if (callback) callback({}); return Promise.resolve({}); },
      set: (_value, callback) => { if (callback) callback(); return Promise.resolve(); }
    }
  }
};

// A viewport that reports every card as visible, and a document that only knows the cards we
// hand it. The monitor walks the DOM through `document` and `window`.
const cards = [];
globalThis.document = {
  querySelectorAll: () => cards,
  querySelector: () => null,
  documentElement: new FakeElement("html"),
  body: new FakeElement("body"),
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => new FakeElement(tag)
};
globalThis.location = { href: "https://www.linkedin.com/feed/", pathname: "/feed/" };
globalThis.MutationObserver = class { observe() {} disconnect() {} };

require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");
const extract = require("../features/feed-monitor/linkedin-post-extract.js");
const monitor = require("../features/feed-monitor/linkedin-hiring-monitor.js");

function cardWith(text, options = {}) {
  const card = new FakeElement("div", {
    className: "feed-shared-update-v2",
    attrs: { "data-urn": options.urn || "urn:li:activity:7000000000000000002" }
  });
  Object.defineProperty(card, "isConnected", { value: true });
  const body = new FakeElement("div", {
    className: options.bodyClassName || "feed-shared-update-v2__description-wrapper",
    text
  });
  body.innerText = "";
  card.append(body);
  return { card, body };
}

function startMonitoring() {
  installWindow(null);
  // The monitor gates on viewport proximity; a tall viewport keeps the card in scope.
  globalThis.window.innerHeight = 2000;
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
  monitor.startMonitor({ autoExpand: false });
}

test("a partial card reaches both the archive and the results list", () => {
  const { card } = cardWith("We're a growing fintech in Oran looking for talented people", {
    bodyClassName: "feed-shared-text line-clamp-3"
  });
  cards.length = 0;
  cards.push(card);
  startMonitoring();
  try {
    monitor.updatePost(card, true);
    const status = monitor.getStatus();
    assert.equal(status.archiveCount, 1, "the partial must be archived");
    assert.equal(status.counts.partial, 1, "it must be counted under its own category");
    assert.equal(status.results.length, 1, "the partial must appear as a result row");
    // The row says "incomplete" through the same fields the popup already renders.
    assert.equal(status.results[0].category, "partial");
    assert.equal(status.results[0].confidence, "partial");
    assert.equal(status.results[0].contentComplete, false);
    assert.equal(status.results[0].extractionStatus, "partial");
  } finally {
    monitor.stopMonitor();
    clearWindow();
  }
});

test("a card that later classifies definitively replaces its partial row", () => {
  const { card, body } = cardWith("We're a growing fintech in Oran looking for talented people", {
    bodyClassName: "feed-shared-text line-clamp-3"
  });
  cards.length = 0;
  cards.push(card);
  startMonitoring();
  try {
    monitor.updatePost(card, true);
    const before = monitor.getStatus();
    assert.equal(before.results.length, 1);

    // The user expands the post: same card, complete text now visible.
    body.className = "feed-shared-text";
    body.classList = new Set(["feed-shared-text"]);
    body.ownText = "We are hiring a Senior Backend Engineer in Oran. Apply: jobs@acme.com";
    monitor.updatePost(card, true);

    const after = monitor.getStatus();
    const rows = after.results;
    assert.equal(rows.length, 1, "the partial row must be replaced, not duplicated");
    assert.equal(rows[0].category, "open_role");
    assert.equal(rows[0].contentComplete, true);
    assert.equal(rows[0].extractionStatus, "complete");
  } finally {
    monitor.stopMonitor();
    clearWindow();
  }
});
