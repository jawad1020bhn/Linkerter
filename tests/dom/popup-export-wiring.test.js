"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPopup } = require("../helpers/load-popup.js");

const now = () => new Date().toISOString();
const complete = {
  id: "urn:1", sourcePostId: "1", category: "open_role", confidence: "strong", score: 7,
  evidence: ["Hiring phrase"], signals: { activeOpening: true },
  fullText: "Complete historical text", contentComplete: true, extractionStatus: "complete",
  firstSeenAt: now(), lastSeenAt: now(),
  author: { name: "Employer", profileUrl: "https://www.linkedin.com/company/acme/" },
  permalink: "https://www.linkedin.com/posts/acme_activity-1",
  extracted: { emails: ["jobs@example.com"], jobTitles: ["Engineer"], hashtags: [], links: [] },
  metrics: { reactions: 2, comments: 1, reposts: null, views: null }
};

test("popup exports coordinator records and current posts with selected schema-v3 fields", async () => {
  const partial = {
    ...complete, fullText: "Complete", contentComplete: false, extractionStatus: "partial",
    category: "open_role", lastSeenAt: now(), metrics: { reactions: 9 }
  };
  const closed = { ...complete, id: "urn:2", sourcePostId: "2", category: "closed", fullText: "Closed role" };
  const popup = loadPopup({
    local: {
      hiringPreferences: { historyMode: "persistent", historyRetentionDays: 30 },
      hiringPostHistory: [complete],
      hiringReviewLabels: { "urn:1": { label: "useful", updatedAt: now() } }
    },
    currentPosts: [partial, closed]
  });
  try {
    await popup.ready;
    assert.equal(popup.document.querySelector("#includeFullText").checked, false);
    assert.equal(popup.document.querySelector("#includeEmails").checked, false);
    popup.document.querySelector("#includeFullText").checked = true;
    popup.document.querySelector("#includeEmails").checked = true;
    popup.document.querySelector("#exportFilteredOnly").checked = true;
    popup.document.querySelector("#categoryFilter").value = "open_role";
    popup.document.querySelector("#exportBtn").click();
    await popup.waitFor(() => popup.downloads[0]?.clicked);
    const payload = JSON.parse(await popup.downloads[0].blob.text());
    assert.equal(payload.schemaVersion, "3.0");
    assert.equal(payload.selectedCategory, "open_role");
    assert.equal(payload.posts.length, 1);
    assert.equal(payload.posts[0].fullText, "Complete historical text");
    assert.deepEqual(payload.posts[0].extracted.emails, ["jobs@example.com"]);
    // Export schema 3: the permalink is always present, internal bookkeeping is not exported.
    assert.ok(payload.posts[0].permalink, "an exported post must be openable");
    for (const dropped of ["sourcePostId", "reviewLabel", "firstSeenAt", "lastSeenAt", "historyStore",
      "historyStores", "contentComplete", "extractionStatus", "metrics", "metricsCapturedAt"]) {
      assert.ok(!(dropped in payload.posts[0]), `${dropped} must not be exported`);
    }
    assert.deepEqual(Object.keys(payload.posts[0].signals).sort(), ["email", "jobLink"]);
    assert.deepEqual(Object.keys(payload.posts[0].postAge).sort(), ["label", "publishedAt"]);
    assert.equal(payload.monitorRun.id, "run-test");
  } finally {
    popup.close();
  }
});

test("popup history status exposes actual byte usage and last successful save", async () => {
  const savedAt = "2026-10-21T12:00:00.000Z";
  const popup = loadPopup({
    local: {
      hiringPreferences: { historyMode: "persistent", historyRetentionDays: 30 },
      hiringPostHistory: [complete],
      hiringHistoryMetadata: { lastSuccessfulSaveAt: savedAt }
    }
  });
  try {
    await popup.ready;
    const text = popup.document.querySelector("#historyStatus").textContent;
    const bytes = Buffer.byteLength(JSON.stringify(popup.chrome._local._data.hiringPostHistory || []), "utf8") +
      Buffer.byteLength(JSON.stringify(popup.chrome._session._data.hiringSessionPostHistory || []), "utf8");
    const formatted = new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(savedAt));
    assert.ok(text.includes(`${bytes} B`), text);
    assert.ok(text.includes(formatted), text);
  } finally { popup.close(); }
});

test("popup diagnostic download includes sanitized versions, selector health, counters, and timings", async () => {
  const popup = loadPopup({ hiringStatus: {
    processedCount: 3,
    archiveCount: 1,
    duplicateMergedCount: 1,
    domHealth: { postRootsFound: 2, message: "SECRET POST" },
    scan: { lastScanMs: 12.5, scans: 1 }
  } });
  try {
    await popup.ready;
    Object.defineProperty(popup.window.navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 Chrome/130.0.1.2 Safari/537.36" });
    popup.document.querySelector("#diagnosticBtn").click();
    await popup.waitFor(() => popup.downloads[0]?.clicked);
    const diagnostic = JSON.parse(await popup.downloads[0].blob.text());
    assert.equal(diagnostic.schemaVersion, "3.0");
    assert.equal(diagnostic.messageSchemaVersion, "2.0");
    assert.equal(diagnostic.extensionVersion, "2.0.0");
    assert.equal(diagnostic.browserVersion, "130.0.1.2");
    assert.equal(diagnostic.selectorHealth.postRootsFound, 2);
    assert.equal(diagnostic.timings.lastScanMs, 12.5);
    assert.equal(diagnostic.counts.processedCount, 3);
    assert.ok(diagnostic.operations.historyGet >= 1);
    assert.equal(JSON.stringify(diagnostic).includes("SECRET POST"), false);
    assert.equal(JSON.stringify(diagnostic).includes("linkedin.com"), false);
    assert.ok(popup.revoked.includes(popup.downloads[0].url));
  } finally {
    popup.close();
  }
});

test("confirmed history and all-data controls use their distinct coordinator scopes", async () => {
  let confirmations = 0;
  const popup = loadPopup({
    confirm: () => { confirmations += 1; return true; },
    local: {
      hiringPreferences: { historyMode: "persistent", historyRetentionDays: 30 },
      hiringPostHistory: [complete], hiringReviewLabels: { "urn:1": { label: "useful", updatedAt: now() } },
      settings: { mode: "fast" }, hiringTargetByWindow: { "1": 1 }
    },
    session: { hiringSessionPostHistory: [{ ...complete, id: "urn:session" }] }
  });
  try {
    await popup.ready;
    popup.document.querySelector("#clearHistoryBtn").click();
    await popup.waitFor(() => popup.chrome._local._data.hiringPostHistory === undefined &&
      popup.chrome._session._data.hiringSessionPostHistory === undefined);
    assert.ok(popup.chrome._local._data.hiringReviewLabels);
    assert.ok(popup.chrome._local._data.settings);
    assert.equal(popup.runtimeMessages.some((message) => message.type === "LOCAL_DATA_CLEAR" &&
      message.scopes?.includes("history")), true);

    popup.document.querySelector("#clearAllDataBtn").click();
    await popup.waitFor(() => Object.keys(popup.chrome._local._data).length === 0 &&
      Object.keys(popup.chrome._session._data).length === 0);
    assert.equal(confirmations, 2);
    assert.equal(popup.runtimeMessages.some((message) => message.type === "LOCAL_DATA_CLEAR" &&
      message.scopes?.includes("all")), true);
    assert.match(popup.document.querySelector("#globalNotice").textContent, /All local data cleared/i);
  } finally {
    popup.close();
  }
});
