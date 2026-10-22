"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const manifest = require("../../manifest.json");

test("MV3 package declares v2, Chrome 110, least permissions, and one coordinator", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "2.0.0");
  assert.equal(manifest.minimum_chrome_version, "110");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.linkedin.com/*"]);
  assert.ok(fs.existsSync("background.js"));
});

test("content injection is feed-only and shared primitives load first", () => {
  assert.equal(manifest.content_scripts.length, 1);
  const content = manifest.content_scripts[0];
  assert.ok(!content.matches.includes("https://www.linkedin.com/*"));
  assert.ok(content.matches.includes("https://www.linkedin.com/"));
  assert.ok(content.matches.some((pattern) => pattern.startsWith("https://www.linkedin.com/feed")));
  assert.deepEqual(content.js, [
    "linkedin-shared.js", "linkedin-hiring-rules.js", "linkedin-hiring-classifier.js",
    "linkedin-hiring-monitor.js", "content.js"
  ]);
  for (const script of [...content.js, manifest.background.service_worker]) assert.ok(fs.existsSync(script));
});
