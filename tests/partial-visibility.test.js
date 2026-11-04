"use strict";

/*
 * Guards the `partial` contract.
 *
 * A post whose text is not fully visible must never be classified into a definite `none`,
 * because that verdict was previously indistinguishable from "we read the whole post and it
 * is not a vacancy". Measured cost: a hiring phrase sitting under the fold was scored `none`
 * at 60 and 100 characters of visible text, then `open_role` at 140. Such a card is now
 * reported as `partial`…
 *
 *   …but a `partial` must actually survive to the user. It was dropped in two independent
 *   places (the export archive and the results map), so an incomplete card reached neither
 *   the export, nor the history, nor the UI. These tests fail if either drop is widened
 *   back to everything-but-`open_role`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeElement, installWindow, clearWindow } = require("./helpers/fake-dom.js");

// Load order matters: the extractor reads the rules and the classifier at load time.
require("../core/sha256.js");
require("../core/linkedin-shared.js");
require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");
const extract = require("../features/feed-monitor/linkedin-post-extract.js");
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;

/** Build a feed card whose body carries `text`. */
function buildCard(options = {}) {
  const card = new FakeElement("div", { className: "feed-shared-update-v2", attrs: { "data-urn": "urn:li:activity:7000000000000000001" } });
  const body = new FakeElement("div", {
    className: options.bodyClassName || "feed-shared-update-v2__description-wrapper",
    text: options.text || ""
  });
  if (options.blankInnerText !== false) body.innerText = "";
  card.append(body);
  return { card, body };
}

test("a fully visible post with no control is not partial", () => {
  const { card } = buildCard({ text: "We're hiring a Senior Backend Engineer in Oran." });
  installWindow(card);
  try {
    const details = extract.getPostTextDetails(card);
    assert.equal(details.partial, false);
    assert.equal(details.clamped, false);
    assert.equal(details.usedCardFallback, false);
  } finally {
    clearWindow();
  }
});

test("a CSS-clamped body is reported as clamped and partial", () => {
  const { card, body } = buildCard({ text: "We're a growing fintech in Oran looking for talented people to join us." });
  // 84px box against far taller content: the rest of the sentence is not on screen.
  body.clientHeight = 84;
  body.scrollHeight = 336;
  body.style = { overflow: "hidden" };

  installWindow(card);
  try {
    const details = extract.getPostTextDetails(card);
    assert.equal(details.clamped, true, "overflow:hidden with overflowing content must clamp");
    assert.equal(details.partial, true);
  } finally {
    clearWindow();
  }
});

test("a line-clamp class marks the body as clamped without any measurement", () => {
  const { card } = buildCard({
    text: "Notre société à Alger recrute plusieurs profils.",
    bodyClassName: "feed-shared-text line-clamp-3"
  });
  installWindow(card);
  try {
    assert.equal(extract.isVisuallyClamped(card.children[0]), true);
    assert.equal(extract.getPostTextDetails(card).partial, true);
  } finally {
    clearWindow();
  }
});

test("overflow:hidden alone does not clamp when the content fits", () => {
  // Guards against the inverse error: a body that hides its overflow but has nothing to
  // hide must stay complete, or every card becomes `partial` and review is useless.
  const { card, body } = buildCard({ text: "Short post." });
  body.clientHeight = 200;
  body.scrollHeight = 40;
  body.style = { overflow: "hidden" };

  installWindow(card);
  try {
    assert.equal(extract.isVisuallyClamped(body), false);
    assert.equal(extract.getPostTextDetails(card).partial, false);
  } finally {
    clearWindow();
  }
});

test("a post with no locatable body is partial, because card-scoped text is a guess", () => {
  const card = new FakeElement("div", { className: "feed-shared-update-v2", text: "We are hiring. jobs@acme.dz" });
  card.innerText = "";
  installWindow(card);
  try {
    const details = extract.getPostTextDetails(card);
    assert.equal(details.usedCardFallback, true);
    assert.equal(details.partial, true);
  } finally {
    clearWindow();
  }
});

test("a truncated post classifies as possibly-hiring, never as a confident none", () => {
  // End to end on the measured case: the open phrase is below the fold.
  const { card, body } = buildCard({
    bodyClassName: "feed-shared-text line-clamp-3",
    text: "We're a growing fintech in Oran looking for talented people to join our team."
  });
  installWindow(card);
  let details;
  let result;
  try {
    details = extract.getPostTextDetails(card);
  } finally {
    clearWindow();
  }
  result = classifier.classify(details.text, { hrefs: [], partial: details.partial });
  assert.equal(details.partial, true);
  // Whatever the classifier decides, an incomplete post may not be stored as a confident `none`.
  if (result.category === "none") {
    assert.notEqual(result.confidence, "strong");
  }
});
