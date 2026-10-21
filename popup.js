const DEFAULT_SETTINGS = {
  mode: "standard",
  maxMinutes: 15,
  maxSteps: 180,
  pauseOnInput: true
};

const DEFAULT_HIRING_PREFS = {
  autoExpand: true,
  filter: "all",
  matchesOnly: false,
  exportFormat: "json",
  exportFilteredOnly: false,
  includeFullText: true,
  includeEmails: true,
  includeJobTitles: true,
  includeMetrics: true,
  includePostMetadata: true,
  keepHistory: false,
  historyRetentionDays: 30
};
const MODE_NAMES = {
  standard: "Human-like Standard",
  fast: "Human-like Fast",
  super_fast: "Human-like Super Fast"
};
const MODE_DESCRIPTIONS = {
  standard: "Balanced adaptive movement with automatic reading pauses. The selected feed continues scrolling while hidden; Chrome may throttle it.",
  fast: "Quicker adaptive movement with variable waits and built-in reading pauses. Background scrolling continues while the selected feed is open.",
  super_fast: "Highest adaptive pace, with automatic reading pauses, a 15-minute / 120-step cap, and pause-on-input locked on."
};
const CATEGORY_NAMES = {
  open_role: "Openings",
  recruiter_search: "Recruiter search",
  possible: "Possible match",
  job_seeker: "Job seeker / referral",
  hiring_discussion: "Hiring advice / news",
  closed: "Closed / negative",
  partial: "Partial text"
};
const FILTERS = ["all", ...Object.keys(CATEGORY_NAMES)];

const $ = (selector) => document.querySelector(selector);
const elements = {
  scrollTab: $("#scrollTab"),
  hiringTab: $("#hiringTab"),
  scrollView: $("#scrollView"),
  hiringView: $("#hiringView"),
  connectionChip: $("#connectionChip"),
  globalNotice: $("#globalNotice"),
  targetBadge: $("#targetBadge"),
  targetDetail: $("#targetDetail"),
  useActiveFeedBtn: $("#useActiveFeedBtn"),
  returnToFeedBtn: $("#returnToFeedBtn"),
  tabMatchCount: $("#tabMatchCount"),
  mode: $("#modeSelect"),
  modeDescription: $("#modeDescription"),
  modeTag: $("#modeTag"),
  safeBadge: $("#safeBadge"),
  maxMinutes: $("#maxMinutes"),
  maxSteps: $("#maxSteps"),
  pauseOnInput: $("#pauseOnInput"),
  start: $("#startBtn"),
  pause: $("#pauseBtn"),
  stop: $("#stopBtn"),
  stateDot: $("#stateDot"),
  stateLabel: $("#stateLabel"),
  statusDetail: $("#statusDetail"),
  progressTrack: $(".progress-track"),
  progressFill: $("#progressFill"),
  autoExpand: $("#autoExpand"),
  matchesOnly: $("#matchesOnly"),
  monitorBtn: $("#monitorBtn"),
  monitorStatus: $("#monitorStatus"),
  domHealthStatus: $("#domHealthStatus"),
  keepHistory: $("#keepHistory"),
  historyRetention: $("#historyRetention"),
  clearHistoryBtn: $("#clearHistoryBtn"),
  historyStatus: $("#historyStatus"),
  categoryFilter: $("#categoryFilter"),
  exportFormat: $("#exportFormat"),
  exportFilteredOnly: $("#exportFilteredOnly"),
  includeFullText: $("#includeFullText"),
  includeEmails: $("#includeEmails"),
  includeJobTitles: $("#includeJobTitles"),
  includeMetrics: $("#includeMetrics"),
  includePostMetadata: $("#includePostMetadata"),
  processedDetail: $("#processedDetail"),
  exportBtn: $("#exportBtn"),
  exportStatus: $("#exportStatus"),
  matchList: $("#matchList"),
  openCount: $("#openCount"),
  recruiterCount: $("#recruiterCount"),
  possibleCount: $("#possibleCount"),
  relatedCount: $("#relatedCount")
};

let available = false;
let isFeed = false;
let targetTabId = null;
let targetWindowId = null;
let activeTabId = null;
let activeTabUrl = "";
let scrollStatus = null;
let hiringStatus = null;
let hiringPrefs = { ...DEFAULT_HIRING_PREFS };
let savedHistory = [];
let reviewLabels = new Map();
let refreshTimer = null;
let saveTimer = null;

let lastModeWasSuperFast = false;
let preSuperFastSafety = { pauseOnInput: true };
let preSuperFastLimits = { maxMinutes: 15, maxSteps: 180 };
let safetyModeInitialized = false;

function canonicalMode(value) {
  const legacyModes = {
    human: "standard",
    natural: "standard",
    steady: "standard",
    gentle: "standard",
    quick: "fast",
    super_safe: "super_fast"
  };
  const requested = legacyModes[value] || value;
  return ["standard", "fast", "super_fast"].includes(requested) ? requested : DEFAULT_SETTINGS.mode;
}

function sanitizeSettings(raw = {}) {
  const mode = canonicalMode(raw.mode);
  const minuteOptions = [5, 15, 30, 60];
  const stepOptions = [40, 80, 120, 180, 300, 500];
  let maxMinutes = minuteOptions.includes(Number(raw.maxMinutes)) ? Number(raw.maxMinutes) : DEFAULT_SETTINGS.maxMinutes;
  let maxSteps = stepOptions.includes(Number(raw.maxSteps)) ? Number(raw.maxSteps) : DEFAULT_SETTINGS.maxSteps;
  let pauseOnInput = raw.pauseOnInput !== false;

  if (mode === "super_fast") {
    maxMinutes = Math.min(maxMinutes, 15);
    maxSteps = Math.min(maxSteps, 120);
    pauseOnInput = true;
  }
  return { mode, maxMinutes, maxSteps, pauseOnInput };
}

function readSettings() {
  return sanitizeSettings({
    mode: elements.mode.value,
    maxMinutes: Number(elements.maxMinutes.value),
    maxSteps: Number(elements.maxSteps.value),
    pauseOnInput: elements.pauseOnInput.checked
  });
}

