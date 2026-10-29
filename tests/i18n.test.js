"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const i18n = require("../features/popup/popup-i18n.js");
require("../features/popup/popup-locales.js");
const { dictionaries } = i18n;
const html = fs.readFileSync(path.resolve(__dirname, "../features/popup/popup.html"), "utf8");

const LOCALES = ["en", "fr", "ar", "es", "de", "pt"];

function htmlKeys() {
  const keys = new Set();
  // data-i18n-count carries the number substituted into the sibling key, not a key itself.
  for (const match of html.matchAll(/data-i18n(?:-(?!count)[a-z-]+)?="([^"]+)"/g)) keys.add(match[1]);
  return keys;
}

test("every locale defines exactly the same keys", () => {
  const english = Object.keys(dictionaries.en).sort();
  assert.ok(english.length > 250, `expected a full dictionary, found ${english.length} keys`);
  for (const locale of LOCALES.slice(1)) {
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(), english, `${locale} key parity`);
  }
});

test("every key used by popup.html exists in every locale", () => {
  const used = htmlKeys();
  assert.ok(used.size > 100, `expected the popup to use many keys, found ${used.size}`);
  for (const locale of LOCALES) {
    const missing = [...used].filter((key) => !Object.hasOwn(dictionaries[locale], key));
    assert.deepEqual(missing, [], `${locale} is missing popup keys`);
  }
});

test("Spanish, German and Portuguese translate the whole interface, not just inherit English", () => {
  const english = dictionaries.en;
  for (const locale of ["es", "de", "pt"]) {
    const translated = Object.entries(dictionaries[locale])
      .filter(([key, value]) => english[key] !== value && !key.startsWith("locale.") && key !== "app.name");
    assert.ok(translated.length > 200,
      `${locale} should translate most keys, only ${translated.length} differ from English`);
  }
  // Spot-check a few strings that a machine placeholder would leave in English.
  assert.match(dictionaries.es["scroll.start"], /Empezar/);
  assert.match(dictionaries.de["scroll.start"], /Scrollen starten/);
  assert.match(dictionaries.pt["scroll.start"], /Começar/);
});

test("t substitutes placeholders and falls back to the key name", () => {
  i18n.setLocale("en");
  assert.equal(i18n.t("time.minutes", { count: 5 }), "5 minutes");
  assert.equal(i18n.t("results.page", { page: 2, count: 40 }), "Page 2 · 40 results");
  i18n.setLocale("es");
  assert.equal(i18n.t("time.minutes", { count: 5 }), "5 minutos");
  i18n.setLocale("de");
  assert.equal(i18n.t("time.minutes", { count: 5 }), "5 Minuten");
  i18n.setLocale("pt");
  assert.equal(i18n.t("time.minutes", { count: 5 }), "5 minutos");
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(i18n.t("missing.key"), "missing.key");
  } finally {
    console.warn = warn;
  }
});

test("setLocale accepts every supported locale, rejects unknown ones and reports direction", () => {
  for (const locale of LOCALES) assert.equal(i18n.setLocale(locale), locale);
  assert.equal(i18n.setLocale("ar"), "ar");
  assert.equal(i18n.direction, "rtl");
  assert.equal(i18n.setLocale("fr"), "fr");
  assert.equal(i18n.direction, "ltr");
  assert.equal(i18n.setLocale("ja"), "en");
  assert.ok(LOCALES.includes(i18n.setLocale("auto")), "auto resolves to a supported locale");
});

test("registerLocale refuses malformed codes and inherits missing English keys", () => {
  assert.equal(i18n.registerLocale("xx", { "scroll.start": "Custom" }), true);
  i18n.setLocale("xx");
  assert.equal(i18n.t("scroll.start"), "Custom");
  assert.equal(i18n.t("scroll.stop"), "Stop", "untranslated keys fall back to English");
  assert.equal(i18n.registerLocale("toolong", {}), false);
  assert.equal(i18n.registerLocale("", {}), false);
  assert.equal(i18n.registerLocale("yy", null), false);
  delete dictionaries.xx;
});

test("Arabic translations actually differ from English", () => {
  i18n.setLocale("ar");
  const arabic = i18n.t("scroll.start");
  i18n.setLocale("en");
  assert.notEqual(arabic, i18n.t("scroll.start"));
  assert.match(arabic, /[\u0600-\u06FF]/, "Arabic string contains Arabic script");
});
