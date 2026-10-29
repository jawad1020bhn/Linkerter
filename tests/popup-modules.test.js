"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

// Each popup module is loaded in a fresh process so no earlier test can supply the
// globalThis bridges (__LI_FEED_SHARED__, __LI_FEED_I18N__) that the browser provides.
// A module whose CommonJS fallback points at the wrong relative path only fails here.
for (const file of ["popup-i18n.js", "popup-export.js", "popup-results.js"]) {
  test(`${file} can be required on its own`, () => {
    const absolute = path.join(ROOT, "features", "popup", file);
    const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(absolute)})`], {
      cwd: ROOT, encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
