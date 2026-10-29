"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const i18n = require("../features/popup/popup-i18n.js");
const html = fs.readFileSync(path.resolve(__dirname, "../features/popup/popup.html"), "utf8");

function htmlKeys() {
  const keys = new Set();
  // data-i18n-count carries the number substituted into the sibling key, not a key itself.
  for (const match of html.matchAll(/data-i18n(?:-(?!count)[a-z-]+)?="([^"]+)"/g)) keys.add(match[1]);
  return keys;
}

test("the interface is English-only, left-to-right", () => {
  assert.equal(i18n.locale, "en");
  assert.equal(i18n.direction, "ltr");
});

test("the dictionary is a full English table", () => {
  const count = Object.keys(i18n.dictionary).length;
  assert.ok(count > 250, `expected a full dictionary, found ${count} keys`);
});

test("every key used by popup.html exists in the dictionary", () => {
  const used = htmlKeys();
  assert.ok(used.size > 100, `expected the popup to use many keys, found ${used.size}`);
  const missing = [...used].filter((key) => !Object.hasOwn(i18n.dictionary, key));
  assert.deepEqual(missing, [], "missing popup keys");
});

test("t substitutes placeholders and falls back to the key name", () => {
  assert.equal(i18n.t("time.minutes", { count: 5 }), "5 minutes");
  assert.equal(i18n.t("results.page", { page: 2, count: 40 }), "Page 2 · 40 results");
  assert.equal(i18n.t("time.minutes", {}), "{count} minutes", "unknown placeholders pass through");
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(i18n.t("missing.key"), "missing.key");
  } finally {
    console.warn = warn;
  }
});
