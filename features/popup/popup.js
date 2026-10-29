const shared = globalThis.__LI_FEED_SHARED__;
const i18n = globalThis.__LI_FEED_I18N__;
const exporter = globalThis.__LI_FEED_EXPORT__;
const resultsRenderer = globalThis.__LI_FEED_RESULTS__;
const store = globalThis.__LI_FEED_POPUP_STORE__;
if (!shared || !i18n || !exporter || !resultsRenderer || !store) throw new Error("Popup helpers must load before the popup controller.");
const t = (key, substitutions) => i18n.t(key, substitutions);

// The shared module is the canonical source for these defaults and for settings
// sanitization; the popup must not re-declare them or the popup's clamps can
// silently drift from what the content script actually enforces.
const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;
const DEFAULT_HIRING_PREFS = shared.DEFAULT_HIRING_PREFS;
const sanitizeSettings = shared.sanitizeSettings;
const MODE_NAMES = {
  standard: "mode.standard",
  fast: "mode.fast",
  super_fast: "mode.super_fast"
};
const MODE_DESCRIPTIONS = {
  standard: "mode.standardDescription",
  fast: "mode.fastDescription",
  super_fast: "mode.super_fastDescription"
};
const FILTERS = shared.FILTERS;

// Error responses carry short machine codes since the unified protocol; the popup
// renders them as translated notices and falls back to any human-readable message
// for unknown codes (older content scripts still send English sentences).
const ERROR_NOTICE_KEYS = {
  open_feed: "notice.openFeedFirst",
  history_disabled: "notice.historyDisabled",
  storage_unavailable: "notice.storageUnavailable",
  quota_exceeded: "notice.quotaExceeded",
  history_limit: "notice.historyLimit",
  invalid_data: "notice.invalidData",
  not_found: "detail.notFound",
  tab_unavailable: "notice.unavailable"
};

function noticeForError(response) {
  const key = response?.error ? ERROR_NOTICE_KEYS[response.error] : null;
  return key ? t(key) : String(response?.message || response?.error || "");
}

const $ = (selector) => document.querySelector(selector);
const elements = {
  scrollTab: $("#scrollTab"),
  hiringTab: $("#hiringTab"),
  settingsToggle: $("#settingsToggle"),
  settingsDoneBtn: $("#settingsDoneBtn"),
  scrollView: $("#scrollView"),
  hiringView: $("#hiringView"),
  settingsView: $("#settingsView"),
  connectionChip: $("#connectionChip"),
  pipelineChips: $("#pipelineChips"),
  pipelineDelta: $("#pipelineDelta"),
  shortcutsBtn: $("#shortcutsBtn"),
  shortcutOpenPopup: $("#shortcutOpenPopup"),
  shortcutToggleMonitor: $("#shortcutToggleMonitor"),
  shortcutToggleScroll: $("#shortcutToggleScroll"),
  onboarding: $("#onboarding"),
  onboardingDismiss: $("#onboardingDismiss"),
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
  historyMode: $("#historyMode"),
  historyRetention: $("#historyRetention"),
  clearHistoryBtn: $("#clearHistoryBtn"),
  clearAllDataBtn: $("#clearAllDataBtn"),
  diagnosticBtn: $("#diagnosticBtn"),
  historyStatus: $("#historyStatus"),
  categoryFilter: $("#categoryFilter"),
  resultSearch: $("#resultSearch"),
  resultSort: $("#resultSort"),
  previousPage: $("#previousPage"),
  nextPage: $("#nextPage"),
  pageStatus: $("#pageStatus"),
  postDetail: $("#postDetail"),
  exportFormat: $("#exportFormat"),
  exportFilteredOnly: $("#exportFilteredOnly"),
  exportCurrentPageOnly: $("#exportCurrentPageOnly"),
  compactJson: $("#compactJson"),
  includeFullText: $("#includeFullText"),
  includeEmails: $("#includeEmails"),
  includeJobTitles: $("#includeJobTitles"),
  includePostAge: $("#includePostAge"),
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
let savedHistoryStats = { bytes: 0, stores: {}, lastSuccessfulSaveAt: null, limitReached: false, error: null };
let reviewLabels = new Map();
// Pipeline marks are keyed by the same identity the result rows use. The baseline is the
// previous run's start, mirrored from storage so the delta line and the monitor agree.
let pipeline = {};
let pipelineBaselineAt = null;
let shortcuts = { openPopup: "", toggleMonitor: "", toggleScroll: "" };
let refreshTimer = null;
let saveTimer = null;
let refreshPromise = null;
let refreshQueued = false;
let activeRefreshGeneration = null;
let stateGeneration = 0;
let scrollGeneration = 0;
let detailGeneration = 0;
// "relevance" keeps active openings ahead of secondary categories without hiding any of them.
const RESULT_SORTS = ["relevance", "newest", "oldest"];
const resultQuery = { filter: "all", pipelineFilter: "all", search: "", sort: "relevance", page: 1, pageSize: 25 };
let archiveExported = false;
let archiveAcknowledged = false;
let lastArchiveCount = null;
const pendingScrollCommands = new Set();
const pendingMonitorCommands = new Set();

let lastModeWasSuperFast = false;
let preSuperFastSafety = { pauseOnInput: true };
let preSuperFastLimits = { maxMinutes: 15, maxSteps: 180 };
let safetyModeInitialized = false;

// `sanitizeSettings`, `DEFAULT_SETTINGS` and `DEFAULT_HIRING_PREFS` come from the
// shared module (see above); legacy mode mapping and the super_fast guardrails live
// there so every consumer agrees on one behaviour.

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
  elements.modeDescription.textContent = t(MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.standard);
  elements.modeTag.textContent = t(MODE_NAMES[mode] || MODE_NAMES.standard);
  elements.safeBadge.textContent = t(mode === "super_fast" ? "pace.locked" : "pace.smart");
}

// The popup is English-only with a light palette: there is nothing to resolve at
// runtime, but the static string pass also rewrites dynamic labels, so the live status
// surfaces are re-rendered from the last known state right after it.
function applyInterfaceStrings() {
  i18n.applyStrings(document);
  elements.onboarding.hidden = Boolean(hiringPrefs.onboardingSeen);
  updateSettingLabels();
  if (hiringStatus) renderHiringStatus(hiringStatus);
  else {
    elements.monitorBtn.textContent = t("monitor.start");
    elements.pageStatus.textContent = t("results.page", { page: resultQuery.page, count: 0 });
  }
  if (scrollStatus) renderScrollStatus(scrollStatus);
  renderHistoryStatus();
}

async function saveSettings() {
  await chrome.storage.local.set({ settings: readSettings() });
}

