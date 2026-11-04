#!/usr/bin/env node
"use strict";

/*
 * Measure the hiring classifier against the labelled corpus.
 *
 *   node scripts/eval-classifier.cjs              # summary + every failure
 *   node scripts/eval-classifier.cjs --json       # machine-readable
 *   node scripts/eval-classifier.cjs --fail-on-miss   # exit 1 if anything is missed
 *
 * The absolute numbers are pessimistic by construction: the corpus is written around known
 * failure shapes, not sampled from LinkedIn. Watch the deltas between runs.
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const LOAD_ORDER = [
  "core/sha256.js",
  "core/linkedin-shared.js",
  "core/linkedin-hiring-rules.js",
  "core/linkedin-hiring-classifier.js"
];

for (const file of LOAD_ORDER) {
  // The core modules are authored as classic scripts that attach themselves to globalThis.
  new Function(fs.readFileSync(path.join(root, file), "utf8"))();
}

const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
if (!classifier) {
  console.error("Could not load the classifier from " + LOAD_ORDER.join(" -> "));
  process.exit(2);
}

const { evaluate } = require(path.join(root, "tests/corpus/hiring-corpus.js"));
const args = new Set(process.argv.slice(2));

const report = evaluate(classifier);

if (args.has("--json")) {
  process.stdout.write(JSON.stringify({
    totals: report.totals,
    missed: report.missed.map((row) => ({ text: row.text, note: row.note, category: row.category })),
    falsePositives: report.falsePositives.map((row) => ({ text: row.text, note: row.note, category: row.category }))
  }, null, 2) + "\n");
} else {
  const t = report.totals;
  const pct = (value) => (value * 100).toFixed(1) + "%";
  console.log("Hiring classifier — labelled corpus");
  console.log("  cases            " + t.cases + "  (" + t.positives + " vacancies, " + t.negatives + " not)");
  console.log("  caught           " + t.truePositives + "/" + t.positives + "  recall " + pct(t.recall));
  console.log("  false positives  " + t.falsePositives + "/" + t.negatives + "  precision " + pct(t.precision));

  if (report.missed.length) {
    console.log("\nMissed vacancies (" + report.missed.length + "):");
    for (const row of report.missed) {
      console.log("  - [" + row.note + "] " + row.category + "/" + row.score + "  " + row.text);
    }
  }
  if (report.falsePositives.length) {
    console.log("\nWrongly reported as vacancies (" + report.falsePositives.length + "):");
    for (const row of report.falsePositives) {
      console.log("  - [" + row.note + "] " + row.category + "/" + row.score + "  " + row.text);
    }
  }
  console.log("\nCorpus is failure-biased by design; deltas matter more than the absolute rates.");
}

if (args.has("--fail-on-false-positive") && report.totals.falsePositives > 0) process.exit(1);
if (args.has("--fail-on-miss") && report.totals.falseNegatives > 0) process.exit(1);
