"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPopup } = require("../helpers/load-popup.js");

const post = (number) => ({
  id: `urn:${number}`, sourcePostId: String(number), category: "open_role", confidence: "strong", score: 8,
  evidence: ["Hiring phrase"], fullText: `We are hiring engineer ${number}. Complete full text.`,
  snippet: `We are hiring engineer ${number}.`, contentComplete: true, extractionStatus: "complete",
  firstSeenAt: new Date(2026, 8, 1, 0, 0, number).toISOString(),
  lastSeenAt: new Date(2026, 8, 1, 0, 0, number).toISOString(),
  permalink: `https://www.linkedin.com/posts/acme_activity-${number}`,
  author: { name: `Employer ${number}`, profileUrl: "https://www.linkedin.com/company/acme/" },
  metrics: { reactions: number, comments: null, reposts: null, views: null }
});

function queryStatus(posts, query, base) {
  const search = String(query.search || "").toLowerCase();
  const filter = query.filter || "all";
  const filtered = posts.filter((item) => (filter === "all" || item.category === filter) &&
    (!search || `${item.fullText} ${item.author.name}`.toLowerCase().includes(search)));
  filtered.sort((a, b) => (query.sort === "oldest" ? 1 : -1) * (Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt)));
  const pageSize = 25;
  const page = Math.max(1, Number(query.page) || 1);
  const results = filtered.slice((page - 1) * pageSize, page * pageSize).map(({ fullText, ...summary }) => summary);
  return {
    ...base, results, total: filtered.length, page, pageSize, hasMore: page * pageSize < filtered.length,
    archiveCount: posts.length, processedCount: posts.length, monitoring: false, counts: { open_role: posts.length }
  };
}

