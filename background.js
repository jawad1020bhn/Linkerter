"use strict";

if (!globalThis.__LI_FEED_SHARED__ && typeof importScripts === "function") {
  importScripts("linkedin-shared.js");
}

const HISTORY_KEYS = Object.freeze({
  persistent: "hiringPostHistory",
  session: "hiringSessionPostHistory",
  settings: "hiringSettings",
  preferences: "hiringPreferences"
});
const HISTORY_METADATA_KEY = "hiringHistoryMetadata";
const HISTORY_MESSAGE_TYPES = new Set([
  "HISTORY_GET", "HISTORY_APPEND", "HISTORY_CLEAR", "HISTORY_STATUS", "HISTORY_SET_MODE",
  "HISTORY_DELTA", "HISTORY_FLUSH", "LOCAL_DATA_CLEAR", "GET_DIAGNOSTICS"
]);

function historyError(error) {
  const quota = /quota|too large|bytes/i.test(String(error && error.message || error));
  return {
    ok: false,
    error: quota ? "quota_exceeded" : "storage_unavailable",
    message: quota ? "Browser storage quota was exceeded." : "Browser storage operation failed."
  };
}

function normalizeHistoryRecord(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const shared = globalThis.__LI_FEED_SHARED__;
  const { historyStore: _historyStore, historyStores: _historyStores, ...source } = value;
  const fullText = String(source.fullText ?? source.text ?? source.snippet ?? "");
  const author = source.author && typeof source.author === "object" && !Array.isArray(source.author)
    ? { ...source.author }
    : { name: typeof source.author === "string" ? source.author : "" };
  if (author.profileUrl) author.profileUrl = shared.canonicalizeLinkedInUrl(author.profileUrl, "profile") || "";
  const id = shared.canonicalPostId({ ...source, author, fullText });
  if (!id || id === "text:|" || id === "text:") return null;
  const parsedLastSeen = Date.parse(source.lastSeenAt || source.observedAt);
  const lastSeenAt = Number.isFinite(parsedLastSeen) && parsedLastSeen <= now() + 300000
    ? new Date(parsedLastSeen).toISOString()
    : new Date(now()).toISOString();
  const parsedFirstSeen = Date.parse(source.firstSeenAt);
  const firstSeenAt = Number.isFinite(parsedFirstSeen) && parsedFirstSeen <= now() + 300000
    ? new Date(parsedFirstSeen).toISOString()
    : lastSeenAt;
  const contentComplete = source.contentComplete !== false && fullText.length > 0;
  return {
    ...source,
    id,
    permalink: shared.canonicalizeLinkedInUrl(source.permalink || source.url || "", "permalink") || "",
    author,
    fullText,
    emails: Array.isArray(source.emails) ? [...new Set(source.emails.filter((item) => typeof item === "string"))] : [],
    firstSeenAt,
    lastSeenAt,
    contentComplete,
    extractionStatus: typeof source.extractionStatus === "string"
      ? source.extractionStatus
      : contentComplete ? "complete" : "partial"
  };
}