function applySafetyModeConstraints() {
  const superFast = elements.mode.value === "super_fast";
  if (superFast && !lastModeWasSuperFast) {
    preSuperFastSafety = {
      pauseOnInput: elements.pauseOnInput.checked
    };
    preSuperFastLimits = {
      maxMinutes: Number(elements.maxMinutes.value) || 15,
      maxSteps: Number(elements.maxSteps.value) || 180
    };
  } else if (!superFast && lastModeWasSuperFast) {
    elements.pauseOnInput.checked = preSuperFastSafety.pauseOnInput;
    elements.maxMinutes.value = String(preSuperFastLimits.maxMinutes);
    elements.maxSteps.value = String(preSuperFastLimits.maxSteps);
  }

  Array.from(elements.maxMinutes.options).forEach((option) => { option.disabled = superFast && Number(option.value) > 15; });
  Array.from(elements.maxSteps.options).forEach((option) => { option.disabled = superFast && Number(option.value) > 120; });
  elements.pauseOnInput.disabled = superFast;

  if (superFast) {
    if (Number(elements.maxMinutes.value) > 15) elements.maxMinutes.value = "15";
    if (Number(elements.maxSteps.value) > 120) elements.maxSteps.value = "120";
    elements.pauseOnInput.checked = true;
  }
  lastModeWasSuperFast = superFast;
}

function applySettings(raw) {
  const settings = sanitizeSettings(raw);
  elements.mode.value = settings.mode;
  elements.maxMinutes.value = String(settings.maxMinutes);
  elements.maxSteps.value = String(settings.maxSteps);
  elements.pauseOnInput.checked = settings.pauseOnInput;
  if (!safetyModeInitialized) {
    lastModeWasSuperFast = settings.mode === "super_fast";
    preSuperFastSafety = { pauseOnInput: settings.pauseOnInput };
    preSuperFastLimits = settings.mode === "super_fast"
      ? { maxMinutes: 15, maxSteps: 180 }
      : { maxMinutes: settings.maxMinutes, maxSteps: settings.maxSteps };
    safetyModeInitialized = true;
  }
  applySafetyModeConstraints();
  updateSettingLabels();
}

function updateSettingLabels() {
  const mode = elements.mode.value;
  elements.modeDescription.textContent = MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.standard;
  elements.modeTag.textContent = MODE_NAMES[mode] || MODE_NAMES.standard;
  elements.safeBadge.textContent = mode === "super_fast" ? "LOCKED GUARDRAILS" : "SMART ALGORITHM";
}

async function saveSettings() {
  await chrome.storage.local.set({ settings: readSettings() });
}

function readHiringPrefs() {
  const format = elements.exportFormat.value === "csv" ? "csv" : "json";
  const requestedRetention = Number(elements.historyRetention.value);
  return {
    autoExpand: elements.autoExpand.checked,
    filter: FILTERS.includes(elements.categoryFilter.value) ? elements.categoryFilter.value : "all",
    matchesOnly: elements.matchesOnly.checked,
    exportFormat: format,
    exportFilteredOnly: elements.exportFilteredOnly.checked,
    includeFullText: elements.includeFullText.checked,
    includeEmails: elements.includeEmails.checked,
    includeJobTitles: elements.includeJobTitles.checked,
    includeMetrics: elements.includeMetrics.checked,
    includePostMetadata: elements.includePostMetadata.checked,
    keepHistory: elements.keepHistory.checked,
    historyRetentionDays: [7, 30, 90].includes(requestedRetention) ? requestedRetention : 30
  };
}

async function saveHiringPrefs() {
  hiringPrefs = readHiringPrefs();
  await chrome.storage.local.set({ hiringPreferences: hiringPrefs });
}

function monitorOptions() {
  const preferences = readHiringPrefs();
  return {
    autoExpand: preferences.autoExpand,
    filter: preferences.filter,
    matchesOnly: preferences.matchesOnly,
    keepHistory: preferences.keepHistory,
    historyRetentionDays: preferences.historyRetentionDays
  };
}

function queueSaveSettings() {
  updateSettingLabels();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveSettings().catch(() => setGlobalNotice("Could not save settings.", "error")); }, 120);
}

function setGlobalNotice(message, kind = "") {
  elements.globalNotice.textContent = message;
  elements.globalNotice.className = `global-notice${kind ? ` ${kind}` : ""}`;
}

const REVIEW_LABELS = new Set(["useful", "irrelevant", "false_positive"]);

function sanitizeHistory(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((record) => record && typeof record === "object" && (record.id || record.permalink))
    .sort((a, b) => Date.parse(b.lastSeenAt || b.firstSeenAt || "") - Date.parse(a.lastSeenAt || a.firstSeenAt || ""))
    .slice(0, 500);
}

function sanitizeReviewLabels(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  const entries = [];
  for (const [id, value] of Object.entries(raw)) {
    const label = typeof value === "string" ? value : value?.label;
    if (!id || !REVIEW_LABELS.has(label)) continue;
    const updatedAt = value && typeof value === "object" && Number.isFinite(Date.parse(value.updatedAt))
      ? Date.parse(value.updatedAt)
      : 0;
    entries.push([id.slice(0, 180), { label, updatedAt: new Date(updatedAt || Date.now()).toISOString() }]);
  }
  entries.sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt));
  return new Map(entries.slice(-1000));
}

function postKey(post) {
  return String(post?.id || post?.sourcePostId || post?.permalink || "");
}

async function persistReviewLabels() {
  const stored = Object.fromEntries(reviewLabels.entries());
  await chrome.storage.local.set({ hiringReviewLabels: stored });
}