function readHiringPrefs() {
  const format = ["csv", "html", "markdown"].includes(elements.exportFormat.value) ? elements.exportFormat.value : "json";
  const requestedRetention = Number(elements.historyRetention.value);
  return {
    autoExpand: elements.autoExpand.checked,
    filter: FILTERS.includes(elements.categoryFilter.value) ? elements.categoryFilter.value : "all",
    pipelineFilter: shared.PIPELINE_FILTERS.includes(resultQuery.pipelineFilter) ? resultQuery.pipelineFilter : "all",
    matchesOnly: elements.matchesOnly.checked,
    exportFormat: format,
    exportFilteredOnly: elements.exportFilteredOnly.checked,
    includeFullText: elements.includeFullText.checked,
    includeEmails: elements.includeEmails.checked,
    includeJobTitles: elements.includeJobTitles.checked,
    includePostAge: elements.includePostAge.checked,
    includeMetrics: elements.includeMetrics.checked,
    compactJson: elements.compactJson.checked,
    includePostMetadata: elements.includePostMetadata.checked,
    historyMode: ["off", "session", "persistent"].includes(elements.historyMode.value) ? elements.historyMode.value : "off",
    keepHistory: elements.historyMode.value !== "off",
    historyRetentionDays: [7, 30, 90].includes(requestedRetention) ? requestedRetention : 30,
    onboardingSeen: Boolean(hiringPrefs?.onboardingSeen)
  };
}

async function saveHiringPrefs() {
  hiringPrefs = readHiringPrefs();
  await chrome.storage.local.set({ hiringPreferences: hiringPrefs });
}

function monitorOptions() {
  const preferences = readHiringPrefs();
  const historyMode = preferences.historyMode;
  return {
    autoExpand: preferences.autoExpand,
    filter: preferences.filter,
    matchesOnly: preferences.matchesOnly,
    historyMode,
    keepHistory: historyMode !== "off",
    historyRetentionDays: preferences.historyRetentionDays
  };
}

function queueSaveSettings() {
  updateSettingLabels();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveSettings().catch(() => setGlobalNotice(t("settings.saveFailed"), "error")); }, 120);
}

function setGlobalNotice(message, kind = "") {
  elements.globalNotice.textContent = message;
  elements.globalNotice.className = `global-notice${kind ? ` ${kind}` : ""}`;
}

// The store module owns the review-label vocabulary and the history/review caps. The popup
// used to carry its own copies of these sanitizers with a hardcoded 1000, so a label list or
// limit change could silently apply on one storage path and not the other.
const REVIEW_LABELS = new Set(store.REVIEW_LABELS);
const sanitizeHistory = store.sanitizeHistory;
const sanitizeReviewLabels = store.sanitizeReviewLabels;

async function persistReviewLabels() {
  const stored = Object.fromEntries(reviewLabels.entries());
  await chrome.storage.local.set({ hiringReviewLabels: stored });
}

function renderHistoryStatus() {
  const count = savedHistory.length;
  const mode = ["off", "session", "persistent"].includes(elements.historyMode.value) ? elements.historyMode.value : "off";
  elements.keepHistory.checked = mode !== "off";
  let message;
  if (mode !== "off") {
    message = t("history.activeStatus", {
      store: t(mode === "session" ? "history.storeSession" : "history.storePersistent"),
      count,
      days: elements.historyRetention.value
    });
  } else if (count) {
    message = t("history.previous", { count });
  } else {
    message = t("history.offStatus");
  }
  if (savedHistoryStats.error) {
    message += ` · ${t("history.unavailable")}`;
  } else {
    message += ` · ${t("history.usage", { bytes: Number(savedHistoryStats.bytes) || 0 })}`;
    const savedAt = Date.parse(savedHistoryStats.lastSuccessfulSaveAt || "");
    if (Number.isFinite(savedAt)) {
      let formatted = savedHistoryStats.lastSuccessfulSaveAt;
      try { formatted = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(savedAt)); } catch (_error) { /* ISO fallback remains readable. */ }
      message += ` · ${t("history.lastSave", { time: formatted })}`;
    } else message += ` · ${t("history.noSave")}`;
  }
  elements.historyStatus.textContent = message;
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
  elements.connectionChip.textContent = t(!connected ? "connection.offline" : !feed ? "connection.openFeed" : targetInBackground ? "connection.background" : "connection.feed");
  elements.connectionChip.className = `connection-chip${connected && feed && !targetInBackground ? " connected" : !connected ? " error" : ""}`;
  renderTargetState();
  renderButtons();
}