function createHistoryCoordinator({ chromeApi = globalThis.chrome, now = () => Date.now() } = {}) {
  if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local || !chromeApi.storage.session) {
    throw new Error("Chrome local and session storage are required.");
  }
  const { local, session } = chromeApi.storage;
  const deltaQueues = new Map();
  const diagnosticState = { operations: {}, errors: {} };
  let queue = Promise.resolve();

  async function loadState() {
    const [localData, sessionData] = await Promise.all([
      local.get([HISTORY_KEYS.persistent, HISTORY_KEYS.settings, HISTORY_KEYS.preferences, "keepHistory", HISTORY_METADATA_KEY]),
      session.get([HISTORY_KEYS.session, HISTORY_METADATA_KEY])
    ]);
    const rawPreferences = localData[HISTORY_KEYS.preferences] || {};
    const rawSettings = localData[HISTORY_KEYS.settings] || {};
    const settings = globalThis.__LI_FEED_SHARED__.sanitizeSettings(rawSettings);
    const legacyKeepHistory = typeof rawSettings.keepHistory === "boolean"
      ? rawSettings.keepHistory
      : typeof localData.keepHistory === "boolean" ? localData.keepHistory : undefined;
    const rawMode = rawPreferences.historyMode;
    const validMode = ["off", "session", "persistent"].includes(rawMode);
    const shouldMigrate = !validMode && (legacyKeepHistory !== undefined || Object.keys(rawPreferences).length > 0);
    let preferences = globalThis.__LI_FEED_SHARED__.sanitizeHiringPreferences({
      ...rawPreferences,
      ...(validMode ? {} : legacyKeepHistory !== undefined ? { keepHistory: legacyKeepHistory } : {})
    });
    if (!validMode && legacyKeepHistory === undefined && !Object.keys(rawPreferences).length) preferences.historyMode = "off";
    if (shouldMigrate) await local.set({ [HISTORY_KEYS.preferences]: preferences });
    const lastSuccessfulSaveAt = (data) => {
      const value = data[HISTORY_METADATA_KEY]?.lastSuccessfulSaveAt;
      return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
    };
    return {
      mode: preferences.historyMode,
      settings,
      preferences,
      records: {
        persistent: Array.isArray(localData[HISTORY_KEYS.persistent]) ? localData[HISTORY_KEYS.persistent] : [],
        session: Array.isArray(sessionData[HISTORY_KEYS.session]) ? sessionData[HISTORY_KEYS.session] : []
      },
      metadata: {
        persistent: lastSuccessfulSaveAt(localData),
        session: lastSuccessfulSaveAt(sessionData)
      }
    };
  }

  async function pruneState(state) {
    if (state.mode === "off") return;
    for (const store of ["persistent", "session"]) {
      const before = state.records[store];
      const result = globalThis.__LI_FEED_SHARED__.pruneHistory(before, {
        enabled: state.mode === store,
        retentionDays: state.preferences.historyRetentionDays,
        now: now()
      });
      if (JSON.stringify(before) !== JSON.stringify(result.records)) {
        const area = store === "persistent" ? local : session;
        await area.set({ [HISTORY_KEYS[store]]: result.records });
      }
      state.records[store] = result.records;
    }
  }

  async function preparedState() {
    const state = await loadState();
    await pruneState(state);
    return state;
  }

  function statusFromState(state, includeRecords = false) {
    const stores = {};
    const merged = new Map();
    for (const store of ["persistent", "session"]) {
      const records = state.records[store];
      stores[store] = {
        count: records.length,
        bytes: globalThis.__LI_FEED_SHARED__.utf8ByteLength(JSON.stringify(records)),
        lastSuccessfulSaveAt: state.metadata?.[store] || null
      };
      for (const record of records) {
        if (!record || typeof record.id !== "string") continue;
        const existing = merged.get(record.id);
        if (existing) {
          existing.record = globalThis.__LI_FEED_SHARED__.mergePostRecords(existing.record, record);
          existing.stores.add(store);
        } else merged.set(record.id, { record: { ...record }, stores: new Set([store]) });
      }
    }
    const records = [...merged.values()].map(({ record, stores: provenance }) => {
      const historyStores = [...provenance].sort();
      return { ...record, historyStore: historyStores.length === 1 ? historyStores[0] : "combined", historyStores };
    }).sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)) || a.id.localeCompare(b.id));
    const bytes = stores.persistent.bytes + stores.session.bytes;
    const lastSuccessfulSaveAt = Object.values(stores).map((item) => item.lastSuccessfulSaveAt).filter(Boolean).sort().at(-1) || null;
    const response = {
      ok: true,
      mode: state.mode,
      store: "combined",
      count: records.length,
      bytes,
      lastSuccessfulSaveAt,
      stores,
      limitReached: Object.values(stores).some((item) => item.count >= 500 || item.bytes >= 3_000_000)
    };
    if (includeRecords) response.records = records;
    return response;
  }

  async function getOperation() {
    return statusFromState(await preparedState(), true);
  }

  async function statusOperation() {
    return statusFromState(await preparedState(), false);
  }

  async function appendOperation(message) {
    const state = await preparedState();
    const input = Array.isArray(message.records) ? message.records : [];
    if (state.mode === "off") {
      return { ok: false, error: "history_disabled", store: "off", accepted: 0, rejected: input.length };
    }
    const store = state.mode;
    const area = store === "persistent" ? local : session;
    const byId = new Map(state.records[store].map((item) => [item.id, item]));
    const validIds = [];
    let invalid = 0;
    for (const value of input) {
      const record = normalizeHistoryRecord(value, now);
      if (!record) { invalid += 1; continue; }
      validIds.push(record.id);
      byId.set(record.id, byId.has(record.id)
        ? globalThis.__LI_FEED_SHARED__.mergePostRecords(byId.get(record.id), record)
        : record);
    }
    const unpruned = [...byId.values()];
    const result = globalThis.__LI_FEED_SHARED__.pruneHistory(unpruned, {
      enabled: true,
      retentionDays: state.preferences.historyRetentionDays,
      now: now()
    });
    const records = result.records;
    const retained = new Set(records.map((item) => item.id));
    const accepted = validIds.filter((id) => retained.has(id)).length;
    const rejected = input.length - accepted;
    const limitReached = records.length < unpruned.length &&
      (unpruned.length > 500 || globalThis.__LI_FEED_SHARED__.utf8ByteLength(JSON.stringify(unpruned)) > 3_000_000);
    const lastSuccessfulSaveAt = new Date(now()).toISOString();
    await area.set({
      [HISTORY_KEYS[store]]: records,
      [HISTORY_METADATA_KEY]: { lastSuccessfulSaveAt }
    });
    return {
      ok: true,
      store,
      lastSuccessfulSaveAt,
      accepted,
      rejected,
      count: records.length,
      bytes: globalThis.__LI_FEED_SHARED__.utf8ByteLength(JSON.stringify(records)),
      limitReached,
      ...(rejected ? { error: limitReached ? "history_limit" : "invalid_data" } : {})
    };
  }

  function deltaOperation(message) {
    const monitorId = String(message.monitorId || "default");
    const pending = deltaQueues.get(monitorId) || new Map();
    const input = Array.isArray(message.records) ? message.records : [];
    let accepted = 0;
    for (const value of input) {
      const record = normalizeHistoryRecord(value, now);
      if (!record) continue;
      accepted += 1;
      pending.set(record.id, pending.has(record.id)
        ? globalThis.__LI_FEED_SHARED__.mergePostRecords(pending.get(record.id), record)
        : record);
    }
    const unbounded = [...pending.values()];
    const result = globalThis.__LI_FEED_SHARED__.pruneHistory(unbounded, { enabled: false, now: now() });
    deltaQueues.set(monitorId, new Map(result.records.map((record) => [record.id, record])));
    return {
      ok: true,
      monitorId,
      accepted,
      rejected: input.length - accepted,
      queued: result.records.length,
      limitReached: result.records.length < unbounded.length
    };
  }

  async function flushDeltaOperation(message) {
    const monitorId = String(message.monitorId || "default");
    const pending = deltaQueues.get(monitorId);
    if (!pending || !pending.size) return { ok: true, monitorId, flushed: 0, accepted: 0, rejected: 0 };
    const records = [...pending.values()];
    deltaQueues.delete(monitorId);
    const response = await appendOperation({ records });
    if (!response.ok) {
      const remaining = deltaQueues.get(monitorId) || new Map();
      for (const record of records) remaining.set(record.id, remaining.has(record.id)
        ? globalThis.__LI_FEED_SHARED__.mergePostRecords(record, remaining.get(record.id))
        : record);
      deltaQueues.set(monitorId, remaining);
      return { ...response, monitorId, flushed: 0 };
    }
    return { ...response, monitorId, flushed: response.accepted };
  }

  async function setModeOperation(message) {
    if (!["off", "session", "persistent"].includes(message.mode)) {
      return { ok: false, error: "invalid_data" };
    }
    const state = await loadState();
    const previousMode = state.mode;
    const preferences = { ...state.preferences, historyMode: message.mode };
    await local.set({ [HISTORY_KEYS.preferences]: preferences });
    return { ok: true, mode: message.mode, previousMode };
  }

  async function clearOperation(message) {
    const scope = message.scope || "all";
    if (!["session", "persistent", "all"].includes(scope)) return { ok: false, error: "invalid_data" };
    await setModeOperation({ mode: "off" });
    deltaQueues.clear();
    if (scope === "session" || scope === "all") await session.remove([HISTORY_KEYS.session, HISTORY_METADATA_KEY]);
    if (scope === "persistent" || scope === "all") await local.remove([HISTORY_KEYS.persistent, HISTORY_METADATA_KEY]);
    return { ...(await statusOperation()), cleared: scope };
  }

  async function localDataClearOperation(message) {
    const scopes = Array.isArray(message.scopes) && message.scopes.length ? message.scopes : ["history"];
    if (scopes.includes("all") || scopes.includes("diagnostics")) {
      for (const key of Object.keys(diagnosticState.operations)) delete diagnosticState.operations[key];
      for (const key of Object.keys(diagnosticState.errors)) delete diagnosticState.errors[key];
    }
    if (scopes.some((scope) => ["all", "history", "session", "persistent"].includes(scope))) {
      await setModeOperation({ mode: "off" });
      deltaQueues.clear();
    }
    if (scopes.includes("all")) {
      await local.clear();
      await session.clear();
      return { ok: true, cleared: ["all"] };
    }
    const localKeys = new Set();
    const sessionKeys = new Set();
    for (const scope of scopes) {
      if (scope === "history" || scope === "persistent") {
        localKeys.add(HISTORY_KEYS.persistent);
        localKeys.add(HISTORY_METADATA_KEY);
      }
      if (scope === "history" || scope === "session") {
        sessionKeys.add(HISTORY_KEYS.session);
        sessionKeys.add(HISTORY_METADATA_KEY);
      }
      if (scope === "settings") { localKeys.add(HISTORY_KEYS.settings); localKeys.add("keepHistory"); }
      if (scope === "preferences") localKeys.add(HISTORY_KEYS.preferences);
      if (scope === "diagnostics") { localKeys.add("hiringDiagnostics"); sessionKeys.add("hiringDiagnostics"); }
    }
    if (localKeys.size) await local.remove([...localKeys]);
    if (sessionKeys.size) await session.remove([...sessionKeys]);
    return { ok: true, cleared: scopes };
  }

  function diagnosticOperation() {
    return {
      ok: true,
      diagnostic: {
        operations: { ...diagnosticState.operations },
        errors: Object.entries(diagnosticState.errors).map(([code, count]) => ({ code, count }))
      }
    };
  }

  async function dispatch(message) {
    switch (message.type) {
      case "HISTORY_GET": return getOperation();
      case "HISTORY_STATUS": return statusOperation();
      case "HISTORY_APPEND": return appendOperation(message);
      case "HISTORY_DELTA": return deltaOperation(message);
      case "HISTORY_FLUSH": return flushDeltaOperation(message);
      case "HISTORY_SET_MODE": return setModeOperation(message);
      case "HISTORY_CLEAR": return clearOperation(message);
      case "LOCAL_DATA_CLEAR": return localDataClearOperation(message);
      case "GET_DIAGNOSTICS": return diagnosticOperation();
      default: return { ok: false, error: "not_found" };
    }
  }

  function handle(message) {
    const operation = queue.then(async () => {
      const type = message && typeof message === "object" ? message.type : "unknown";
      const key = String(type || "unknown").toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      diagnosticState.operations[key] = (diagnosticState.operations[key] || 0) + 1;
      const response = await dispatch(message && typeof message === "object" ? message : {});
      if (response?.error) diagnosticState.errors[response.error] = (diagnosticState.errors[response.error] || 0) + 1;
      return response;
    });
    queue = operation.catch(() => {});
    return operation.catch((error) => {
      const response = historyError(error);
      diagnosticState.errors[response.error] = (diagnosticState.errors[response.error] || 0) + 1;
      return response;
    });
  }

  function register() {
    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !HISTORY_MESSAGE_TYPES.has(message.type)) return false;
      handle(message).then(sendResponse);
      return true;
    });
  }

  return { handle, register };
}