function renderHistoryStatus() {
  const count = savedHistory.length;
  if (elements.keepHistory.checked) {
    elements.historyStatus.textContent = `On · ${count} saved post${count === 1 ? "" : "s"} · ${elements.historyRetention.value}-day retention${hiringStatus?.historyLimitReached ? " · storage cap reached" : ""}.`;
  } else if (count) {
    elements.historyStatus.textContent = `Off · ${count} previously saved post${count === 1 ? "" : "s"} remain until cleared and are still exportable.`;
  } else {
    elements.historyStatus.textContent = "Off · no post history is being saved.";
  }
  elements.clearHistoryBtn.disabled = count === 0;
  renderButtons();
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function setConnection(connected, feed = false) {
  available = connected;
  isFeed = feed;
  const targetInBackground = Number.isInteger(targetTabId) && Number.isInteger(activeTabId) && targetTabId !== activeTabId;
  elements.connectionChip.textContent = !connected ? "NOT CONNECTED" : !feed ? "OPEN FEED" : targetInBackground ? "FEED BACKGROUND" : "LINKEDIN FEED";
  elements.connectionChip.className = `connection-chip${connected && feed && !targetInBackground ? " connected" : !connected ? " error" : ""}`;
  renderTargetState();
  renderButtons();
}

function renderTargetState() {
  const hasTarget = Number.isInteger(targetTabId);
  const targetIsActive = hasTarget && activeTabId === targetTabId;
  elements.targetBadge.textContent = !hasTarget ? "NO FEED SELECTED" : targetIsActive ? "FEED TAB ACTIVE" : "FEED TAB IN BACKGROUND";
  elements.targetBadge.className = `target-badge${!hasTarget ? " error" : targetIsActive ? " active" : " background"}`;
  if (!hasTarget) {
    elements.targetDetail.textContent = "Choose a LinkedIn feed tab. The target is remembered when you reopen this popup.";
  } else if (targetIsActive) {
    elements.targetDetail.textContent = "This tab is selected. Scrolling and local gathering are available.";
  } else {
    elements.targetDetail.textContent = "Scrolling and gathering continue in the background. Chrome may throttle hidden tabs; return here to interact.";
  }
  elements.useActiveFeedBtn.disabled = !Number.isInteger(activeTabId) || !isLinkedInUrl(activeTabUrl) || targetIsActive;
  elements.returnToFeedBtn.disabled = !hasTarget || targetIsActive;
  renderButtons();
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

function isLinkedInUrl(url = "") {
  return /^https:\/\/www\.linkedin\.com\//i.test(url);
}

function isLinkedInFeedUrl(url = "") {
  return /^https:\/\/www\.linkedin\.com\/(?:$|feed(?:\/|$|[?#]))/i.test(url);
}

async function writeTargetForWindow(windowId, tabId) {
  if (!Number.isInteger(windowId)) return;
  const stored = await chrome.storage.local.get({ hiringTargetByWindow: {} });
  const targets = { ...(stored.hiringTargetByWindow || {}) };
  if (Number.isInteger(tabId)) targets[String(windowId)] = tabId;
  else delete targets[String(windowId)];
  await chrome.storage.local.set({ hiringTargetByWindow: targets });
}

async function setTargetTab(tabId, windowId, stopPrevious = true) {
  if (!Number.isInteger(tabId)) return false;
  const targetChanged = targetTabId !== tabId;
  if (stopPrevious && Number.isInteger(targetTabId) && targetTabId !== tabId) {
    try { await chrome.tabs.sendMessage(targetTabId, { type: "STOP_HIRING_MONITOR" }); } catch (_error) { /* Old target may have closed. */ }
    try { await chrome.tabs.sendMessage(targetTabId, { type: "STOP" }); } catch (_error) { /* Old target may have closed. */ }
  }
  targetTabId = tabId;
  targetWindowId = windowId;
  if (targetChanged) {
    scrollStatus = null;
    hiringStatus = null;
  }
  await writeTargetForWindow(windowId, tabId);
  renderTargetState();
  return true;
}

async function chooseActiveFeedTab(tab = null, quiet = false) {
  const current = tab || await activeTab();
  activeTabId = Number.isInteger(current?.id) ? current.id : null;
  activeTabUrl = current?.url || "";
  if (!current || !Number.isInteger(current.id) || !isLinkedInUrl(activeTabUrl)) {
    if (!quiet) setGlobalNotice("Switch to a LinkedIn feed tab, then select it here.");
    renderTargetState();
    return false;
  }
  try {
    const status = await chrome.tabs.sendMessage(current.id, { type: "GET_STATUS" });
    if (!status?.isFeed) {
      if (!quiet) setGlobalNotice("Open linkedin.com/feed/ in this tab before selecting it.");
      return false;
    }
    await setTargetTab(current.id, current.windowId);
    setConnection(true, true);
    if (!quiet) setGlobalNotice("LinkedIn feed selected. The target remains remembered when you reopen the popup.", "success");
    return true;
  } catch (_error) {
    if (!quiet) setGlobalNotice("Refresh this LinkedIn feed tab so the extension scripts can load.", "error");
    return false;
  }
}

async function clearTargetTab() {
  const oldWindowId = targetWindowId;
  targetTabId = null;
  targetWindowId = null;
  scrollStatus = null;
  hiringStatus = null;
  if (Number.isInteger(oldWindowId)) await writeTargetForWindow(oldWindowId, null).catch(() => {});
  elements.stateLabel.textContent = "READY";
  elements.stateDot.className = "state-dot";
  elements.statusDetail.textContent = "Select a LinkedIn feed tab to begin.";
  elements.monitorBtn.textContent = "Start hiring monitor";
  elements.monitorBtn.classList.remove("is-running");
  elements.monitorStatus.textContent = "Select a LinkedIn feed tab to monitor.";
  elements.monitorStatus.className = "monitor-status";
  elements.domHealthStatus.textContent = "Feed DOM check runs when monitoring starts.";
  elements.domHealthStatus.className = "dom-health";
  elements.openCount.textContent = "0";
  elements.recruiterCount.textContent = "0";
  elements.possibleCount.textContent = "0";
  elements.relatedCount.textContent = "0";
  elements.tabMatchCount.textContent = "0";
  elements.processedDetail.textContent = "Select a feed tab to scan posts.";
  elements.matchList.replaceChildren();
  setConnection(false, false);
  renderTargetState();
}

async function initializeTarget() {
  const active = await activeTab();
  activeTabId = Number.isInteger(active?.id) ? active.id : null;
  activeTabUrl = active?.url || "";
  const windowId = Number.isInteger(active?.windowId) ? active.windowId : null;
  if (Number.isInteger(windowId)) {
    const stored = await chrome.storage.local.get({ hiringTargetByWindow: {} });
    const rememberedId = Number((stored.hiringTargetByWindow || {})[String(windowId)]);
    if (Number.isInteger(rememberedId)) {
      try {
        const status = await chrome.tabs.sendMessage(rememberedId, { type: "GET_STATUS" });
        if (status?.isFeed) {
          targetTabId = rememberedId;
          targetWindowId = windowId;
        } else {
          await writeTargetForWindow(windowId, null);
        }
      } catch (_error) {
        await writeTargetForWindow(windowId, null);
      }
    }
  }
  if (!Number.isInteger(targetTabId) && active && isLinkedInUrl(activeTabUrl)) {
    await chooseActiveFeedTab(active, true);
  }
  renderTargetState();
}

async function refreshActiveTabContext() {
  const active = await activeTab();
  activeTabId = Number.isInteger(active?.id) ? active.id : null;
  activeTabUrl = active?.url || "";
  if (!Number.isInteger(targetTabId) && active && isLinkedInUrl(activeTabUrl)) {
    await chooseActiveFeedTab(active, true);
  }
  renderTargetState();
}

async function sendToTargetTab(message) {
  if (!Number.isInteger(targetTabId)) {
    const selected = await chooseActiveFeedTab(null, true);
    if (!selected || !Number.isInteger(targetTabId)) {
      setConnection(false, false);
      setGlobalNotice("Select an open LinkedIn feed tab to use the popup.");
      return null;
    }
  }
  try {
    const response = await chrome.tabs.sendMessage(targetTabId, message);
    setConnection(Boolean(response && response.supported !== false), Boolean(response && response.isFeed));
    if (response && response.isFeed === false) {
      setGlobalNotice("The selected tab is no longer on the LinkedIn feed. Choose a feed tab to continue.");
    }
    return response;
  } catch (_error) {
    setConnection(false, false);
    setGlobalNotice("The selected feed tab is unavailable. Return to it and refresh LinkedIn, or select another feed.", "error");
    return null;
  }
}

function renderButtons() {
  const state = scrollStatus?.state || "stopped";
  elements.start.disabled = !available || !isFeed || state === "running";
  elements.start.textContent = state === "paused" ? "Resume scrolling" : state === "running" ? "Scrolling…" : "Start scrolling";
  elements.pause.disabled = !available || state !== "running";
  elements.stop.disabled = !available || state === "stopped";
  elements.monitorBtn.disabled = !available || !isFeed;
  elements.autoExpand.disabled = false;
  elements.exportBtn.textContent = `Export ${elements.exportFormat.value === "csv" ? "CSV" : "JSON"}`;
  const archiveCount = Number(hiringStatus?.archiveCount) || 0;
  elements.exportBtn.disabled = savedHistory.length === 0 && (!available || archiveCount === 0);
  elements.clearHistoryBtn.disabled = savedHistory.length === 0;
}

function renderScrollStatus(status) {
  if (!status) return;
  scrollStatus = status;
  setConnection(status.supported !== false, Boolean(status.isFeed));

  const state = status.state || "stopped";
  const labels = { running: "SCROLLING", paused: "PAUSED", stopped: status.reason ? "STOPPED" : "READY" };
  elements.stateLabel.textContent = labels[state] || "READY";
  elements.stateDot.className = `state-dot ${state}`;
  elements.modeTag.textContent = MODE_NAMES[status.mode] || MODE_NAMES[elements.mode.value] || "Human-like";
  const steps = Number(status.steps) || 0;
  const maxSteps = Number(status.maxSteps) || 0;
  const percent = maxSteps ? Math.min(100, (steps / maxSteps) * 100) : 0;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));

  if (state === "running" || state === "paused") {
    elements.statusDetail.textContent = `${steps} / ${maxSteps} steps · ${formatDuration(status.elapsedMs)} active`;
    const targetIsBackground = Number.isInteger(targetTabId) && Number.isInteger(activeTabId) && targetTabId !== activeTabId;
    setGlobalNotice(state === "running"
      ? (targetIsBackground ? "Scrolling the selected feed in the background; Chrome may throttle it." : "Scrolling the selected LinkedIn feed tab.")
      : status.reason || "Scroll paused.", state === "running" ? "success" : "");
  } else {
    elements.statusDetail.textContent = status.reason || (status.isFeed ? "Ready to scroll the LinkedIn feed." : "Open the feed to begin.");
    setGlobalNotice(status.isFeed ? (status.reason ? "You can start another run when ready." : "Choose a pace, then start scrolling.") : "Open or select a LinkedIn feed tab to begin.");
  }
  renderButtons();
}

function filteredResults(status) {
  const list = Array.isArray(status?.results) ? status.results : [];
  const filter = elements.categoryFilter.value || "all";
  return filter === "all" ? list : list.filter((item) => item.category === filter);
}

function categoryLabel(category) {
  return CATEGORY_NAMES[category] || "Possible match";
}

function makeMatchItem(result) {
  const item = document.createElement("article");
  item.className = "match-item";

  const top = document.createElement("div");
  top.className = "match-topline";
  const category = document.createElement("span");
  category.className = `match-category ${result.category || "possible"}`;
  category.textContent = categoryLabel(result.category);
  const confidence = document.createElement("span");
  confidence.className = `confidence-chip ${result.confidence || "low"}`;
  confidence.textContent = result.partial ? "Partial" : result.confidence || "Review";
  top.append(category, confidence);

  const snippet = document.createElement("p");
  snippet.className = "match-snippet";
  snippet.textContent = result.snippet || "No preview text available.";

  const evidence = document.createElement("p");
  evidence.className = "match-evidence";
  evidence.textContent = Array.isArray(result.evidence) && result.evidence.length
    ? `Signals: ${result.evidence.join(" · ")}`
    : "Review the full post; this is a low-confidence local match.";

  item.append(top, snippet, evidence);
  if (result.partial) {
    const partial = document.createElement("span");
    partial.className = "partial-note";
    partial.textContent = "Text may still be truncated; monitor will retry after expansion.";
    item.append(partial);
  }

  const key = postKey(result);
  const reviewRow = document.createElement("div");
  reviewRow.className = "review-row";
  const reviewCopy = document.createElement("span");
  reviewCopy.className = "review-label";
  reviewCopy.textContent = "Your local review";
  const reviewSelect = document.createElement("select");
  reviewSelect.className = "review-select";
  reviewSelect.setAttribute("aria-label", "Local review label; does not affect detection");
  const choices = [
    ["", "No label"],
    ["useful", "Useful"],
    ["irrelevant", "Irrelevant"],
    ["false_positive", "False positive"]
  ];
  for (const [value, label] of choices) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    reviewSelect.append(option);
  }
  reviewSelect.value = key ? (reviewLabels.get(key)?.label || "") : "";
  reviewSelect.disabled = !key;
  reviewSelect.addEventListener("change", async () => {
    if (!key) return;
    if (REVIEW_LABELS.has(reviewSelect.value)) {
      reviewLabels.set(key, { label: reviewSelect.value, updatedAt: new Date().toISOString() });
      if (reviewLabels.size > 1000) {
        const oldest = Array.from(reviewLabels.entries()).sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt))[0];
        if (oldest) reviewLabels.delete(oldest[0]);
      }
    } else {
      reviewLabels.delete(key);
    }
    try {
      await persistReviewLabels();
      setGlobalNotice("Review label saved on this device; detection signals were not changed.", "success");
    } catch (_error) {
      setGlobalNotice("Could not save the review label locally.", "error");
    }
  });
  reviewRow.append(reviewCopy, reviewSelect);
  item.append(reviewRow);
  return item;
}

