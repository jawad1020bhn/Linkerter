"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const i18n = require("../../popup-i18n.js");
const { loadPopup } = require("../helpers/load-popup.js");

test("EN/FR/AR dictionaries have parity, substitutions, and English fallback", () => {
  const englishKeys = Object.keys(i18n.dictionaries.en).sort();
  assert.ok(englishKeys.length >= 50);
  assert.deepEqual(Object.keys(i18n.dictionaries.fr).sort(), englishKeys);
  assert.deepEqual(Object.keys(i18n.dictionaries.ar).sort(), englishKeys);
  i18n.setLocale("fr");
  assert.equal(i18n.locale, "fr");
  assert.equal(i18n.direction, "ltr");
  assert.equal(i18n.t("results.page", { page: 2, count: 3 }), i18n.dictionaries.fr["results.page"].replace("{page}", "2").replace("{count}", "3"));
  assert.match(i18n.t("history.saved", { count: 2 }), /2/);
  i18n.setLocale("unsupported");
  assert.equal(i18n.locale, "en");
  assert.equal(i18n.t("monitor.start"), i18n.dictionaries.en["monitor.start"]);
  assert.equal(i18n.t("missing.key"), "missing.key");
});

test("applyLocale translates local content and sets Arabic RTL without network resources", () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button data-i18n="monitor.start"></button>
    <input data-i18n-placeholder="results.search.placeholder">
    <section data-i18n-aria-label="target.section"></section>
  </body></html>`, { url: "chrome-extension://test/popup.html" });
  i18n.setLocale("ar");
  i18n.applyLocale(dom.window.document);
  assert.equal(dom.window.document.documentElement.lang, "ar");
  assert.equal(dom.window.document.documentElement.dir, "rtl");
  assert.equal(dom.window.document.querySelector("button").textContent, i18n.dictionaries.ar["monitor.start"]);
  assert.equal(dom.window.document.querySelector("input").placeholder, i18n.dictionaries.ar["results.search.placeholder"]);
  assert.equal(dom.window.document.querySelector("section").getAttribute("aria-label"), i18n.dictionaries.ar["target.section"]);
  assert.equal(dom.window.document.querySelectorAll("script[src^='http'],link[href^='http'],img[src^='http']").length, 0);
  i18n.setLocale("en");
});

test("popup-owned dynamic statuses, notices, counts, and confidence labels use the selected locale", async () => {
  const popup = loadPopup({
    local: { hiringPreferences: { locale: "fr", onboardingSeen: true } },
    hiringStatus: {
      processedCount: 2,
      archiveCount: 1,
      counts: { open_role: 1 },
      results: [{ id: "urn:li:activity:localized", category: "open_role", confidence: "strong", snippet: "Synthetic", evidence: ["hiring"], contentComplete: true }],
      total: 1,
      page: 1,
      hasMore: false,
      domHealth: {}
    }
  });
  try {
    await popup.ready;
    assert.equal(popup.document.querySelector("#globalNotice").textContent, i18n.dictionaries.fr["scroll.choosePace"]);
    assert.equal(popup.document.querySelector("#domHealthStatus").textContent, i18n.dictionaries.fr["monitor.domStopped"]);
    assert.equal(popup.document.querySelector("#processedDetail").textContent, i18n.dictionaries.fr["results.processedStopped"].replace("{count}", "2"));
    assert.equal(popup.document.querySelector("#exportStatus").textContent, i18n.dictionaries.fr["export.availableStopped"].replace("{count}", "1"));
    assert.equal(popup.document.querySelector(".confidence-chip").textContent, i18n.dictionaries.fr["confidence.strong"]);
  } finally { popup.close(); }
});

test("popup locale and responsible-use onboarding choices persist across reopen", async () => {
  const first = loadPopup({ local: { hiringPreferences: { locale: "ar", onboardingSeen: false } } });
  let stored;
  try {
    await first.ready;
    assert.equal(first.document.documentElement.lang, "ar");
    assert.equal(first.document.documentElement.dir, "rtl");
    assert.equal(first.document.querySelector("#localeSelect").value, "ar");
    assert.equal(first.document.querySelector("#onboarding").hidden, false);
    assert.equal(first.document.querySelector("#monitorBtn").textContent, i18n.dictionaries.ar["monitor.start"]);
    assert.match(first.document.querySelector("#onboarding").textContent, /المحلي|محلي/);
    first.document.querySelector("#onboardingDismiss").click();
    await first.waitFor(() => first.chrome._local._data.hiringPreferences?.onboardingSeen === true);
    stored = structuredClone(first.chrome._local._data);
  } finally {
    first.close();
  }

  const second = loadPopup({ local: stored });
  try {
    await second.ready;
    assert.equal(second.document.querySelector("#onboarding").hidden, true);
    const locale = second.document.querySelector("#localeSelect");
    locale.value = "fr";
    locale.dispatchEvent(new second.window.Event("change", { bubbles: true }));
    await second.waitFor(() => second.chrome._local._data.hiringPreferences?.locale === "fr" && second.document.documentElement.lang === "fr");
    assert.equal(second.document.documentElement.lang, "fr");
    assert.equal(second.document.documentElement.dir, "ltr");
    assert.equal(second.document.querySelector("#modeSelect").options[0].textContent, i18n.dictionaries.fr["mode.standard"]);
  } finally {
    second.close();
  }
});