function renderTargetState() {
  const hasTarget = Number.isInteger(targetTabId);
  const targetIsActive = hasTarget && activeTabId === targetTabId;
  elements.targetBadge.textContent = t(!hasTarget ? "target.noFeed" : targetIsActive ? "target.active" : "target.background");
  elements.targetBadge.className = `target-badge${!hasTarget ? " error" : targetIsActive ? " active" : " background"}`;
  if (!hasTarget) {
    elements.targetDetail.textContent = t("target.detail");
  } else if (targetIsActive) {
    elements.targetDetail.textContent = t("target.selected");
  } else {
    elements.targetDetail.textContent = t("target.backgroundDetail");
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
  return shared.parseLinkedInUrl(url).isLinkedIn;
}

function isLinkedInFeedUrl(url = "") {
  return shared.parseLinkedInUrl(url).isFeed;
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
  const previousTabId = targetTabId;
  const targetChanged = previousTabId !== tabId;
  if (targetChanged) {
    stateGeneration += 1;
    detailGeneration += 1;
    targetTabId = tabId;
    targetWindowId = windowId;
    scrollStatus = null;
    hiringStatus = null;
    lastArchiveCount = null;
    archiveExported = false;
    archiveAcknowledged = false;
    elements.postDetail.hidden = true;
  } else {
    targetTabId = tabId;
    targetWindowId = windowId;
  }
  if (stopPrevious && Number.isInteger(previousTabId) && previousTabId !== tabId) {
    try { await chrome.tabs.sendMessage(previousTabId, { type: shared.MESSAGE_TYPES.HIRING.STOP }); } catch (_error) { /* Old target may have closed. */ }
    try { await chrome.tabs.sendMessage(previousTabId, { type: shared.MESSAGE_TYPES.SCROLL.STOP }); } catch (_error) { /* Old target may have closed. */ }
  }
  await writeTargetForWindow(windowId, tabId);
  if (targetTabId === tabId) renderTargetState();
  return targetTabId === tabId;
}

async function chooseActiveFeedTab(tab = null, quiet = false) {
  const current = tab || await activeTab();
  activeTabId = Number.isInteger(current?.id) ? current.id : null;
  activeTabUrl = current?.url || "";
  if (!current || !Number.isInteger(current.id) || !isLinkedInUrl(activeTabUrl)) {
    if (!quiet) setGlobalNotice(t("notice.switchFeed"));
    renderTargetState();
    return false;
  }
  try {
    const status = await chrome.tabs.sendMessage(current.id, { type: shared.MESSAGE_TYPES.SCROLL.GET_STATUS });
    if (!status?.isFeed) {
      if (!quiet) setGlobalNotice(t("notice.openFeedExact"));
      return false;
    }
    await setTargetTab(current.id, current.windowId);
    setConnection(true, true);
    if (!quiet) setGlobalNotice(t("notice.selected"), "success");
    return true;
  } catch (_error) {
    if (!quiet) setGlobalNotice(t("notice.refreshFeed"), "error");
    return false;
  }
}

async function clearTargetTab() {
  const oldWindowId = targetWindowId;
  stateGeneration += 1;
  detailGeneration += 1;
  targetTabId = null;
  targetWindowId = null;
  scrollStatus = null;
  hiringStatus = null;
  if (Number.isInteger(oldWindowId)) await writeTargetForWindow(oldWindowId, null).catch(() => {});
  elements.stateLabel.textContent = t("scroll.ready");
  elements.stateDot.className = "state-dot";
  elements.statusDetail.textContent = t("target.selectBegin");
  elements.monitorBtn.textContent = t("monitor.start");
  elements.monitorBtn.classList.remove("is-running");
  elements.monitorStatus.textContent = t("target.monitorSelect");
  elements.monitorStatus.className = "monitor-status";
  elements.domHealthStatus.textContent = t("monitor.domStopped");
  elements.domHealthStatus.className = "dom-health";
  elements.openCount.textContent = "0";
  elements.recruiterCount.textContent = "0";
  elements.possibleCount.textContent = "0";
  elements.relatedCount.textContent = "0";
  elements.tabMatchCount.textContent = "0";
  elements.processedDetail.textContent = t("target.scanSelect");
  elements.matchList.replaceChildren();
  elements.postDetail.hidden = true;
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
        const rememberedTab = await chrome.tabs.get(rememberedId);
        if (rememberedTab.windowId !== windowId || !isLinkedInFeedUrl(rememberedTab.url)) {
          throw new Error("Remembered target moved or left the feed.");
        }
        const status = await chrome.tabs.sendMessage(rememberedId, { type: shared.MESSAGE_TYPES.SCROLL.GET_STATUS });
        if (status?.isFeed) await setTargetTab(rememberedId, windowId, false);
        else await writeTargetForWindow(windowId, null);
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

async function sendToTargetTab(message, options = {}) {
  if (!Number.isInteger(targetTabId)) {
    const selected = await chooseActiveFeedTab(null, true);
    if (!selected || !Number.isInteger(targetTabId)) {
      setConnection(false, false);
      setGlobalNotice(t("notice.selectFeed"));
      return null;
    }
  }
  const requestTabId = targetTabId;
  const generation = Number.isInteger(options.generation) ? options.generation : stateGeneration;
  try {
    const response = await chrome.tabs.sendMessage(requestTabId, message);
    if (generation !== stateGeneration || requestTabId !== targetTabId) return null;
    setConnection(Boolean(response && response.supported !== false), Boolean(response && response.isFeed));
    if (response && response.isFeed === false) {
      setGlobalNotice(t("notice.leftFeed"));
    }
    return response;
  } catch (_error) {
    if (generation !== stateGeneration || requestTabId !== targetTabId) return null;
    setConnection(false, false);
    setGlobalNotice(t("notice.unavailable"), "error");
    return null;
  }
}

function renderButtons() {
  const state = scrollStatus?.state || "stopped";
  elements.start.disabled = pendingScrollCommands.has("START") || pendingScrollCommands.has("RESUME") || !available || !isFeed || state === "running";
  elements.start.textContent = state === "paused" ? t("scroll.resume") : state === "running" ? t("scroll.running") : t("scroll.start");
  elements.pause.disabled = !available || state !== "running";
  elements.stop.disabled = !available || state === "stopped";
  elements.monitorBtn.disabled = pendingMonitorCommands.size > 0 || !available || !isFeed;
  elements.autoExpand.disabled = false;
  elements.exportBtn.textContent = t(elements.exportFormat.value === "csv" ? "export.csv" : "export.json");
  const archiveCount = Number(hiringStatus?.archiveCount) || 0;
  elements.exportBtn.disabled = savedHistory.length === 0 && (!available || archiveCount === 0);
  elements.clearHistoryBtn.disabled = savedHistory.length === 0;
}

function renderScrollStatus(status) {
  if (!status) return;
  scrollStatus = status;
  setConnection(status.supported !== false, Boolean(status.isFeed));

  const state = status.state || "stopped";
  const labels = { running: t("scroll.running"), paused: t("scroll.paused"), stopped: status.reason ? t("scroll.stopped") : t("scroll.ready") };
  elements.stateLabel.textContent = labels[state] || t("scroll.ready");
  elements.stateDot.className = `state-dot ${state}`;
  elements.modeTag.textContent = t(MODE_NAMES[status.mode] || MODE_NAMES[elements.mode.value] || "mode.standard");
  const steps = Number(status.steps) || 0;
  const maxSteps = Number(status.maxSteps) || 0;
  const percent = maxSteps ? Math.min(100, (steps / maxSteps) * 100) : 0;
  elements.progressFill.style.transform = `scaleX(${percent / 100})`;
  elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));

  if (state === "running" || state === "paused") {
    elements.statusDetail.textContent = t("scroll.progressDetail", { steps, max: maxSteps, elapsed: formatDuration(status.elapsedMs) });
    const targetIsBackground = Number.isInteger(targetTabId) && Number.isInteger(activeTabId) && targetTabId !== activeTabId;
    setGlobalNotice(state === "running"
      ? t(targetIsBackground ? "scroll.background" : "scroll.active")
      : status.reason || t("scroll.pausedNotice"), state === "running" ? "success" : "");
  } else {
    elements.statusDetail.textContent = status.reason || t(status.isFeed ? "scroll.statusReady" : "notice.initial");
    setGlobalNotice(t(status.isFeed ? (status.reason ? "scroll.restart" : "scroll.choosePace") : "notice.initial"));
  }
  renderButtons();
}

function pipelineCountsFromStatus(status) {
  if (status && status.pipelineCounts && typeof status.pipelineCounts === "object") return status.pipelineCounts;
  const total = Math.max(0, Number(status && status.total) || 0);
  return { all: total, new: 0, saved: 0, applied: 0 };
}

function renderPipelineBar(counts) {
  const models = store.pipelineChips(counts, resultQuery.pipelineFilter);
  elements.pipelineChips.querySelectorAll("[data-pipeline-filter]").forEach((chip) => {
    const model = models.find((item) => item.id === chip.getAttribute("data-pipeline-filter"));
    chip.classList.toggle("is-active", Boolean(model && model.active));
    chip.setAttribute("aria-pressed", String(Boolean(model && model.active)));
    const counter = chip.querySelector("[data-pipeline-count]");
    if (counter) counter.textContent = String(model ? model.count : 0);
  });
  const delta = store.describeDelta(counts, pipelineBaselineAt);
  const total = Math.max(0, Number(counts && counts.all) || 0);
  if (!delta.hasBaseline && total > 0) elements.pipelineDelta.textContent = t("pipeline.firstRun");
  else if (delta.count > 0) elements.pipelineDelta.textContent = t("pipeline.delta", { count: delta.count });
  else elements.pipelineDelta.textContent = t("pipeline.emptyNew");
  elements.pipelineDelta.classList.toggle("is-fresh", delta.count > 0);
}

async function notifyPipeline(generation = stateGeneration) {
  const response = await sendToTargetTab({
    type: shared.MESSAGE_TYPES.HIRING.SET_PIPELINE,
    pipeline,
    baselineAt: pipelineBaselineAt,
    filter: resultQuery.pipelineFilter
  }, { generation });
  return response;
}

async function updatePipelineState(key, requested) {
  if (!key) return;
  const next = store.nextPipelineState(shared.pipelineStateOf(pipeline, key), requested);
  pipeline = shared.setPipelineState(pipeline, key, next);
  try {
    await chrome.storage.local.set({ hiringPipeline: pipeline });
  } catch (_error) {
    setGlobalNotice(t("pipeline.failed"), "error");
    return;
  }
  setGlobalNotice(t(next === "saved" ? "pipeline.savedNotice" : next === "applied" ? "pipeline.appliedNotice" : "pipeline.removedNotice"), "success");
  try {
    const response = await notifyPipeline();
    if (response && response.status) renderHiringStatus(response.status);
    else if (hiringStatus) renderHiringStatus(hiringStatus);
  } catch (_error) {
    if (hiringStatus) renderHiringStatus(hiringStatus);
  }
}