/*
 * Development-only auto-reload.
 *
 * An unpacked extension is never updated by Chrome and Chrome does not watch the
 * folder it was loaded from. `scripts/dev-auto-update.mjs` fast-forwards this
 * checkout and writes `dev-autoreload.json`; this hook notices the new commit,
 * stores it, reloads the extension, and (on the next worker start) reloads the
 * LinkedIn tabs so the new content scripts are injected.
 *
 * It is inert unless `chrome.management.getSelf()` reports `development`, which
 * is exactly "loaded unpacked in developer mode". `getSelf()` needs no
 * permission, so the manifest stays at `activeTab` + `storage`, and no stamp
 * file ships in a release archive.
 */
const DEV_STAMP_FILE = "dev-autoreload.json";
const DEV_APPLIED_COMMIT_KEY = "devAutoReloadAppliedCommit";
const DEV_PENDING_TAB_RELOAD_KEY = "devAutoReloadPendingTabReload";

function createDevAutoReload(options = {}) {
  const chromeApi = options.chromeApi || (typeof chrome !== "undefined" ? chrome : null);
  const fetchImpl = options.fetch || ((...args) => fetch(...args));
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 5000;
  let timer = null;
  let busy = false;

  function available() {
    return Boolean(chromeApi && chromeApi.runtime && chromeApi.runtime.getURL && chromeApi.storage && chromeApi.storage.local);
  }

  async function isDevelopmentInstall() {
    if (!chromeApi || !chromeApi.management || typeof chromeApi.management.getSelf !== "function") return false;
    try {
      const self = await chromeApi.management.getSelf();
      return Boolean(self && self.installType === "development");
    } catch (_error) {
      return false;
    }
  }

  async function readStamp() {
    try {
      const response = await fetchImpl(chromeApi.runtime.getURL(DEV_STAMP_FILE), { cache: "no-store" });
      if (!response || !response.ok) return null;
      const value = await response.json();
      return value && typeof value.commit === "string" && value.commit ? value : null;
    } catch (_error) {
      return null;
    }
  }

  async function reloadPendingTabs() {
    if (!chromeApi.tabs || typeof chromeApi.tabs.query !== "function" || typeof chromeApi.tabs.reload !== "function") return 0;
    const stored = await chromeApi.storage.local.get(DEV_PENDING_TAB_RELOAD_KEY);
    if (!stored || !stored[DEV_PENDING_TAB_RELOAD_KEY]) return 0;
    await chromeApi.storage.local.remove(DEV_PENDING_TAB_RELOAD_KEY);
    const tabs = await chromeApi.tabs.query({ url: ["https://www.linkedin.com/*"] });
    let reloaded = 0;
    for (const tab of Array.isArray(tabs) ? tabs : []) {
      if (!tab || typeof tab.id !== "number") continue;
      try {
        await chromeApi.tabs.reload(tab.id);
        reloaded += 1;
      } catch (_error) {
        /* A closing tab is not a failure worth surfacing. */
      }
    }
    return reloaded;
  }

  async function check() {
    if (!available() || busy) return "skipped";
    busy = true;
    try {
      const stamp = await readStamp();
      if (!stamp) return "no-stamp";
      const stored = await chromeApi.storage.local.get(DEV_APPLIED_COMMIT_KEY);
      if (stored && stored[DEV_APPLIED_COMMIT_KEY] === stamp.commit) return "unchanged";
      await chromeApi.storage.local.set({
        [DEV_APPLIED_COMMIT_KEY]: stamp.commit,
        [DEV_PENDING_TAB_RELOAD_KEY]: stamp.reloadTabs !== false
      });
      chromeApi.runtime.reload();
      return "reloaded";
    } finally {
      busy = false;
    }
  }

  async function start() {
    if (timer) return false;
    if (!(await isDevelopmentInstall())) return false;
    try {
      await reloadPendingTabs();
    } catch (_error) {
      /* Tab reload is best effort. */
    }
    void check();
    timer = setInterval(() => { void check(); }, intervalMs);
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, check, readStamp, reloadPendingTabs };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createHistoryCoordinator, normalizeHistoryRecord, createDevAutoReload,
    HISTORY_KEYS, HISTORY_MESSAGE_TYPES, DEV_STAMP_FILE, DEV_APPLIED_COMMIT_KEY, DEV_PENDING_TAB_RELOAD_KEY
  };
} else if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  createHistoryCoordinator().register();
  createDevAutoReload().start().catch(() => {});
}
