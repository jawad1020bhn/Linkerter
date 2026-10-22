"use strict";

// Purpose-fit measurement probe for the local hiring classifier.
//
// scripts/evaluate-classifier.js answers "did the pinned regression corpus stay
// correct?" (correct counts + confusion pairs). This probe answers the different
// question the product actually depends on: "how precise and how complete is each
// category on realistic, adversarial feed text?" It reports per-category
// precision/recall, the open_role false-positive list, and every mismatch.
//
// It reads the same labeled corpus as the pinned regression gate
// (`tests/fixtures/classifier/`), so accuracy claims and regression protection stay
// in sync. It is a measurement tool: it exits 0 by default so a tuning session can
// watch precision and recall move. Pass --strict to fail on any mismatch.
//
//   node scripts/probe-classifier.js            # human-readable report
//   node scripts/probe-classifier.js --json     # machine-readable report
//   node scripts/probe-classifier.js --strict   # exit 1 on any mismatch

const fs = require("node:fs");
const path = require("node:path");
require("../linkedin-hiring-rules.js");
require("../linkedin-hiring-classifier.js");

const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
const CATEGORIES = ["open_role", "recruiter_search", "possible", "job_seeker", "hiring_discussion", "closed", "none"];
const probeDir = path.join(__dirname, "..", "tests", "fixtures", "classifier");

const strict = process.argv.includes("--strict");
const asJson = process.argv.includes("--json");

const cases = fs.readdirSync(probeDir).filter((name) => name.endsWith(".json")).sort()
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(probeDir, name), "utf8")));

const truePositives = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const falsePositives = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const falseNegatives = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const failures = [];
const byLang = {};

for (const fixture of cases) {
  // cases without an explicit language tag (the original core corpus) are reported separately
  const lang = fixture.lang || "unlabeled";
  const bucket = byLang[lang] ||= { total: 0, correct: 0 };
  bucket.total += 1;
  const result = classifier.classify(fixture.text, { hrefs: fixture.hrefs || [] });
  if (result.category === fixture.category) {
    truePositives[fixture.category] += 1;
    bucket.correct += 1;
    continue;
  }
  falsePositives[result.category] = (falsePositives[result.category] || 0) + 1;
  falseNegatives[fixture.category] += 1;
  failures.push({
    id: fixture.id || null,
    lang,
    expected: fixture.category,
    actual: result.category,
    confidence: result.confidence,
    score: result.score,
    note: fixture.note || null,
    text: fixture.text,
    evidence: result.evidence.slice(0, 4)
  });
}

const ratio = (numerator, denominator) => (denominator ? Math.round((numerator / denominator) * 1000) / 1000 : null);
const perCategory = Object.fromEntries(CATEGORIES.map((category) => {
  const support = truePositives[category] + falseNegatives[category];
  const predicted = truePositives[category] + (falsePositives[category] || 0);
  return [category, {
    support,
    predicted,
    truePositives: truePositives[category],
    falsePositives: falsePositives[category] || 0,
    falseNegatives: falseNegatives[category],
    precision: ratio(truePositives[category], predicted),
    recall: ratio(truePositives[category], support)
  }];
}));

const report = {
  corpus: { total: cases.length, correct: cases.length - failures.length, byLang },
  accuracy: ratio(cases.length - failures.length, cases.length),
  perCategory,
  openRoleFalsePositives: failures.filter((f) => f.actual === "open_role"),
  openRoleFalseNegatives: failures.filter((f) => f.expected === "open_role"),
  failures
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("=== Linkerter classifier probe: per-category precision / recall ===\n");
  console.log("category            support predicted  TP  FP  FN  precision  recall");
  for (const category of CATEGORIES) {
    const row = perCategory[category];
    console.log(
      category.padEnd(18) +
      String(row.support).padStart(7) + String(row.predicted).padStart(10) +
      String(row.truePositives).padStart(4) + String(row.falsePositives).padStart(4) + String(row.falseNegatives).padStart(4) +
      String(row.precision ?? "-").padStart(11) + String(row.recall ?? "-").padStart(8)
    );
  }
  console.log(`\naccuracy ${report.accuracy} (${report.corpus.correct}/${report.corpus.total})`);
  for (const [lang, bucket] of Object.entries(report.corpus.byLang)) {
    console.log(`  ${lang}: ${bucket.correct}/${bucket.total}`);
  }
  console.log(`\nopen_role false positives: ${report.openRoleFalsePositives.length}  |  open_role false negatives: ${report.openRoleFalseNegatives.length}`);
  if (failures.length) {
    console.log("\n=== mismatches ===");
    for (const failure of failures) {
      console.log(`\n${failure.id} [${failure.lang}] expected ${failure.expected} -> got ${failure.actual}/${failure.confidence} score=${failure.score}`);
      if (failure.note) console.log(`  note: ${failure.note}`);
      console.log(`  text: ${failure.text.slice(0, 110)}`);
      console.log(`  evidence: ${failure.evidence.join(" | ") || "(none reported)"}`);
    }
  }
}

if (strict && failures.length) process.exitCode = 1;