function renderHiringStatus(status) {
  if (!status) return;
  hiringStatus = status;
  setConnection(status.supported !== false, Boolean(status.isFeed));
  if (status.monitoring && typeof status.autoExpand === "boolean") elements.autoExpand.checked = status.autoExpand;
  if (status.monitoring && typeof status.matchesOnly === "boolean") elements.matchesOnly.checked = status.matchesOnly;

  const monitoring = Boolean(status.monitoring);
  elements.monitorBtn.textContent = monitoring ? "Stop hiring monitor" : "Start hiring monitor";
  elements.monitorBtn.classList.toggle("is-running", monitoring);
  if (monitoring && typeof status.keepHistory === "boolean") elements.keepHistory.checked = status.keepHistory;
  if (monitoring && [7, 30, 90].includes(Number(status.historyRetentionDays))) elements.historyRetention.value = String(status.historyRetentionDays);
  const duplicates = Number(status.duplicateMergedCount) || 0;
  elements.monitorStatus.textContent = monitoring
    ? `Monitoring this feed · ${Number(status.processedCount) || 0} cards scanned${status.autoExpand ? " · auto-expansion on" : ""}${status.matchesOnly ? " · selected feed filter on" : ""}${duplicates ? ` · ${duplicates} duplicate card${duplicates === 1 ? "" : "s"} merged` : ""}.`
    : Number(status.processedCount) > 0
      ? `Monitor off · ${Number(status.processedCount)} cards scanned in the last run${duplicates ? ` · ${duplicates} duplicates merged` : ""}.`
      : "Monitor is off.";
  elements.monitorStatus.className = `monitor-status${monitoring ? " running" : ""}`;

  const domHealth = status.domHealth || {};
  const healthLevel = ["ok", "partial", "warning"].includes(domHealth.level) ? domHealth.level : "";
  const healthMessage = domHealth.message || (monitoring ? "Checking LinkedIn feed selectors…" : "Feed DOM check runs when monitoring starts.");
  elements.domHealthStatus.textContent = `${healthMessage}${domHealth.background ? " Hidden tab: scrolling and gathering continue; Chrome may throttle them." : ""}`;
  elements.domHealthStatus.className = `dom-health${healthLevel ? ` ${healthLevel === "ok" ? "good" : healthLevel}` : ""}`;
  renderHistoryStatus();

  const counts = status.counts || {};
  elements.openCount.textContent = String(counts.open_role || 0);
  elements.recruiterCount.textContent = String(counts.recruiter_search || 0);
  elements.possibleCount.textContent = String((counts.possible || 0) + (counts.partial || 0));
  elements.relatedCount.textContent = String((counts.job_seeker || 0) + (counts.hiring_discussion || 0) + (counts.closed || 0));
  const total = Object.values(counts).reduce((sum, count) => sum + (Number(count) || 0), 0);
  elements.tabMatchCount.textContent = total > 99 ? "99+" : String(total);
  elements.processedDetail.textContent = monitoring
    ? `${Number(status.processedCount) || 0} cards checked · ${Number(status.archiveCount) || 0} unique detected posts · newest detections first`
    : Number(status.processedCount) > 0
      ? `${Number(status.processedCount)} cards checked · restart the monitor to scan again`
      : "Start the monitor to scan posts as you browse.";
  const archiveCount = Number(status.archiveCount) || 0;
  elements.exportStatus.textContent = archiveCount || savedHistory.length
    ? `${archiveCount} current-run posts${savedHistory.length ? ` · ${savedHistory.length} saved-history posts` : ""} available locally${status.archiveLimitReached ? " · current archive cap reached" : ""}. Choose format, fields, and category above.`
    : monitoring
      ? "Detected posts will be available for local download. Choose JSON or CSV and select fields above."
      : "No detections or saved history to export yet. Review labels stay local and do not change detection.";

  const items = filteredResults(status);
  elements.matchList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌕";
    const title = document.createElement("strong");
    title.textContent = monitoring ? "No matches in this view yet" : "No posts scanned yet";
    const detail = document.createElement("span");
    detail.textContent = monitoring
      ? "Keep browsing. Possible or partial matches stay visible for review."
      : "Start the monitor to detect likely hiring posts.";
    empty.append(icon, title, detail);
    elements.matchList.append(empty);
  } else {
    for (const result of items) elements.matchList.append(makeMatchItem(result));
  }
  renderButtons();
}

