"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("labeled multilingual corpus has no category regressions", () => {
  const script = path.resolve("scripts/evaluate-classifier.js");
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const report = JSON.parse(run.stdout);
  assert.ok(report.total >= 20);
  assert.equal(report.correct, report.total);
  assert.equal(Object.keys(report.confusion).length, 0);
  assert.ok(report.byCategory.open_role.total > 0);
  assert.ok(report.byCategory.closed.total > 0);
  assert.ok(report.byCategory.none.total > 0);
});
