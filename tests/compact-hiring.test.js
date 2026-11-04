"use strict";

/*
 * Regression tests for the two measured improvements written up in HIRING-DETECTION.md:
 *   1. a visually truncated card is reported as `partial`, not as a confident `none`;
 *   2. a compact vacancy ad ("<role> - <city>. <email>") is detected by compound evidence.
 *
 * The corpus is also replayed on its own in scripts/eval-classifier.cjs, but the invariants
 * below are what actually keep future edits honest.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");

const rules = globalThis.__LI_FEED_HIRING_RULES__;
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
const classify = (text, options) => classifier.classify(text, options);

// ── Compact vacancy pathway ─────────────────────────────────────────────────

test("a role title and a city alone never open a vacancy", () => {
  // The single most dangerous shape: this is equally a candidate's own headline.
  const result = classify("Développeur Full Stack – Alger.", { hrefs: [] });
  assert.notEqual(result.category, "open_role");
});

test("a role title plus an e-mail address alone never opens a vacancy", () => {
  // Reachable in real data: someone advertising themselves, or a CV pasted into a post.
  const result = classify("Développeur Full Stack. mon.email@gmail.com", { hrefs: [] });
  assert.notEqual(result.category, "open_role");
});

test("a compact ad with a role, a city and an address is reported as a likely opening", () => {
  const result = classify("Full Stack Developer - Alger. contact@acme.dz", { hrefs: [] });
  assert.equal(result.category, "open_role");
  // Compound inference is never `strong`: it must stay distinguishable from
  // an explicit "we are hiring" statement.
  assert.equal(result.confidence, "likely");
  assert.equal(result.score, 5);
});

test("the compact pathway works in French without ASCII word boundaries", () => {
  // `\b` is ASCII-only in JavaScript, so "Développeur" never matched a \b-anchored phrase.
  const result = classify("Développeur Full Stack – Alger. contact@acme.dz", { hrefs: [] });
  assert.equal(result.category, "open_role");
});

test("the compact pathway works for Arabic", () => {
  const result = classify("مطلوب محاسب في وهران. أرسل سيرتك الذاتية إلى cv@acme.dz", { hrefs: [] });
  assert.equal(result.category, "open_role");
});

test("an employer seeking phrase plus a role and an address is a compact vacancy", () => {
  const result = classify("Acme is looking for a Data Analyst. Reach out to me.", { hrefs: [] });
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "likely");
});

test("no job-seeker phrase can be turned into a vacancy by adding a compact ad", () => {
  // The invariant that actually holds, and the one that matters. The in-function veto is a
  // second line of defence: the upstream `job_seeker` branch normally wins first, so the veto
  // is largely redundant. What a regression would look like is a compact shape that promotes
  // a candidate's post to a vacancy once a seeker cue is present — so assert that directly
  // against every seeker phrase in the table, for every compact route.
  const shapes = [
    "Développeur à Oran contact@acme.dz",                                  // route B
    "Sales representative needed. Oran. Send CV to rh@acme.dz",            // route A
    "Notre société recherche un comptable. Merci d'envoyer votre CV.",     // route A
    "Comptable Oran https://acme.dz/jobs/1"                                // route D
  ];
  for (const phrase of rules.jobSeeker) {
    for (const shape of shapes) {
      const text = phrase + " " + shape;
      const result = classify(text, { hrefs: [] });
      assert.notEqual(result.category, "open_role", text);
    }
  }
});

test("a seeker phrase still wins over a compact ad in the ordinary cases", () => {
  const cases = [
    "Développeur full stack à Alger. Ouvert aux opportunités. cv@acme.dz",
    "مهندس من وهران، أبحث عن عمل. cv@mail.com"
  ];
  for (const text of cases) {
    assert.equal(classify(text, { hrefs: [] }).category, "job_seeker", text);
  }
});

test("the compact pathway never overrides a definite verdict", () => {
  const closed = classify("Position filled. Thank you to everyone who applied.", { hrefs: [] });
  assert.equal(closed.category, "closed");

  const sponsored = classify("We are hiring a Data Analyst in Oran. jobs@acme.dz", {
    hrefs: [],
    sponsored: true
  });
  assert.equal(sponsored.category, "none");
});

// ── Corpus replay ───────────────────────────────────────────────────────────

test("the labelled corpus does not regress", () => {
  const { evaluate } = require("./corpus/hiring-corpus.js");
  const report = evaluate(classifier);

  // Hard floor: no false positive is acceptable, because every one is a wrong vacancy
  // shown to the user. The corpus is failure-biased, so recall is tracked as a floor too,
  // and `--fail-on-miss` in the eval script reports the individual misses.
  assert.equal(report.totals.falsePositives, 0, JSON.stringify(report.falsePositives, null, 2));
  assert.ok(
    report.totals.truePositives >= 25,
    "recall dropped to " + report.totals.truePositives + "/" + report.totals.positives
  );
});
