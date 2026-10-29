"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const manifestContentScripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
const { FEED_CONTENT_SCRIPTS } = require(path.join(ROOT, "infrastructure", "background.js"));

// The manifest and the service worker's chrome.scripting fallback must inject the same
// files in the same order. When they drift, a client-side navigation to /feed loads a
// partial module chain and the extension silently stops working on that tab.
test("SPA injection list matches the manifest content scripts", () => {
  assert.deepEqual([...FEED_CONTENT_SCRIPTS], manifestContentScripts);
});

test("every runtime file referenced by the manifest exists", () => {
  const files = new Set([
    ...manifestContentScripts,
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {})
  ]);
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `missing runtime file: ${file}`);
  }
});

// Loading the injected chain in a browser-like context (no CommonJS require) proves the
// files are self-sufficient in the order the service worker injects them. content.js and
// the monitor need a live DOM and chrome.* at load time, so the chain stops before them;
// their presence in the list is covered by the parity test above.
test("injected core and extractor scripts load without a module loader", () => {
  const context = vm.createContext({ console, URL });
  const loadable = FEED_CONTENT_SCRIPTS.filter((file) =>
    !file.endsWith("content.js") && !file.endsWith("linkedin-hiring-monitor.js"));
  for (const file of loadable) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  }
  assert.equal(typeof context.__LI_FEED_HIRING_CLASSIFIER__.classify, "function");
  assert.equal(typeof context.__LI_FEED_HIRING_POST_EXTRACT__.extractPostRecord, "function");
});