async function setPipelineFilter(filter) {
  const next = shared.PIPELINE_FILTERS.includes(filter) ? filter : "all";
  if (next === resultQuery.pipelineFilter) return;
  resultQuery.pipelineFilter = next;
  resultQuery.page = 1;
  const generation = ++stateGeneration;
  try {
    await saveHiringPrefs();
    if (generation !== stateGeneration) return;
    await notifyPipeline(generation);
    if (generation !== stateGeneration) return;
    await refreshAll();
  } catch (_error) {
    if (generation === stateGeneration) setGlobalNotice(t("settings.saveFailed"), "error");
  }
}

async function loadShortcuts() {
  const targets = {
    openPopup: elements.shortcutOpenPopup,
    toggleMonitor: elements.shortcutToggleMonitor,
    toggleScroll: elements.shortcutToggleScroll
  };
  const apply = (values) => {
    for (const [name, element] of Object.entries(targets)) {
      if (!element) continue;
      element.textContent = values[name] || "—";
    }
  };
  apply(shortcuts);
  if (!chrome.commands?.getAll) return;
  try {
    const commands = await chrome.commands.getAll();
    const next = { ...shortcuts };
    for (const command of commands) {
      if (command.name === "_execute_action") next.openPopup = command.shortcut;
      else if (command.name === "toggle-monitor") next.toggleMonitor = command.shortcut;
      else if (command.name === "toggle-scroll") next.toggleScroll = command.shortcut;
    }
    shortcuts = next;
    apply(shortcuts);
  } catch (_error) {
    // Defaults from the manifest suggestions stay visible if Chrome refuses the query.
  }
}

async function updateReviewLabel(key, label) {
  if (!key) return;
  if (REVIEW_LABELS.has(label)) {
    reviewLabels.set(key, { label, updatedAt: new Date().toISOString() });
    if (reviewLabels.size > store.REVIEW_LIMIT) {
      const oldest = Array.from(reviewLabels.entries()).sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt))[0];
      if (oldest) reviewLabels.delete(oldest[0]);
    }
  } else reviewLabels.delete(key);
  try {
    await persistReviewLabels();
    setGlobalNotice(t("review.saved"), "success");
  } catch (_error) {
    setGlobalNotice(t("review.failed"), "error");
  }
}

async function showPostDetail(id) {
  const request = ++detailGeneration;
  const generation = stateGeneration;
  elements.postDetail.hidden = false;
  elements.postDetail.textContent = t("results.detailLoading");
  const response = await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.GET_POST, id }, { generation });
  if (request !== detailGeneration || generation !== stateGeneration) return;
  if (!response?.post) {
    elements.postDetail.hidden = true;
    setGlobalNotice(t("detail.notFound"), "error");
    return;
  }
  resultsRenderer.renderDetail(elements.postDetail, response.post);
}

function renderHiringStatus(status) {
  if (!status) return;
  hiringStatus = status;
  setConnection(status.supported !== false, Boolean(status.isFeed));
  if (status.monitoring && typeof status.autoExpand === "boolean") elements.autoExpand.checked = status.autoExpand;
  if (status.monitoring && typeof status.matchesOnly === "boolean") elements.matchesOnly.checked = status.matchesOnly;

  const monitoring = Boolean(status.monitoring);
  elements.monitorBtn.textContent = t(monitoring ? "monitor.stop" : "monitor.start");
  elements.monitorBtn.classList.toggle("is-running", monitoring);
  if (monitoring && ["off", "session", "persistent"].includes(status.historyMode)) {
    elements.historyMode.value = status.historyMode;
    elements.keepHistory.checked = status.historyMode !== "off";
  }
  if (monitoring && [7, 30, 90].includes(Number(status.historyRetentionDays))) elements.historyRetention.value = String(status.historyRetentionDays);
  const duplicates = Number(status.duplicateMergedCount) || 0;
  const processedCount = Number(status.processedCount) || 0;
  elements.monitorStatus.textContent = monitoring
    ? t("monitor.running", { count: processedCount })
    : processedCount > 0 ? t("monitor.stopped", { count: processedCount }) : t("monitor.off");
  if (duplicates) elements.monitorStatus.textContent += ` · ${t("monitor.duplicates", { count: duplicates })}`;
  elements.monitorStatus.className = `monitor-status${monitoring ? " running" : ""}`;

  const domHealth = status.domHealth || {};
  const healthLevel = ["ok", "partial", "warning"].includes(domHealth.level) ? domHealth.level : "";
  const healthMessage = domHealth.message || t(monitoring ? "monitor.domChecking" : "monitor.domStopped");
  elements.domHealthStatus.textContent = `${healthMessage}${domHealth.background ? t("monitor.hidden") : ""}`;
  elements.domHealthStatus.className = `dom-health${healthLevel ? ` ${healthLevel === "ok" ? "good" : healthLevel}` : ""}`;
  renderHistoryStatus();

  const counts = status.counts || {};
  elements.openCount.textContent = String(counts.open_role || 0);
  elements.recruiterCount.textContent = String(counts.recruiter_search || 0);
  elements.possibleCount.textContent = String((counts.possible || 0) + (counts.partial || 0));
  elements.relatedCount.textContent = String((counts.job_seeker || 0) + (counts.hiring_discussion || 0) + (counts.closed || 0));
  const total = Object.values(counts).reduce((sum, count) => sum + (Number(count) || 0), 0);
  elements.tabMatchCount.textContent = total > 99 ? "99+" : String(total);
  renderPipelineBar(pipelineCountsFromStatus(status));
  elements.processedDetail.textContent = monitoring
    ? t("results.processedRunning", { checked: processedCount, archive: Number(status.archiveCount) || 0 })
    : processedCount > 0
      ? t("results.processedStopped", { count: processedCount })
      : t("results.processedInitial");
  const archiveCount = Number(status.archiveCount) || 0;
  if (archiveCount || savedHistory.length) {
    elements.exportStatus.textContent = t(savedHistory.length ? "export.availableWithHistory" : "export.availableStopped", {
      count: archiveCount, history: savedHistory.length
    });
    if (status.archiveLimitReached) elements.exportStatus.textContent += ` ${t("export.capSuffix")}`;
  } else {
    elements.exportStatus.textContent = t(monitoring ? "export.availableRunning" : "export.noneYet");
  }

  if (lastArchiveCount === null) lastArchiveCount = archiveCount;
  else if (lastArchiveCount !== archiveCount) {
    lastArchiveCount = archiveCount;
    archiveExported = false;
    archiveAcknowledged = false;
  }
  resultsRenderer.renderResults(elements.matchList, status.results, {
    reviewLabels,
    monitoring,
    pipeline,
    baselineAt: pipelineBaselineAt,
    pipelineFilter: resultQuery.pipelineFilter,
    onReview: (id, label) => void updateReviewLabel(id, label),
    onPipeline: (id, state) => void updatePipelineState(id, state),
    onDetail: (id) => void showPostDetail(id)
  });
  const page = Math.max(1, Number(status.page) || 1);
  resultQuery.page = page;
  const totalResults = Math.max(0, Number(status.total) || 0);
  const pageSize = Math.max(1, Number(status.pageSize) || resultQuery.pageSize);
  const rangeStart = totalResults ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = totalResults ? Math.min(totalResults, page * pageSize) : 0;
  elements.pageStatus.textContent = t("results.range", { page, start: rangeStart, end: rangeEnd, count: totalResults });
  elements.previousPage.disabled = page <= 1;
  elements.nextPage.disabled = !status.hasMore;
  renderButtons();
}

