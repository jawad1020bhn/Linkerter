"use strict";

const fs = require("node:fs");
const path = require("node:path");
require("../linkedin-hiring-rules.js");
require("../linkedin-hiring-classifier.js");
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
const fixtureDir = path.join(__dirname, "..", "tests", "fixtures", "classifier");
const cases = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json")).sort()
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8")));
const report = { total: cases.length, correct: 0, byCategory: {}, confusion: {} };
for (const fixture of cases) {
  const result = classifier.classify(fixture.text, { hrefs: fixture.hrefs || [] });
  const bucket = report.byCategory[fixture.category] ||= { total: 0, correct: 0 };
  bucket.total += 1;
  const categoryMatches = result.category === fixture.category;
  const confidenceMatches = !fixture.confidence || result.confidence === fixture.confidence;
  if (categoryMatches && confidenceMatches) {
    report.correct += 1;
    bucket.correct += 1;
  } else {
    const key = `${fixture.category}->${result.category}`;
    report.confusion[key] = (report.confusion[key] || 0) + 1;
    console.error(`Mismatch: ${JSON.stringify(fixture.text)} expected ${fixture.category}${fixture.confidence ? `/${fixture.confidence}` : ""}, got ${result.category}/${result.confidence}`);
  }
}
console.log(JSON.stringify(report, null, 2));
if (report.correct !== report.total) process.exitCode = 1;
