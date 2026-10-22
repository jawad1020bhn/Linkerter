"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
require("../../linkedin-shared.js");
const { createHistoryCoordinator } = require("../../background.js");
const { createChromeMock, createEvent } = require("./chrome-mock.js");

const ROOT = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");


async function waitFor(predicate, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for popup condition.");
}

function loadPopup({
  local = {}, session = {}, currentPosts = [], detailPosts = [], hiringStatus = {}, confirm = () => true,
  statusForQuery = null, activeTab = { id: 1, windowId: 1, active: true, url: "https://www.linkedin.com/feed/" }, tabs = []
} = {}) {
  const dom = new JSDOM(html, {
    url: "chrome-extension://linkerter-test/popup.html",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const chrome = createChromeMock({ local, session });
  chrome.runtime.getManifest = () => ({ version: "2.0.0" });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome });
  const runtimeMessages = [];
  const tabMessages = [];
  const tabUpdates = [];
  const windowUpdates = [];
  const downloads = [];
  const revoked = [];
  const defaultStatus = {
    supported: true, isFeed: true, monitoring: false, processedCount: currentPosts.length,
    archiveCount: currentPosts.length, counts: {}, results: [], ...hiringStatus
  };

  chrome.runtime.sendMessage = async (message) => {
    runtimeMessages.push(message);
    return coordinator.handle(message);
  };
  chrome.tabs.query = async () => [activeTab];
  chrome.tabs.get = async (tabId) => {
    const tab = [activeTab, ...tabs].find((item) => item.id === tabId);
    if (!tab) throw new Error("Tab not found");
    return tab;
  };
  chrome.tabs.onActivated = createEvent();
  chrome.tabs.onRemoved = createEvent();
  chrome.tabs.onUpdated = createEvent();
  chrome.tabs.update = async (tabId, options) => { tabUpdates.push({ tabId, options }); return {}; };
  chrome.windows = { update: async (windowId, options) => { windowUpdates.push({ windowId, options }); return {}; } };
  chrome.tabs.sendMessage = async (tabId, message) => {
    tabMessages.push({ tabId, message });
    switch (message.type) {
      case "GET_STATUS":
        return { supported: true, isFeed: true, state: "stopped", mode: "standard", steps: 0, maxSteps: 180 };
      case "GET_HIRING_STATUS": return statusForQuery ? statusForQuery(message.query || {}, defaultStatus) : defaultStatus;
      case "GET_HIRING_POST": {
        const post = [...currentPosts, ...detailPosts].find((item) => item.id === message.id);
        return post ? { ok: true, post } : { ok: false, error: "not_found" };
      }
      case "START_HIRING_MONITOR":
        return { ok: true, supported: true, isFeed: true, status: { ...defaultStatus, monitoring: true } };
      case "EXPORT_HIRING_POSTS":
        return { schemaVersion: "2.0", posts: currentPosts, monitorRun: { id: "run-test" }, extractionNotes: { content: "Local only." } };
      case "SET_HIRING_OPTIONS":
      case "SET_HIRING_FILTER": return { ok: true, status: defaultStatus };
      case "STOP_HIRING_MONITOR":
      case "STOP": return { ok: true, supported: true, isFeed: true, status: defaultStatus };
      default: return { ok: true, supported: true, isFeed: true };
    }
  };

  window.chrome = chrome;
  window.Blob = Blob;
  window.confirm = confirm;
  let downloadSequence = 0;
  window.URL.createObjectURL = (blob) => {
    const url = `blob:popup-${++downloadSequence}`;
    downloads.push({ url, blob });
    return url;
  };
  window.URL.revokeObjectURL = (url) => revoked.push(url);
  window.HTMLAnchorElement.prototype.click = function click() {
    const download = downloads.find((item) => item.url === this.href);
    if (download) { download.filename = this.download; download.clicked = true; }
  };
  window.module = { exports: {} };
  for (const script of window.document.querySelectorAll("script[src]")) {
    const sourcePath = script.getAttribute("src");
    if (!sourcePath || sourcePath.includes("..") || sourcePath.startsWith("/")) continue;
    window.eval(fs.readFileSync(path.join(ROOT, sourcePath), "utf8"));
  }

  return {
    dom,
    window,
    document: window.document,
    chrome,
    coordinator,
    api: window.module.exports,
    runtimeMessages,
    tabMessages,
    tabUpdates,
    windowUpdates,
    downloads,
    revoked,
    ready: waitFor(() => runtimeMessages.some((message) => message.type === "HISTORY_GET") &&
      tabMessages.some(({ message }) => message.type === "GET_HIRING_STATUS")),
    waitFor,
    close() { window.close(); }
  };
}

module.exports = { loadPopup, waitFor };
