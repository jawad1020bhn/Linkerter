"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const i18n = require("../../popup-i18n.js");
const { loadPopup } = require("../helpers/load-popup.js");

const popupHtml = fs.readFileSync(path.join(__dirname, "..", "..", "popup.html"), "utf8");

function post(id, overrides = {}) {
  return {
    id, category: "open_role", confidence: "strong", score: 6, evidence: ["Hiring phrase"],
    snippet: `We are hiring ${id}.`, author: { name: "Acme", profileUrl: null }, permalink: null,
    firstSeenAt: "2026-10-22T10:00:00.000Z", lastSeenAt: "2026-10-22T10:00:00.000Z",
    contentComplete: true, extractionStatus: "complete", metrics: null, postAge: null, stale: false,
    ...overrides
  };
}

test("the results view offers no filter that can never return a record", () => {
  const dom = new JSDOM(popupHtml);
  const filter = dom.window.document.querySelector("#categoryFilter");
  const values = Array.from(filter.options, (option) => option.value);
  assert.ok(!values.includes("partial"), "partial-only records are never archived, so the option must not be offered");
  assert.deepEqual(values, ["all", "open_role", "recruiter_search", "possible", "job_seeker", "hiring_discussion", "closed"]);

  const sort = dom.window.document.querySelector("#resultSort");
  assert.deepEqual(Array.from(sort.options, (option) => option.value), ["relevance", "newest", "oldest"]);
  assert.equal(sort.value, "relevance", "active openings first is the default result order");
});

test("the popup requests the openings-first view by default and keeps an explicit filter choice", async () => {
  const popup = loadPopup({
    local: { hiringPreferences: { onboardingSeen: true } },
    hiringStatus: { results: [post("urn:1")], total: 1, page: 1, hasMore: false, counts: { open_role: 1 } }
  });
  try {
    await popup.ready;
    const query = popup.tabMessages.filter(({ message }) => message.type === "GET_HIRING_STATUS").at(-1)?.message.query;
    assert.equal(query.sort, "relevance");
    assert.equal(query.filter, "all");
    assert.equal(popup.document.querySelector("#resultSort").value, "relevance");
  } finally { popup.close(); }

  const retained = loadPopup({
    local: { hiringPreferences: { onboardingSeen: true, filter: "job_seeker" } },
    hiringStatus: { results: [], total: 0, page: 1, hasMore: false, counts: {} }
  });
  try {
    await retained.ready;
    assert.equal(retained.document.querySelector("#categoryFilter").value, "job_seeker");
    const query = retained.tabMessages.filter(({ message }) => message.type === "GET_HIRING_STATUS").at(-1)?.message.query;
    assert.equal(query.filter, "job_seeker", "the user's explicit category choice survives reopening the popup");
  } finally { retained.close(); }
});

function ageStatus() {
  return {
    results: [
      post("urn:fresh", { postAge: { label: "2h", ageDaysApprox: 0.08 }, stale: false }),
      post("urn:stale", { snippet: "We are hiring an old role.", postAge: { label: "11mo", ageDaysApprox: 335 }, stale: true })
    ],
    total: 2, page: 1, hasMore: false, counts: { open_role: 2 }
  };
}

test("result rows show post age and flag openings that may no longer be active", async () => {
  const popup = loadPopup({ local: { hiringPreferences: { onboardingSeen: true } }, hiringStatus: ageStatus() });
  try {
    await popup.ready;
    const fresh = popup.document.querySelector("[data-post-id='urn:fresh']");
    const stale = popup.document.querySelector("[data-post-id='urn:stale']");
    assert.equal(fresh.querySelector(".match-age").textContent, i18n.dictionaries.en["results.postedAge"].replace("{age}", "2h"));
    assert.equal(fresh.querySelector(".stale-note"), null);
    assert.equal(fresh.classList.contains("stale"), false);
    assert.equal(stale.classList.contains("stale"), true);
    assert.match(stale.querySelector(".match-age").textContent, /11mo/);
    assert.equal(stale.querySelector(".stale-note").textContent, i18n.dictionaries.en["results.staleNote"]);
  } finally { popup.close(); }
});

test("post age and staleness labels follow the selected locale", async () => {
  const popup = loadPopup({ local: { hiringPreferences: { locale: "fr", onboardingSeen: true } }, hiringStatus: ageStatus() });
  try {
    await popup.ready;
    assert.equal(popup.document.documentElement.lang, "fr");
    const fresh = popup.document.querySelector("[data-post-id='urn:fresh']");
    const stale = popup.document.querySelector("[data-post-id='urn:stale']");
    assert.equal(fresh.querySelector(".match-age").textContent, i18n.dictionaries.fr["results.postedAge"].replace("{age}", "2h"));
    assert.equal(stale.querySelector(".stale-note").textContent, i18n.dictionaries.fr["results.staleNote"]);
  } finally { popup.close(); }
});

test("rows without a DOM-visible age render no age element instead of guessing", async () => {
  const popup = loadPopup({
    local: { hiringPreferences: { onboardingSeen: true } },
    hiringStatus: { results: [post("urn:noage")], total: 1, page: 1, hasMore: false, counts: { open_role: 1 } }
  });
  try {
    await popup.ready;
    const row = popup.document.querySelector("[data-post-id='urn:noage']");
    assert.equal(row.querySelector(".match-age"), null);
    assert.equal(row.classList.contains("stale"), false);
  } finally { popup.close(); }
});