async function refreshScrollStatus(generation = stateGeneration, commandGeneration = null) {
  const status = await sendToTargetTab({ type: shared.MESSAGE_TYPES.SCROLL.GET_STATUS }, { generation });
  if (status && generation === stateGeneration && (commandGeneration === null || commandGeneration === scrollGeneration)) {
    renderScrollStatus(status);
  }
}

async function refreshSavedHistory(generation = stateGeneration) {
  try {
    const response = await chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.HISTORY.GET });
    if (generation !== stateGeneration) return;
    if (response?.error) {
      savedHistoryStats = { ...savedHistoryStats, error: response.error };
      renderHistoryStatus();
      return;
    }
    savedHistory = sanitizeHistory(response?.records || []);
    savedHistoryStats = {
      bytes: Number(response?.bytes) || 0,
      stores: response?.stores || {},
      lastSuccessfulSaveAt: response?.lastSuccessfulSaveAt || null,
      limitReached: response?.limitReached === true,
      error: null
    };
    renderHistoryStatus();
    if (hiringStatus && generation === stateGeneration) renderHiringStatus(hiringStatus);
  } catch (_error) {
    if (generation !== stateGeneration) return;
    savedHistoryStats = { ...savedHistoryStats, error: "storage_unavailable" };
    renderHistoryStatus();
  }
}

async function refreshHiringStatus(generation = stateGeneration) {
  const query = { ...resultQuery };
  // History was polled on the 1.3 s refresh loop too; the storage.onChanged listener and
  // the one-time init already cover history updates, so only the live status is fetched.
  const status = await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.GET_STATUS, query }, { generation });
  if (status && generation === stateGeneration) renderHiringStatus(status);
}

function refreshAll() {
  if (refreshPromise) {
    if (activeRefreshGeneration !== stateGeneration) refreshQueued = true;
    return refreshPromise;
  }
  const generation = stateGeneration;
  activeRefreshGeneration = generation;
  const operation = (async () => {
    await refreshActiveTabContext();
    if (generation !== stateGeneration) return;
    if (!Number.isInteger(targetTabId)) {
      renderButtons();
      return;
    }
    await Promise.all([refreshScrollStatus(generation), refreshHiringStatus(generation)]);
  })();
  refreshPromise = operation.catch(() => {
    if (generation === stateGeneration) setGlobalNotice(t("notice.unavailable"), "error");
  }).finally(() => {
    refreshPromise = null;
    activeRefreshGeneration = null;
    if (refreshQueued) {
      refreshQueued = false;
      void refreshAll();
    }
  });
  return refreshPromise;
}

function updateResultQuery(changes) {
  Object.assign(resultQuery, changes);
  stateGeneration += 1;
  return refreshAll();
}

async function runScrollCommand(type) {
  if (pendingScrollCommands.has(type)) return;
  pendingScrollCommands.add(type);
  renderButtons();
  const generation = stateGeneration;
  let commandGeneration = null;
  try {
    commandGeneration = ++scrollGeneration;
    if (type === shared.MESSAGE_TYPES.SCROLL.START) {
      await saveSettings();
      if (commandGeneration !== scrollGeneration || generation !== stateGeneration) return;
      setGlobalNotice(t("scroll.starting"));
    }
    const message = type === shared.MESSAGE_TYPES.SCROLL.START ? { type, settings: readSettings() } : { type };
    const response = await sendToTargetTab(message, { generation });
    if (!response || commandGeneration !== scrollGeneration || generation !== stateGeneration) return;
    if (response.error) {
      setGlobalNotice(noticeForError(response), "error");
      return;
    }
    if (response.status) renderScrollStatus(response.status);
    await refreshScrollStatus(generation, commandGeneration);
  } catch (_error) {
    if (generation === stateGeneration) setGlobalNotice(t("settings.saveFailed"), "error");
  } finally {
    pendingScrollCommands.delete(type);
    renderButtons();
  }
}

async function runMonitorCommand() {
  const isRunning = Boolean(hiringStatus?.monitoring);
  const action = isRunning ? "stop" : "start";
  if (pendingMonitorCommands.has(action)) return;
  pendingMonitorCommands.add(action);
  renderButtons();
  let generation = stateGeneration;
  try {
    const archiveCount = Number(hiringStatus?.archiveCount) || 0;
    if (!isRunning && archiveCount > 0 && !archiveExported && !archiveAcknowledged) {
      const confirmed = window.confirm(t("monitor.restartConfirm", { count: archiveCount }));
      if (!confirmed) return;
      archiveAcknowledged = true;
    }
    generation = ++stateGeneration;
    if (!isRunning) await saveHiringPrefs();
    if (generation !== stateGeneration) return;
    const response = await sendToTargetTab(isRunning
      ? { type: shared.MESSAGE_TYPES.HIRING.STOP }
      : { type: shared.MESSAGE_TYPES.HIRING.START, options: monitorOptions() }, { generation });
    if (!response || generation !== stateGeneration) return;
    if (response.error) {
      setGlobalNotice(noticeForError(response), "error");
      return;
    }
    if (response.status) renderHiringStatus(response.status);
  } catch (_error) {
    if (generation === stateGeneration) setGlobalNotice(t("settings.saveFailed"), "error");
  } finally {
    pendingMonitorCommands.delete(action);
    renderButtons();
  }
}

async function updateMonitorPreferences() {
  const generation = ++stateGeneration;
  try {
    await saveHiringPrefs();
    if (generation !== stateGeneration) return;
    renderHistoryStatus();
    if (hiringStatus?.monitoring && available && isFeed) {
      await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.SET_OPTIONS, options: monitorOptions() }, { generation });
    }
    await refreshAll();
  } catch (_error) {
    if (generation === stateGeneration) setGlobalNotice(t("settings.saveFailed"), "error");
  }
}

// One reset of every popup control to its default. Used when the stored preferences
// were corrupt (initialize fallback) and when all local data is wiped; keeping the
// list here means the two paths cannot drift apart.
function resetPopupForm() {
  elements.autoExpand.checked = true;
  elements.categoryFilter.value = "all";
  elements.matchesOnly.checked = false;
  elements.exportFormat.value = "json";
  elements.exportFilteredOnly.checked = false;
  elements.includeFullText.checked = false;
  elements.includeEmails.checked = false;
  elements.includeJobTitles.checked = true;
  elements.includePostAge.checked = true;
  elements.includePostMetadata.checked = true;
  elements.historyMode.value = "off";
  elements.keepHistory.checked = false;
  elements.historyRetention.value = "30";
  Object.assign(resultQuery, { filter: "all", search: "", sort: "relevance", page: 1, pageSize: 25 });
  elements.resultSearch.value = "";
  elements.resultSort.value = "relevance";
}

