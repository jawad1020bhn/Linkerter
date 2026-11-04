"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
require("../core/linkedin-shared.js");
require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");
const extract = require("../features/feed-monitor/linkedin-post-extract.js");

// Fixed reference date so "most recent past occurrence" logic is deterministic.
const REF = Date.parse("2026-11-03T00:00:00Z");

// ── Absolute dates ──────────────────────────────────────────────

test("English and French absolute dates resolve to the right month", () => {
  const cases = [
    ["18 oct.", 9, 18],
    ["18 octobre", 9, 18],
    ["27 sept", 8, 27],
    ["24 févr.", 1, 24],
    ["Oct 18", 9, 18],
    ["Jan 5", 0, 5]
  ];
  for (const [label, month, day] of cases) {
    const value = extract.parseAbsoluteDateMs(label, REF);
    assert.ok(Number.isFinite(value), `${label} should parse`);
    const date = new Date(value);
    assert.equal(date.getUTCMonth(), month, label);
    assert.equal(date.getUTCDate(), day, label);
  }
});

// Arabic month support was removed on purpose: شباط is February in the Levant and January
// in Morocco, so the table silently resolved "18 شباط" to January. An unparsed label must
// stay absent rather than become a wrong date.
test("Arabic month names no longer resolve to a date", () => {
  for (const label of ["18 شباط", "18 حزيران", "18 أيار", "18 يناير", "18 كانون الثاني"]) {
    assert.equal(extract.parseAbsoluteDateMs(label, REF), null, label);
  }
});

test("Arabic absolute labels are not even offered as an age label", () => {
  for (const label of ["18 شباط", "18 حزيران"]) {
    assert.equal(extract.findAgeLabel(label), null, label);
  }
});

// ── Relative ages: English and French only ──────────────────────

test("English and French relative ages are parsed in the right unit", () => {
  const cases = [
    ["2 days ago", 172800],
    ["just now", 0],
    ["yesterday", 86400],
    ["2 d", 172800],
    ["13 h", 46800],
    ["6 j", 518400],
    ["3 sem", 1814400],
    ["1 mois", 2592000],
    ["il y a 2 jours", 172800],
    ["il y a 2 heures", 7200]
  ];
  for (const [label, seconds] of cases) {
    assert.equal(extract.parseApproxAgeSeconds(extract.findAgeLabel(label)), seconds, label);
  }
});

// The previous unit matcher tested prefixes, so "6 j" produced nothing and "1 mois" was
// read as "m" (minutes). A whole-token match is the fix under test.
test("French single-letter units are not read as English prefixes", () => {
  assert.equal(extract.parseApproxAgeSeconds("1 mois"), 2592000);
  assert.equal(extract.parseApproxAgeSeconds("6 j"), 518400);
  assert.equal(extract.parseApproxAgeSeconds("2 m"), 120);
});

// JS \b is ASCII-only, so it treated the "d" in "2 días" as a word boundary and exported a
// Spanish age from the English single-letter list. Unsupported languages must stay unknown.
test("unsupported-language ages are not guessed from a shared prefix", () => {
  for (const label of ["hace 2 días", "vor 3 Tagen", "há 4 dias", "منذ يومين"]) {
    assert.equal(extract.findAgeLabel(label), null, label);
    assert.equal(extract.parseApproxAgeSeconds(label), null, label);
  }
});

// ── Sponsored text detection ────────────────────────────────────

test("sponsored labels are recognised in the three supported languages", () => {
  for (const text of [
    "Sponsored post: upgrade your workflow",
    "Publication sponsorisée",
    "منشور ممول",
    "Promoted"
  ]) {
    assert.equal(extract.isSponsoredText(text), true, text);
  }
  for (const text of [
    "We're hiring a backend engineer",
    "Nous recrutons un ingénieur",
    "مطلوب مهندس للعمل في وهران"
  ]) {
    assert.equal(extract.isSponsoredText(text), false, text);
  }
});

// The extractor drops these cards before classification, so this is the single place that
// decides what counts as advertising inventory rather than a post.
function fakeCard({ structural = false, labels = [] } = {}) {
  return {
    querySelector: () => (structural ? {} : null),
    querySelectorAll: () => labels.map((text) => ({ getAttribute: () => "", textContent: text }))
  };
}

test("isSponsoredCard catches the structural marker and every localized label", () => {
  assert.equal(extract.isSponsoredCard(fakeCard({ structural: true })), true);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["Promoted"] })), true);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["Sponsored"] })), true);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["Publication sponsorisée"] })), true);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["منشور ممول"] })), true);
});

test("isSponsoredCard leaves a genuine vacancy card alone", () => {
  assert.equal(extract.isSponsoredCard(fakeCard()), false);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["Acme Corp", "We are hiring engineers"] })), false);
  assert.equal(extract.isSponsoredCard(fakeCard({ labels: ["مطلوب مهندس للعمل في وهران"] })), false);
});

// ── Search-results surfaces ─────────────────────────────────────
// Search result posts reuse LinkedIn's update component under their own wrapper. Treating
// that wrapper as a BEM child (it contains "__") made every search result invisible.

test("search result card wrappers are card-level tokens", () => {
  for (const token of [
    "search-results__update",
    "search-results__update-wrapper",
    "feed-shared-update-v2",
    "occludable-update",
    "search-update",
    "post-card"
  ]) {
    assert.equal(extract.isCardClassToken(token), true, token);
  }
});

test("BEM children of a card are never treated as cards", () => {
  for (const token of [
    "search-results__update__content",
    "feed-shared-update-v2__description-wrapper",
    "feed-shared-update-v2__actor",
    "entity-result"
  ]) {
    assert.equal(extract.isCardClassToken(token), false, token);
  }
});