async function refreshScrollStatus() {
  const status = await sendToTargetTab({ type: "GET_STATUS" });
  if (status) renderScrollStatus(status);
}

async function refreshHiringStatus() {
  const status = await sendToTargetTab({ type: "GET_HIRING_STATUS" });
  if (status) renderHiringStatus(status);
}

async function refreshAll() {
  await refreshActiveTabContext();
  if (!Number.isInteger(targetTabId)) {
    renderButtons();
    return;
  }
  await Promise.all([refreshScrollStatus(), refreshHiringStatus()]);
}

async function runScrollCommand(type) {
  if (type === "START") {
    await saveSettings();
    setGlobalNotice("Starting the feed scroller…");
  }
  const message = type === "START" ? { type, settings: readSettings() } : { type };
  const response = await sendToTargetTab(message);
  if (!response) return;
  if (response.error) {
    setGlobalNotice(response.error, "error");
    return;
  }
  if (response.status) renderScrollStatus(response.status);
  await refreshScrollStatus();
}

async function runMonitorCommand() {
  const isRunning = Boolean(hiringStatus?.monitoring);
  if (!isRunning) await saveHiringPrefs();
  const response = await sendToTargetTab(isRunning
    ? { type: "STOP_HIRING_MONITOR" }
    : { type: "START_HIRING_MONITOR", options: monitorOptions() });
  if (!response) return;
  if (response.error) {
    setGlobalNotice(response.error, "error");
    return;
  }
  if (response.status) renderHiringStatus(response.status);
}