test("result search, sort, pagination, details, and identical refresh preserve focus", async () => {
  const posts = Array.from({ length: 30 }, (_, index) => post(index + 1));
  const popup = loadPopup({ currentPosts: posts, detailPosts: posts, statusForQuery: (query, base) => queryStatus(posts, query, base) });
  try {
    await popup.ready;
    popup.document.querySelector("#nextPage").click();
    await popup.waitFor(() => popup.tabMessages.some(({ message }) => message.type === "GET_HIRING_STATUS" && message.query?.page === 2));
    assert.match(popup.document.querySelector("#pageStatus").textContent, /Showing 26–30 of 30 · Page 2/);

    const search = popup.document.querySelector("#resultSearch");
    search.focus();
    search.value = "engineer 29";
    search.dispatchEvent(new popup.window.Event("input", { bubbles: true }));
    await popup.waitFor(() => popup.tabMessages.some(({ message }) => message.type === "GET_HIRING_STATUS" && message.query?.search === "engineer 29"));
    assert.equal(popup.document.activeElement, search);
    assert.equal(popup.document.querySelectorAll("#matchList [data-post-id]").length, 1);

    const review = popup.document.querySelector("#matchList .review-select");
    review.focus();
    await popup.api.refreshAll();
    assert.equal(popup.document.querySelector("#matchList .review-select"), review);
    assert.equal(popup.document.activeElement, review);

    const sort = popup.document.querySelector("#resultSort");
    sort.value = "oldest";
    sort.dispatchEvent(new popup.window.Event("change", { bubbles: true }));
    await popup.waitFor(() => popup.tabMessages.some(({ message }) => message.type === "GET_HIRING_STATUS" && message.query?.sort === "oldest"));
    popup.document.querySelector("#matchList .detail-button").click();
    await popup.waitFor(() => popup.document.querySelector("#postDetail .detail-full-text"));
    assert.equal(popup.document.querySelector("#postDetail").hidden, false);
    assert.match(popup.document.querySelector("#postDetail .detail-full-text").textContent, /Complete full text/);
    assert.equal(popup.tabMessages.some(({ message }) => message.type === "GET_HIRING_POST" && message.id === "urn:29"), true);
    assert.match(popup.document.querySelector("#matchList .original-post-link").href, /^https:\/\/www\.linkedin\.com\//);
  } finally {
    popup.close();
  }
});

test("refresh is single-flight and an old target response cannot overwrite new ownership", async () => {
  const popup = loadPopup();
  try {
    await popup.ready;
    let resolveOld;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    popup.chrome.tabs.sendMessage = async (tabId, message) => {
      if (message.type === "GET_HIRING_STATUS" && tabId === 1) return oldResponse;
      if (message.type === "GET_HIRING_STATUS" && tabId === 2) {
        return { supported: true, isFeed: true, monitoring: false, processedCount: 7, archiveCount: 0, counts: {}, results: [] };
      }
      if (message.type === "GET_STATUS") return { supported: true, isFeed: true, state: "stopped", steps: 0, maxSteps: 180 };
      return { ok: true, supported: true, isFeed: true };
    };
    const first = popup.api.refreshAll();
    const second = popup.api.refreshAll();
    assert.equal(first, second);
    await popup.waitFor(() => resolveOld !== undefined);
    await popup.api.setTargetTab(2, 1, false);
    resolveOld({ supported: true, isFeed: true, monitoring: true, processedCount: 999, archiveCount: 1, counts: {}, results: [] });
    await first;
    assert.equal(popup.document.querySelector("#monitorStatus").textContent.includes("999"), false);
    await popup.api.refreshAll();
    assert.match(popup.document.querySelector("#monitorStatus").textContent, /7 cards/);
    assert.equal(popup.api.getTargetState().targetTabId, 2);
  } finally {
    popup.close();
  }
});

test("remembered targets are window/feed revalidated and closed targets clear without auto-restart", async () => {
  const activeTab = { id: 2, windowId: 2, active: true, url: "https://www.linkedin.com/?trk=home" };
  const popup = loadPopup({
    activeTab,
    tabs: [{ id: 1, windowId: 1, url: "https://www.linkedin.com/feed/" }],
    local: { hiringTargetByWindow: { "2": 1 } }
  });
  try {
    await popup.ready;
    assert.equal(popup.api.getTargetState().targetTabId, 2);
    assert.equal(popup.api.isLinkedInFeedUrl("https://www.linkedin.com/?trk=home"), true);
    assert.equal(popup.api.isLinkedInFeedUrl("https://www.linkedin.com/feed/?x=1#main"), true);
    assert.equal(popup.api.isLinkedInFeedUrl("https://www.linkedin.com/jobs/"), false);
    assert.equal(popup.tabMessages.some(({ message }) => ["START", "START_HIRING_MONITOR"].includes(message.type)), false);
    await popup.chrome.tabs.onRemoved.dispatch(2);
    await popup.waitFor(() => popup.api.getTargetState().targetTabId === null);
  } finally {
    popup.close();
  }
});

test("history mode selection persists and reaches monitor startup", async () => {
  const popup = loadPopup();
  try {
    await popup.ready;
    const mode = popup.document.querySelector("#historyMode");
    mode.value = "session";
    mode.dispatchEvent(new popup.window.Event("change", { bubbles: true }));
    await popup.waitFor(() => popup.chrome._local._data.hiringPreferences?.historyMode === "session");
    await popup.api.runMonitorCommand();
    const start = popup.tabMessages.find(({ message }) => message.type === "START_HIRING_MONITOR");
    assert.equal(start.message.options.historyMode, "session");
    assert.equal(start.message.options.keepHistory, true);
  } finally {
    popup.close();
  }
});

test("preference storage failures apply safe UI state and surface a localized error", async () => {
  const popup = loadPopup();
  const unhandled = [];
  try {
    await popup.ready;
    popup.window.addEventListener("unhandledrejection", (event) => unhandled.push(event.reason));
    popup.chrome._local.beforeSet = () => { throw new Error("storage denied"); };
    const locale = popup.document.querySelector("#localeSelect");
    locale.value = "fr";
    locale.dispatchEvent(new popup.window.Event("change", { bubbles: true }));
    await popup.waitFor(() => popup.document.querySelector("#globalNotice").textContent.includes("Impossible"));
    assert.equal(popup.document.documentElement.lang, "fr");
    assert.equal(popup.document.querySelector("#globalNotice").className.includes("error"), true);
    assert.equal(unhandled.length, 0);
  } finally { popup.close(); }
});

test("return to feed revalidates a moved target and focuses its current window", async () => {
  const active = { id: 1, windowId: 1, active: true, url: "https://www.linkedin.com/feed/" };
  const tabs = [];
  const popup = loadPopup({ activeTab: active, tabs });
  try {
    await popup.ready;
    active.id = 2;
    active.windowId = 2;
    tabs.push({ id: 1, windowId: 2, active: false, url: "https://www.linkedin.com/feed/" });
    await popup.api.refreshAll();
    assert.equal(popup.document.querySelector("#returnToFeedBtn").disabled, false);
    popup.document.querySelector("#returnToFeedBtn").click();
    await popup.waitFor(() => popup.tabUpdates.length === 1);
    assert.equal(popup.windowUpdates.length, 1);
    assert.equal(popup.windowUpdates[0].windowId, 2);
    assert.equal(popup.windowUpdates[0].options.focused, true);
    assert.equal(popup.tabUpdates[0].tabId, 1);
    assert.equal(popup.tabUpdates[0].options.active, true);
    assert.equal(popup.api.getTargetState().targetWindowId, 2);
  } finally { popup.close(); }
});

test("repeated pending monitor and scroll commands are idempotent", async () => {
  const popup = loadPopup();
  try {
    await popup.ready;
    const originalSend = popup.chrome.tabs.sendMessage;
    let monitorStarts = 0;
    let scrollStarts = 0;
    let resolveMonitor;
    let resolveScroll;
    popup.chrome.tabs.sendMessage = async (tabId, message) => {
      if (message.type === "START_HIRING_MONITOR") {
        monitorStarts += 1;
        return new Promise((resolve) => { resolveMonitor = resolve; });
      }
      if (message.type === "START") {
        scrollStarts += 1;
        return new Promise((resolve) => { resolveScroll = resolve; });
      }
      return originalSend(tabId, message);
    };
    const monitorOne = popup.api.runMonitorCommand();
    const monitorTwo = popup.api.runMonitorCommand();
    const scrollOne = popup.api.runScrollCommand("START");
    const scrollTwo = popup.api.runScrollCommand("START");
    await popup.waitFor(() => resolveMonitor && resolveScroll);
    assert.equal(monitorStarts, 1);
    assert.equal(scrollStarts, 1);
    resolveMonitor({ ok: true, status: { supported: true, isFeed: true, monitoring: true, counts: {}, results: [] } });
    resolveScroll({ ok: true, status: { supported: true, isFeed: true, state: "running", steps: 0, maxSteps: 180 } });
    await Promise.all([monitorOne, monitorTwo, scrollOne, scrollTwo]);
  } finally {
    popup.close();
  }
});

test("starting over a non-empty unexported archive requires export-first confirmation", async () => {
  let confirmation = "";
  const popup = loadPopup({
    hiringStatus: { archiveCount: 2, processedCount: 2, monitoring: false },
    confirm: (message) => { confirmation = message; return false; }
  });
  try {
    await popup.ready;
    popup.document.querySelector("#monitorBtn").click();
    await popup.waitFor(() => confirmation !== "", 500);
    assert.match(confirmation, /export/i);
    assert.equal(popup.tabMessages.some(({ message }) => message.type === "START_HIRING_MONITOR"), false);
  } finally {
    popup.close();
  }
});