async function clearLocalHistory() {
  if (!window.confirm(t("clear.historyConfirm"))) return;
  elements.clearHistoryBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.DATA.LOCAL_DATA_CLEAR, scopes: ["history"] });
    if (response?.error) throw new Error(response.error);
    elements.historyMode.value = "off";
    elements.keepHistory.checked = false;
    hiringPrefs = { ...hiringPrefs, historyMode: "off" };
    await saveHiringPrefs();
    if (hiringStatus?.monitoring && available && isFeed) {
      const statusResponse = await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.SET_OPTIONS, options: monitorOptions() });
      if (statusResponse?.status) renderHiringStatus(statusResponse.status);
    }
    savedHistory = [];
    savedHistoryStats = { bytes: 0, stores: {}, lastSuccessfulSaveAt: null, limitReached: false, error: null };
    renderHistoryStatus();
    elements.exportStatus.textContent = t("clear.historyDetail");
    setGlobalNotice(t("clear.historyDone"), "success");
  } catch (_error) {
    setGlobalNotice(t("clear.failed"), "error");
    renderHistoryStatus();
  }
}

async function clearAllStoredData() {
  if (!window.confirm(t("clear.allConfirm"))) return;
  elements.clearAllDataBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.DATA.LOCAL_DATA_CLEAR, scopes: ["all"] });
    if (response?.error) throw new Error(response.error);
    stateGeneration += 1;
    detailGeneration += 1;
    savedHistory = [];
    savedHistoryStats = { bytes: 0, stores: {}, lastSuccessfulSaveAt: null, limitReached: false, error: null };
    reviewLabels = new Map();
    targetTabId = null;
    targetWindowId = null;
    scrollStatus = null;
    hiringStatus = null;
    hiringPrefs = { ...DEFAULT_HIRING_PREFS, historyMode: "off" };
    applySettings(DEFAULT_SETTINGS);
    resetPopupForm();
    renderTargetState();
    renderHiringStatus({ supported: false, isFeed: false, monitoring: false, counts: {}, processedCount: 0, archiveCount: 0 });
    applyInterfaceStrings();
    elements.exportStatus.textContent = t("clear.allDone");
    setGlobalNotice(t("clear.allDone"), "success");
  } catch (_error) {
    setGlobalNotice(t("clear.failed"), "error");
  } finally {
    renderButtons();
  }
}

async function exportHiringPosts() {
  elements.exportBtn.disabled = true;
  const format = ["csv", "html", "markdown"].includes(elements.exportFormat.value) ? elements.exportFormat.value : "json";
  const generation = stateGeneration;
  elements.exportStatus.textContent = t("export.preparing", { format: format.toUpperCase() });
  try {
    await saveHiringPrefs();
    if (generation !== stateGeneration) return;
    let currentRun = null;
    if (available && isFeed) currentRun = await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.EXPORT_POSTS }, { generation });
    if (generation !== stateGeneration) return;
    const historyResponse = await chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.HISTORY.GET });
    if (generation !== stateGeneration) return;
    if (historyResponse?.error) throw new Error(historyResponse.error);
    savedHistory = sanitizeHistory(historyResponse?.records || []);
    renderHistoryStatus();

    const preferences = readHiringPrefs();
    const selectedCategory = preferences.exportFilteredOnly ? preferences.filter : "all";
    const posts = preferences.exportCurrentPageOnly
      ? (currentRun?.posts || []).map((post) => ({ ...post }))
      : exporter.mergeExportSources(
        { posts: currentRun?.posts || [] },
        { records: savedHistory },
        { reviewLabels: Object.fromEntries(reviewLabels.entries()) }
      );
    const totalAvailable = posts.length;
    const exportOptions = {
      preferences,
      locale: i18n.locale,
      scope: selectedCategory !== "all"
        ? `Posts from the selected category: ${selectedCategory}.`
        : "All detected posts available from the current run and local history.",
      provenance: currentRun?.provenance || null,
      domHealthSnapshot: currentRun?.domHealthSnapshot || null,
      monitorRun: currentRun?.monitorRun || null,
      extractionNotes: currentRun?.extractionNotes || null
    };
    const payload = exporter.buildJsonPayload(posts, exportOptions);
    if (!payload.posts.length) {
      elements.exportStatus.textContent = t(totalAvailable ? "export.emptyCategory" : "export.empty");
      return;
    }

    // CSV and JSON describe the same run: reuse the payload's id and timestamp instead of
    // generating a second, unrelated run identity.
    const csvOptions = {
      ...exportOptions,
      exportRunId: payload.exportRunId,
      now: () => payload.exportedAt
    };
    const blob = format === "csv"
      ? new Blob([exporter.buildCsv(posts, csvOptions)], { type: "text/csv;charset=utf-8" })
      : format === "html"
        ? new Blob([exporter.buildHtml(posts, csvOptions)], { type: "text/html;charset=utf-8" })
        : format === "markdown"
          ? new Blob([exporter.buildMarkdown(posts, csvOptions)], { type: "text/markdown;charset=utf-8" })
          : new Blob([JSON.stringify(payload, null, preferences.compactJson ? 0 : 2)], { type: "application/json;charset=utf-8" });
    const extension = format === "markdown" ? "md" : format;
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/u, "Z");
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `linkedin-hiring-posts-${timestamp}.${extension}`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    archiveExported = true;

    elements.exportStatus.textContent = t("export.success", { count: payload.posts.length, format: format.toUpperCase() });
    setGlobalNotice(t("export.success", { count: payload.posts.length, format: format.toUpperCase() }), "success");
  } catch (_error) {
    elements.exportStatus.textContent = t("export.failed", { format: format.toUpperCase() });
  } finally {
    renderButtons();
  }
}

async function downloadLocalDiagnostic() {
  elements.diagnosticBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.DATA.GET_DIAGNOSTICS });
    if (response?.error) throw new Error(response.error);
    const status = hiringStatus || {};
    const browserVersion = String(globalThis.navigator?.userAgent || "").match(/Chrome\/([0-9.]+)/)?.[1] || "unknown";
    exporter.downloadDiagnostic({
      ...(response.diagnostic || {}),
      extensionVersion: chrome.runtime.getManifest().version,
      browserVersion,
      messageSchemaVersion: shared.MESSAGE_SCHEMA_VERSION,
      selectorHealth: status.domHealth || {},
      timings: Object.fromEntries(Object.entries(status.scan || {}).filter(([key]) => key.endsWith("Ms"))),
      counts: {
        ...(status.scan || {}),
        processedCount: Number(status.processedCount) || 0,
        archiveCount: Number(status.archiveCount) || 0,
        duplicateMergedCount: Number(status.duplicateMergedCount) || 0,
        savedHistoryCount: savedHistory.length
      }
    });
    elements.exportStatus.textContent = t("diagnostic.success");
    setGlobalNotice(t("diagnostic.success"), "success");
  } catch (_error) {
    setGlobalNotice(t("diagnostic.failed"), "error");
  } finally {
    elements.diagnosticBtn.disabled = false;
    renderButtons();
  }
}

let lastTabView = "scroll";
let settingsOpen = false;

function syncSettingsToggle() {
  const key = settingsOpen ? "settings.close" : "settings.open";
  elements.settingsToggle.setAttribute("data-i18n-aria-label", key);
  elements.settingsToggle.setAttribute("data-i18n-title", key);
  elements.settingsToggle.setAttribute("aria-label", t(key));
  elements.settingsToggle.setAttribute("title", t(key));
}