async function updateMonitorPreferences() {
  await saveHiringPrefs();
  renderHistoryStatus();
  if (hiringStatus?.monitoring && available && isFeed) {
    const response = await sendToTargetTab({ type: "SET_HIRING_OPTIONS", options: monitorOptions() });
    if (response?.status) renderHiringStatus(response.status);
  }
}

async function clearLocalHistory() {
  elements.clearHistoryBtn.disabled = true;
  try {
    elements.keepHistory.checked = false;
    await saveHiringPrefs();
    if (hiringStatus?.monitoring && available && isFeed) {
      const response = await sendToTargetTab({ type: "SET_HIRING_OPTIONS", options: monitorOptions() });
      if (response?.status) renderHiringStatus(response.status);
    }
    await chrome.storage.local.remove("hiringPostHistory");
    savedHistory = [];
    renderHistoryStatus();
    elements.exportStatus.textContent = "Saved post history cleared from this device. Review labels were kept.";
    setGlobalNotice("Local post history cleared; no post data was uploaded.", "success");
  } catch (_error) {
    setGlobalNotice("Could not clear saved history from local storage.", "error");
    renderHistoryStatus();
  }
}

async function exportHiringPosts() {
  elements.exportBtn.disabled = true;
  const format = elements.exportFormat.value === "csv" ? "csv" : "json";
  elements.exportStatus.textContent = `Preparing the local ${format.toUpperCase()} export…`;
  try {
    await saveHiringPrefs();
    let response = null;
    if (available && isFeed) response = await sendToTargetTab({ type: "EXPORT_HIRING_POSTS" });
    const stored = await chrome.storage.local.get({ hiringPostHistory: savedHistory });
    savedHistory = sanitizeHistory(stored.hiringPostHistory);
    renderHistoryStatus();

    const combined = new Map();
    for (const post of savedHistory) {
      const key = postKey(post);
      if (key) combined.set(key, post);
    }
    for (const post of Array.isArray(response?.posts) ? response.posts : []) {
      const key = postKey(post);
      if (key) combined.set(key, post);
    }
    let posts = Array.from(combined.values())
      .sort((a, b) => Date.parse(a.firstSeenAt || "") - Date.parse(b.firstSeenAt || ""));
    const totalAvailable = posts.length;
    if (elements.exportFilteredOnly.checked && elements.categoryFilter.value !== "all") {
      posts = posts.filter((post) => post.category === elements.categoryFilter.value);
    }
    if (!posts.length) {
      elements.exportStatus.textContent = totalAvailable
        ? "No posts match the current export category. Change the category or disable “selected category only”."
        : "No detections or saved history are available to export.";
      return;
    }

    const options = {
      fullText: elements.includeFullText.checked,
      emails: elements.includeEmails.checked,
      jobTitles: elements.includeJobTitles.checked,
      metrics: elements.includeMetrics.checked,
      postMetadata: elements.includePostMetadata.checked
    };
    const projectedPosts = posts.map((post) => {
      const key = postKey(post);
      const review = key ? reviewLabels.get(key)?.label : null;
      const output = {
        id: post.id || null,
        sourcePostId: post.sourcePostId || null,
        category: post.category || "unknown",
        confidence: post.confidence || null,
        score: Number.isFinite(post.score) ? post.score : null,
        evidence: Array.isArray(post.evidence) ? post.evidence : [],
        signals: post.signals || null,
        firstSeenAt: post.firstSeenAt || null,
        lastSeenAt: post.lastSeenAt || null,
        reviewLabel: review || null
      };
      if (options.fullText) {
        output.fullText = post.fullText || "";
        output.contentComplete = post.contentComplete !== false;
      }
      const extracted = {};
      if (options.emails) extracted.emails = post.extracted?.emails || [];
      if (options.jobTitles) extracted.jobTitles = post.extracted?.jobTitles || [];
      if (options.postMetadata) {
        output.permalink = post.permalink || null;
        output.author = post.author || { name: null, profileUrl: null };
        extracted.hashtags = post.extracted?.hashtags || [];
        extracted.links = post.extracted?.links || [];
      }
      if (Object.keys(extracted).length) output.extracted = extracted;
      if (options.metrics) {
        output.postAge = post.postAge || { label: null, publishedAt: null, ageSecondsApprox: null, ageDaysApprox: null };
        output.metrics = post.metrics || { reactions: null, comments: null, reposts: null, views: null };
        output.metricsCapturedAt = post.metricsCapturedAt || null;
      }
      return output;
    });

    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/u, "Z");
    let blob;
    let extension;
    if (format === "csv") {
      const fields = [
        ["id", (post) => post.id],
        ["sourcePostId", (post) => post.sourcePostId],
        ["category", (post) => post.category],
        ["confidence", (post) => post.confidence],
        ["score", (post) => post.score],
        ["evidence", (post) => post.evidence],
        ["signals", (post) => post.signals],
        ["reviewLabel", (post) => post.reviewLabel],
        ["firstSeenAt", (post) => post.firstSeenAt],
        ["lastSeenAt", (post) => post.lastSeenAt]
      ];
      if (options.fullText) fields.push(["fullText", (post) => post.fullText], ["contentComplete", (post) => post.contentComplete]);
      if (options.emails) fields.push(["emails", (post) => post.extracted?.emails]);
      if (options.jobTitles) fields.push(["jobTitleCandidates", (post) => post.extracted?.jobTitles]);
      if (options.metrics) fields.push(
        ["ageLabel", (post) => post.postAge?.label],
        ["publishedAt", (post) => post.postAge?.publishedAt],
        ["ageSecondsApprox", (post) => post.postAge?.ageSecondsApprox],
        ["ageDaysApprox", (post) => post.postAge?.ageDaysApprox],
        ["reactions", (post) => post.metrics?.reactions],
        ["comments", (post) => post.metrics?.comments],
        ["reposts", (post) => post.metrics?.reposts],
        ["views", (post) => post.metrics?.views],
        ["metricsCapturedAt", (post) => post.metricsCapturedAt]
      );
      if (options.postMetadata) fields.push(
        ["permalink", (post) => post.permalink],
        ["authorName", (post) => post.author?.name],
        ["authorProfileUrl", (post) => post.author?.profileUrl],
        ["hashtags", (post) => post.extracted?.hashtags],
        ["links", (post) => post.extracted?.links]
      );
      const csvValue = (value) => {
        const raw = value === null || value === undefined
          ? ""
          : Array.isArray(value) || (typeof value === "object") ? JSON.stringify(value) : String(value);
        return `"${raw.replace(/"/g, '""')}"`;
      };
      const rows = [fields.map(([name]) => csvValue(name)).join(",")];
      for (const post of projectedPosts) rows.push(fields.map(([, getValue]) => csvValue(getValue(post))).join(","));
      blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
      extension = "csv";
    } else {
      const payload = {
        schemaVersion: response?.schemaVersion || "1.0",
        exportedAt: new Date().toISOString(),
        scope: elements.exportFilteredOnly.checked
          ? `Posts from the selected category: ${elements.categoryFilter.value}.`
          : "All detected posts available from the current run and local history.",
        selectedCategory: elements.exportFilteredOnly.checked ? elements.categoryFilter.value : "all",
        fieldsIncluded: options,
        monitorRun: response?.monitorRun || null,
        extractionNotes: response?.extractionNotes || {
          content: "Full post text is included only if selected and available in the local archive.",
          reviewLabels: "Review labels are user-provided local notes and do not affect classifier signals."
        },
        posts: projectedPosts
      };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      extension = "json";
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `linkedin-hiring-posts-${timestamp}.${extension}`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

    elements.exportStatus.textContent = `${projectedPosts.length} posts exported to a local ${format.toUpperCase()} file${savedHistory.length ? `, including local history` : ""}. Selected fields and category were applied.`;
    setGlobalNotice(`${format.toUpperCase()} export created locally; no post data was uploaded.`, "success");
  } catch (_error) {
    elements.exportStatus.textContent = `The ${format.toUpperCase()} download failed. Try again from the LinkedIn feed tab.`;
  } finally {
    renderButtons();
  }
}