/**
 * Source of truth for the visible panel. "scroll" and "hiring" are the two tabs;
 * "settings" replaces both panels and is opened from the header gear, so the
 * tablist keeps its selected tab while nothing in it looks active.
 */
function switchView(name, focus = false) {
  const wantsSettings = name === "settings";
  if (!wantsSettings) lastTabView = name === "hiring" ? "hiring" : "scroll";
  settingsOpen = wantsSettings;

  const tabs = { scroll: elements.scrollTab, hiring: elements.hiringTab };
  const views = { scroll: elements.scrollView, hiring: elements.hiringView };
  for (const key of ["scroll", "hiring"]) {
    const selected = key === lastTabView;
    const visible = selected && !settingsOpen;
    tabs[key].classList.toggle("active", visible);
    tabs[key].setAttribute("aria-selected", String(selected));
    tabs[key].tabIndex = selected ? 0 : -1;
    views[key].classList.toggle("active", visible);
    views[key].hidden = !visible;
  }

  elements.settingsView.classList.toggle("active", settingsOpen);
  elements.settingsView.hidden = !settingsOpen;
  elements.settingsToggle.classList.toggle("active", settingsOpen);
  elements.settingsToggle.setAttribute("aria-expanded", String(settingsOpen));
  syncSettingsToggle();

  if (focus) (settingsOpen ? elements.settingsToggle : tabs[lastTabView]).focus();
  if (!settingsOpen && lastTabView === "hiring") void refreshAll();
}

function toggleSettings(force) {
  const open = typeof force === "boolean" ? force : !settingsOpen;
  if (open === settingsOpen) return;
  switchView(open ? "settings" : lastTabView, true);
}

function handleTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [elements.scrollTab, elements.hiringTab];
  const names = ["scroll", "hiring"];
  const current = tabs.indexOf(document.activeElement);
  let index = current < 0 ? 0 : current;
  if (event.key === "Home") index = 0;
  else if (event.key === "End") index = tabs.length - 1;
  else if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
  else index = (index - 1 + tabs.length) % tabs.length;
  switchView(names[index], true);
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get({
      settings: DEFAULT_SETTINGS,
      hiringPreferences: DEFAULT_HIRING_PREFS,
      hiringPostHistory: [],
      hiringReviewLabels: {},
      hiringPipeline: {},
      hiringLastRunAt: null,
      adaptivePacingMigration: 0
    });
    const initialSettings = sanitizeSettings(stored.settings || DEFAULT_SETTINGS);
    if (Number(stored.adaptivePacingMigration) < 2) {
      await chrome.storage.local.set({ settings: initialSettings, adaptivePacingMigration: 2 });
    }
    applySettings(initialSettings);
    hiringPrefs = { ...DEFAULT_HIRING_PREFS, ...(stored.hiringPreferences || {}) };
    if (!FILTERS.includes(hiringPrefs.filter)) hiringPrefs.filter = "all";
    if (!shared.PIPELINE_FILTERS.includes(hiringPrefs.pipelineFilter)) hiringPrefs.pipelineFilter = "all";
    if (!["json", "csv", "html", "markdown"].includes(hiringPrefs.exportFormat)) hiringPrefs.exportFormat = "json";
    hiringPrefs.onboardingSeen = hiringPrefs.onboardingSeen === true;
    if (![7, 30, 90].includes(Number(hiringPrefs.historyRetentionDays))) hiringPrefs.historyRetentionDays = 30;
    if (!["off", "session", "persistent"].includes(hiringPrefs.historyMode)) {
      hiringPrefs.historyMode = hiringPrefs.keepHistory ? "persistent" : "off";
    }
    hiringPrefs.keepHistory = hiringPrefs.historyMode !== "off";
    for (const key of ["includeFullText", "includeEmails", "includeJobTitles", "includePostAge", "includeMetrics", "includePostMetadata"]) {
      hiringPrefs[key] = hiringPrefs[key] !== false;
    }
    // Schema 2 stored the age toggle as `includeMetrics`; honour that stored choice when
    // `includePostAge` itself was never written, so an off setting is not silently re-onned.
    if (stored.hiringPreferences?.includePostAge === undefined) {
      hiringPrefs.includePostAge = stored.hiringPreferences?.includeMetrics !== false;
    }
    elements.autoExpand.checked = hiringPrefs.autoExpand !== false;
    elements.categoryFilter.value = hiringPrefs.filter;
    resultQuery.filter = hiringPrefs.filter;
    resultQuery.pipelineFilter = hiringPrefs.pipelineFilter;
    elements.resultSearch.value = resultQuery.search;
    elements.resultSort.value = resultQuery.sort;
    elements.matchesOnly.checked = Boolean(hiringPrefs.matchesOnly);
    elements.exportFormat.value = hiringPrefs.exportFormat;
    elements.exportFilteredOnly.checked = Boolean(hiringPrefs.exportFilteredOnly);
    elements.includeFullText.checked = hiringPrefs.includeFullText;
    elements.includeEmails.checked = hiringPrefs.includeEmails;
    elements.includeJobTitles.checked = hiringPrefs.includeJobTitles;
    elements.includePostAge.checked = hiringPrefs.includePostAge;
    elements.includePostMetadata.checked = hiringPrefs.includePostMetadata;
    elements.historyMode.value = hiringPrefs.historyMode;
    elements.keepHistory.checked = hiringPrefs.historyMode !== "off";
    elements.historyRetention.value = String(hiringPrefs.historyRetentionDays);
    savedHistory = sanitizeHistory(stored.hiringPostHistory);
    reviewLabels = sanitizeReviewLabels(stored.hiringReviewLabels);
    pipeline = shared.sanitizePipeline(stored.hiringPipeline);
    pipelineBaselineAt = Number.isFinite(Date.parse(stored.hiringLastRunAt || "")) ? stored.hiringLastRunAt : null;
  } catch (_error) {
    applySettings(DEFAULT_SETTINGS);
    hiringPrefs = { ...DEFAULT_HIRING_PREFS };
    savedHistory = [];
    savedHistoryStats = { bytes: 0, stores: {}, lastSuccessfulSaveAt: null, limitReached: false, error: null };
    reviewLabels = new Map();
    pipeline = {};
    pipelineBaselineAt = null;
    resetPopupForm();
  }
  await loadShortcuts();
  applyInterfaceStrings();
  await refreshSavedHistory();

  elements.mode.addEventListener("change", () => { applySafetyModeConstraints(); queueSaveSettings(); });
  [elements.maxMinutes, elements.maxSteps, elements.pauseOnInput]
    .forEach((element) => element.addEventListener("change", queueSaveSettings));

  elements.start.addEventListener("click", () => void runScrollCommand(scrollStatus?.state === "paused" ? "RESUME" : "START"));
  elements.pause.addEventListener("click", () => void runScrollCommand("PAUSE"));
  elements.stop.addEventListener("click", () => void runScrollCommand("STOP"));
  elements.monitorBtn.addEventListener("click", () => void runMonitorCommand());
  elements.exportBtn.addEventListener("click", () => void exportHiringPosts());
  elements.pipelineChips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-pipeline-filter]");
    if (chip) void setPipelineFilter(chip.getAttribute("data-pipeline-filter"));
  });
  elements.shortcutsBtn.addEventListener("click", () => {
    void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
      .catch(() => setGlobalNotice(t("notice.unavailable"), "error"));
  });
  elements.onboardingDismiss.addEventListener("click", () => {
    hiringPrefs.onboardingSeen = true;
    elements.onboarding.hidden = true;
    void saveHiringPrefs().catch(() => setGlobalNotice(t("settings.saveFailed"), "error"));
  });
  elements.scrollTab.addEventListener("click", () => switchView("scroll"));
  elements.hiringTab.addEventListener("click", () => switchView("hiring"));
  elements.settingsToggle.addEventListener("click", () => toggleSettings());
  elements.settingsDoneBtn.addEventListener("click", () => toggleSettings(false));
  elements.settingsView.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      toggleSettings(false);
    }
  });
  elements.scrollTab.addEventListener("keydown", handleTabKeydown);
  elements.hiringTab.addEventListener("keydown", handleTabKeydown);
  document.querySelectorAll("[data-view-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-view-jump");
      if (target === "settings") toggleSettings(true);
      else switchView(target || "scroll", true);
    });
  });
  elements.useActiveFeedBtn.addEventListener("click", () => {
    void (async () => {
      if (await chooseActiveFeedTab()) await refreshAll();
    })().catch(() => setGlobalNotice(t("notice.unavailable"), "error"));
  });
  elements.returnToFeedBtn.addEventListener("click", async () => {
    if (!Number.isInteger(targetTabId)) return;
    const requestedTabId = targetTabId;
    try {
      const tab = await chrome.tabs.get(requestedTabId);
      if (targetTabId !== requestedTabId) return;
      if (!isLinkedInFeedUrl(tab.url)) throw new Error("Target left the feed");
      const previousWindowId = targetWindowId;
      targetWindowId = tab.windowId;
      if (previousWindowId !== tab.windowId) {
        await writeTargetForWindow(previousWindowId, null);
        if (targetTabId !== requestedTabId) return;
        await writeTargetForWindow(tab.windowId, requestedTabId);
      }
      if (targetTabId !== requestedTabId) return;
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(requestedTabId, { active: true });
      setGlobalNotice(t("notice.returned"), "success");
    } catch (_error) {
      await clearTargetTab();
      setGlobalNotice(t("notice.closedChoose"), "error");
    }
  });
  chrome.tabs.onActivated?.addListener(() => { void refreshAll(); });
  chrome.tabs.onRemoved?.addListener((tabId) => {
    if (tabId === targetTabId) {
      void clearTargetTab();
      setGlobalNotice(t("notice.closed"));
    }
  });
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (tabId === targetTabId && changeInfo?.url && !isLinkedInFeedUrl(changeInfo.url)) {
      void clearTargetTab();
      setGlobalNotice(t("notice.leftFeed"));
    }
  });

  elements.autoExpand.addEventListener("change", () => void updateMonitorPreferences());
  elements.categoryFilter.addEventListener("change", async () => {
    resultQuery.filter = FILTERS.includes(elements.categoryFilter.value) ? elements.categoryFilter.value : "all";
    resultQuery.page = 1;
    const generation = ++stateGeneration;
    try {
      await saveHiringPrefs();
      if (generation !== stateGeneration) return;
      if (hiringStatus?.monitoring && available && isFeed) {
        await sendToTargetTab({ type: shared.MESSAGE_TYPES.HIRING.SET_FILTER, filter: resultQuery.filter, matchesOnly: elements.matchesOnly.checked }, { generation });
      }
      await refreshAll();
    } catch (_error) {
      if (generation === stateGeneration) setGlobalNotice(t("settings.saveFailed"), "error");
    }
  });
  elements.resultSearch.addEventListener("input", () => {
    void updateResultQuery({ search: elements.resultSearch.value, page: 1 });
  });
  elements.resultSort.addEventListener("change", () => {
    void updateResultQuery({ sort: RESULT_SORTS.includes(elements.resultSort.value) ? elements.resultSort.value : "relevance", page: 1 });
  });
  elements.previousPage.addEventListener("click", () => {
    void updateResultQuery({ page: Math.max(1, resultQuery.page - 1) });
  });
  elements.nextPage.addEventListener("click", () => {
    void updateResultQuery({ page: resultQuery.page + 1 });
  });
  elements.matchesOnly.addEventListener("change", () => void updateMonitorPreferences());

  [elements.exportFormat, elements.exportFilteredOnly, elements.exportCurrentPageOnly, elements.compactJson,
    elements.includeFullText, elements.includeEmails,
    elements.includeJobTitles, elements.includePostAge, elements.includeMetrics, elements.includePostMetadata]
    .forEach((element) => element.addEventListener("change", async () => {
      try {
        await saveHiringPrefs();
        renderButtons();
      } catch (_error) {
        setGlobalNotice(t("settings.saveFailed"), "error");
      }
    }));
  elements.historyMode.addEventListener("change", () => {
    elements.keepHistory.checked = elements.historyMode.value !== "off";
    void updateMonitorPreferences();
  });
  elements.historyRetention.addEventListener("change", () => void updateMonitorPreferences());
  elements.clearHistoryBtn.addEventListener("click", () => void clearLocalHistory());
  elements.clearAllDataBtn.addEventListener("click", () => void clearAllStoredData());
  elements.diagnosticBtn.addEventListener("click", () => void downloadLocalDiagnostic());

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!["local", "session"].includes(areaName)) return;
    if (changes.hiringPostHistory || changes.hiringSessionPostHistory) {
      void refreshSavedHistory();
    }
    if (areaName === "local" && changes.hiringReviewLabels) {
      reviewLabels = sanitizeReviewLabels(changes.hiringReviewLabels.newValue);
      if (hiringStatus) renderHiringStatus(hiringStatus);
    }
    if (areaName === "local" && changes.hiringPipeline) {
      pipeline = shared.sanitizePipeline(changes.hiringPipeline.newValue);
      if (hiringStatus) renderHiringStatus(hiringStatus);
    }
    if (areaName === "local" && changes.hiringLastRunAt) {
      pipelineBaselineAt = Number.isFinite(Date.parse(changes.hiringLastRunAt.newValue || "")) ? changes.hiringLastRunAt.newValue : null;
      if (hiringStatus) renderHiringStatus(hiringStatus);
    }
  });

  await initializeTarget();
  await refreshAll();
  refreshTimer = setInterval(() => void refreshAll(), 1300);
}

  // `unload` is unreliable; `pagehide` still fires while the popup's timers exist.
  window.addEventListener("pagehide", () => {
    if (refreshTimer) clearInterval(refreshTimer);
    if (saveTimer) clearTimeout(saveTimer);
  });

const popupApi = {
  refreshAll,
  refreshHiringStatus,
  runMonitorCommand,
  runScrollCommand,
  setTargetTab,
  isLinkedInFeedUrl,
  getTargetState: () => ({
    targetTabId,
    targetWindowId,
    activeTabId,
    stateGeneration,
    query: { ...resultQuery }
  })
};
globalThis.__LI_FEED_POPUP__ = popupApi;
if (typeof module !== "undefined" && module.exports) module.exports = popupApi;

void initialize().catch(() => {
  setGlobalNotice(t("notice.unavailable"), "error");
  renderButtons();
});