function switchView(name) {
  const hiring = name === "hiring";
  elements.scrollTab.classList.toggle("active", !hiring);
  elements.hiringTab.classList.toggle("active", hiring);
  elements.scrollTab.setAttribute("aria-selected", String(!hiring));
  elements.hiringTab.setAttribute("aria-selected", String(hiring));
  elements.scrollView.classList.toggle("active", !hiring);
  elements.hiringView.classList.toggle("active", hiring);
  elements.scrollView.hidden = hiring;
  elements.hiringView.hidden = !hiring;
  if (hiring) void refreshHiringStatus();
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get({
      settings: DEFAULT_SETTINGS,
      hiringPreferences: DEFAULT_HIRING_PREFS,
      hiringPostHistory: [],
      hiringReviewLabels: {},
      adaptivePacingMigration: 0
    });
    const initialSettings = sanitizeSettings(stored.settings || DEFAULT_SETTINGS);
    if (Number(stored.adaptivePacingMigration) < 2) {
      await chrome.storage.local.set({ settings: initialSettings, adaptivePacingMigration: 2 });
    }
    applySettings(initialSettings);
    hiringPrefs = { ...DEFAULT_HIRING_PREFS, ...(stored.hiringPreferences || {}) };
    if (!FILTERS.includes(hiringPrefs.filter)) hiringPrefs.filter = "all";
    if (!["json", "csv"].includes(hiringPrefs.exportFormat)) hiringPrefs.exportFormat = "json";
    if (![7, 30, 90].includes(Number(hiringPrefs.historyRetentionDays))) hiringPrefs.historyRetentionDays = 30;
    for (const key of ["includeFullText", "includeEmails", "includeJobTitles", "includeMetrics", "includePostMetadata"]) {
      hiringPrefs[key] = hiringPrefs[key] !== false;
    }
    elements.autoExpand.checked = hiringPrefs.autoExpand !== false;
    elements.categoryFilter.value = hiringPrefs.filter;
    elements.matchesOnly.checked = Boolean(hiringPrefs.matchesOnly);
    elements.exportFormat.value = hiringPrefs.exportFormat;
    elements.exportFilteredOnly.checked = Boolean(hiringPrefs.exportFilteredOnly);
    elements.includeFullText.checked = hiringPrefs.includeFullText;
    elements.includeEmails.checked = hiringPrefs.includeEmails;
    elements.includeJobTitles.checked = hiringPrefs.includeJobTitles;
    elements.includeMetrics.checked = hiringPrefs.includeMetrics;
    elements.includePostMetadata.checked = hiringPrefs.includePostMetadata;
    elements.keepHistory.checked = Boolean(hiringPrefs.keepHistory);
    elements.historyRetention.value = String(hiringPrefs.historyRetentionDays);
    savedHistory = sanitizeHistory(stored.hiringPostHistory);
    reviewLabels = sanitizeReviewLabels(stored.hiringReviewLabels);
  } catch (_error) {
    applySettings(DEFAULT_SETTINGS);
    hiringPrefs = { ...DEFAULT_HIRING_PREFS };
    savedHistory = [];
    reviewLabels = new Map();
    elements.autoExpand.checked = true;
    elements.matchesOnly.checked = false;
    elements.exportFormat.value = "json";
    elements.exportFilteredOnly.checked = false;
    elements.includeFullText.checked = true;
    elements.includeEmails.checked = true;
    elements.includeJobTitles.checked = true;
    elements.includeMetrics.checked = true;
    elements.includePostMetadata.checked = true;
    elements.keepHistory.checked = false;
    elements.historyRetention.value = "30";
  }
  renderHistoryStatus();

  elements.mode.addEventListener("change", () => { applySafetyModeConstraints(); queueSaveSettings(); });
  [elements.maxMinutes, elements.maxSteps, elements.pauseOnInput]
    .forEach((element) => element.addEventListener("change", queueSaveSettings));

  elements.start.addEventListener("click", () => void runScrollCommand(scrollStatus?.state === "paused" ? "RESUME" : "START"));
  elements.pause.addEventListener("click", () => void runScrollCommand("PAUSE"));
  elements.stop.addEventListener("click", () => void runScrollCommand("STOP"));
  elements.monitorBtn.addEventListener("click", () => void runMonitorCommand());
  elements.exportBtn.addEventListener("click", () => void exportHiringPosts());
  elements.scrollTab.addEventListener("click", () => switchView("scroll"));
  elements.hiringTab.addEventListener("click", () => switchView("hiring"));
  elements.useActiveFeedBtn.addEventListener("click", async () => {
    if (await chooseActiveFeedTab()) await refreshAll();
  });
  elements.returnToFeedBtn.addEventListener("click", async () => {
    if (!Number.isInteger(targetTabId)) return;
    try {
      await chrome.tabs.update(targetTabId, { active: true });
      setGlobalNotice("Returned to the selected LinkedIn feed tab.", "success");
    } catch (_error) {
      await clearTargetTab();
      setGlobalNotice("The selected feed tab was closed. Choose another LinkedIn feed.", "error");
    }
  });
  chrome.tabs.onActivated?.addListener(() => { void refreshActiveTabContext(); });
  chrome.tabs.onRemoved?.addListener((tabId) => {
    if (tabId === targetTabId) {
      void clearTargetTab();
      setGlobalNotice("The selected LinkedIn tab closed; live monitoring has ended.");
    }
  });
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (tabId === targetTabId && changeInfo?.url && !isLinkedInFeedUrl(changeInfo.url)) {
      void clearTargetTab();
      setGlobalNotice("The selected tab left the LinkedIn feed; monitoring has ended.");
    }
  });

  elements.autoExpand.addEventListener("change", async () => {
    await saveHiringPrefs();
    if (hiringStatus?.monitoring && available && isFeed) {
      const response = await sendToTargetTab({ type: "SET_HIRING_OPTIONS", options: monitorOptions() });
      if (response?.status) renderHiringStatus(response.status);
    }
  });
  elements.categoryFilter.addEventListener("change", async () => {
    await saveHiringPrefs();
    if (hiringStatus?.monitoring && available && isFeed) {
      const response = await sendToTargetTab({ type: "SET_HIRING_FILTER", filter: elements.categoryFilter.value, matchesOnly: elements.matchesOnly.checked });
      if (response?.status) renderHiringStatus(response.status);
    } else if (hiringStatus) {
      renderHiringStatus(hiringStatus);
    }
  });
  elements.matchesOnly.addEventListener("change", async () => {
    await saveHiringPrefs();
    if (hiringStatus?.monitoring && available && isFeed) {
      const response = await sendToTargetTab({ type: "SET_HIRING_OPTIONS", options: monitorOptions() });
      if (response?.status) renderHiringStatus(response.status);
    }
  });

  [elements.exportFormat, elements.exportFilteredOnly, elements.includeFullText, elements.includeEmails,
    elements.includeJobTitles, elements.includeMetrics, elements.includePostMetadata]
    .forEach((element) => element.addEventListener("change", async () => {
      await saveHiringPrefs();
      renderButtons();
    }));
  elements.keepHistory.addEventListener("change", () => void updateMonitorPreferences());
  elements.historyRetention.addEventListener("change", () => void updateMonitorPreferences());
  elements.clearHistoryBtn.addEventListener("click", () => void clearLocalHistory());

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.hiringPostHistory) {
      savedHistory = sanitizeHistory(changes.hiringPostHistory.newValue);
      renderHistoryStatus();
      if (hiringStatus) renderHiringStatus(hiringStatus);
    }
    if (changes.hiringReviewLabels) {
      reviewLabels = sanitizeReviewLabels(changes.hiringReviewLabels.newValue);
      if (hiringStatus) renderHiringStatus(hiringStatus);
    }
  });

  await initializeTarget();
  await refreshAll();
  refreshTimer = setInterval(() => void refreshAll(), 1300);
}

window.addEventListener("unload", () => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (saveTimer) clearTimeout(saveTimer);
});

void initialize();
