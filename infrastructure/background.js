"use strict";

if (!globalThis.__LI_FEED_SHARED__ && typeof importScripts === "function") {
  importScripts("/core/linkedin-shared.js");
}

const HISTORY_KEYS = Object.freeze({
  persistent: "hiringPostHistory",
  session: "hiringSessionPostHistory",
  settings: "hiringSettings",
  preferences: "hiringPreferences"
});
const HISTORY_METADATA_KEY = "hiringHistoryMetadata";
// Derived from the shared table so the background cannot accept a type the popup never
// sends, or drop one it does. Resolved at module scope: the service worker imports
// core/linkedin-shared.js above, and every test that requires this file preloads it.
const SHARED_MESSAGE_TYPES = globalThis.__LI_FEED_SHARED__.MESSAGE_TYPES;
const HISTORY_MESSAGE_TYPES = new Set([
  ...Object.values(SHARED_MESSAGE_TYPES.HISTORY),
  SHARED_MESSAGE_TYPES.DATA.LOCAL_DATA_CLEAR,
  SHARED_MESSAGE_TYPES.DATA.GET_DIAGNOSTICS
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
  const permalink = shared.canonicalizeLinkedInUrl(source.permalink || source.url || "", "permalink") || "";
  // A record with no source id, no canonical permalink, no text and no author has no
  // identity to merge on. canonicalPostId would still return "text:null|" for it, and
  // every such junk record would collapse into that one id.
  const hasIdentity = Boolean(
    String(source.sourcePostId || source.id || "").trim() ||
    permalink ||
    fullText.trim() ||
    String(author.name || "").trim()
  );
  if (!hasIdentity) return null;
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
    permalink,
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

  const LIMITS = globalThis.__LI_FEED_SHARED__.HISTORY_LIMITS;
  async function pruneState(state) {
    if (state.mode === "off") return;
    for (const store of ["persistent", "session"]) {
      const before = state.records[store];
      const result = globalThis.__LI_FEED_SHARED__.pruneHistory(before, {
        enabled: state.mode === store,
        retentionDays: state.preferences.historyRetentionDays,
        now: now()
      });
      // Reference equality is enough: pruneHistory keeps the same record objects when
      // nothing was dropped, and the timestamp sort converges after the first write.
      // A JSON.stringify compare re-serialized everything on every status poll.
      const unchanged = before.length === result.records.length &&
        result.records.every((record, index) => record === before[index]);
      if (!unchanged) {
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
      limitReached: Object.values(stores).some((item) => item.count >= LIMITS.maxRecords || item.bytes >= LIMITS.maxBytes)
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
    // Retention expiry must not be reported as a capacity limit: only an overflow against
    // the caps that survives pruning (the store stays at/beyond a cap) means the limit
    // blocked valid records.
    const capacityOverflow = unpruned.length > LIMITS.maxRecords ||
      globalThis.__LI_FEED_SHARED__.utf8ByteLength(JSON.stringify(unpruned)) > LIMITS.maxBytes;
    const bytesAfter = globalThis.__LI_FEED_SHARED__.utf8ByteLength(JSON.stringify(records));
    const limitReached = capacityOverflow && (records.length >= LIMITS.maxRecords || bytesAfter >= LIMITS.maxBytes);
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
      bytes: bytesAfter,
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
      case SHARED_MESSAGE_TYPES.HISTORY.GET: return getOperation();
      case SHARED_MESSAGE_TYPES.HISTORY.STATUS: return statusOperation();
      case SHARED_MESSAGE_TYPES.HISTORY.APPEND: return appendOperation(message);
      case SHARED_MESSAGE_TYPES.HISTORY.DELTA: return deltaOperation(message);
      case SHARED_MESSAGE_TYPES.HISTORY.FLUSH: return flushDeltaOperation(message);
      case SHARED_MESSAGE_TYPES.HISTORY.SET_MODE: return setModeOperation(message);
      case SHARED_MESSAGE_TYPES.HISTORY.CLEAR: return clearOperation(message);
      case SHARED_MESSAGE_TYPES.DATA.LOCAL_DATA_CLEAR: return localDataClearOperation(message);
      case SHARED_MESSAGE_TYPES.DATA.GET_DIAGNOSTICS: return diagnosticOperation();
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
 * SPA feed injection fallback.
 *
 * LinkedIn is a single-page application: a client-side navigation to /feed never
 * reloads the document, so the manifest-declared content scripts are injected only
 * on a true navigation. When a tab's URL becomes a feed URL but nothing answers a
 * GET_STATUS probe, wait a beat for a concurrent manifest injection (document_idle
 * runs after this event) and otherwise inject the same file list with
 * chrome.scripting. Every content module has a re-entrancy guard, so a late
 * manifest injection cannot duplicate listeners.
 */
// Keep this list identical to manifest.json's content_scripts[0].js, in the same order:
// linkedin-hiring-rules.js throws when core/sha256.js has not run first, and the injector
// is the only loader on client-side /feed navigations. tests/runtime-files.test.js fails
// if the two lists ever drift.
const FEED_CONTENT_SCRIPTS = Object.freeze([
  "core/sha256.js",
  "core/linkedin-shared.js",
  "core/linkedin-hiring-rules.js",
  "core/linkedin-hiring-classifier.js",
  "features/feed-monitor/linkedin-post-extract.js",
  "features/feed-monitor/linkedin-hiring-monitor.js",
  "features/feed-monitor/content.js"
]);

function createSpaFeedInjector(options = {}) {
  const chromeApi = options.chromeApi || (typeof chrome !== "undefined" ? chrome : null);
  const shared = options.shared || globalThis.__LI_FEED_SHARED__;
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const probeDelayMs = Number.isFinite(options.probeDelayMs) ? options.probeDelayMs : 300;
  const inFlight = new Set();
  if (!chromeApi || !chromeApi.tabs || !chromeApi.scripting || !shared) {
    return { register() {}, onTabUpdated() {}, probe() {} };
  }

  function isFeed(url) {
    try {
      return Boolean(shared.parseLinkedInUrl(url).isFeed);
    } catch (_error) {
      return false;
    }
  }

  async function probe(tabId) {
    try {
      await chromeApi.tabs.sendMessage(tabId, { type: SHARED_MESSAGE_TYPES.SCROLL.GET_STATUS });
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function onTabUpdated(tabId, changeInfo, tab) {
    const url = (changeInfo && changeInfo.url) || (tab && tab.url) || "";
    if (!isFeed(url) || inFlight.has(tabId)) return;
    inFlight.add(tabId);
    try {
      let connected = await probe(tabId);
      if (!connected) await delay(probeDelayMs);
      if (!connected) connected = await probe(tabId);
      if (!connected) {
        await chromeApi.scripting.executeScript({ tabId, files: [...FEED_CONTENT_SCRIPTS] });
      }
    } catch (_error) {
      /* The tab may have closed or navigated on mid-injection; nothing to recover. */
    } finally {
      inFlight.delete(tabId);
    }
  }

  function register() {
    try {
      chromeApi.tabs.onUpdated.addListener(onTabUpdated);
    } catch (_error) {
      /* Listener registration is unavailable in this context. */
    }
  }

  return { register, onTabUpdated, probe };
}

/*
 * Keyboard commands.
 *
 * `_execute_action` is handled by Chrome itself (it opens the popup and never reaches
 * onCommand). The other two commands act on whichever LinkedIn feed tab is active when
 * the shortcut fires, and reuse the popup's message protocol so a shortcut can never
 * start a monitor with options the UI would not have used.
 */
function createCommandRouter(options = {}) {
  const chromeApi = options.chromeApi || (typeof chrome !== "undefined" ? chrome : null);
  const shared = options.shared || globalThis.__LI_FEED_SHARED__;
  const COMMANDS = Object.freeze(["toggle-monitor", "toggle-scroll"]);
  if (!chromeApi || !chromeApi.tabs || !chromeApi.storage) {
    return { COMMANDS, onCommand: async () => ({ ok: false, error: "unavailable" }), register() {} };
  }

  async function activeFeedTab() {
    const tabs = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !Number.isInteger(tab.id)) return null;
    return shared.parseLinkedInUrl(tab.url || "").isFeed ? tab : null;
  }

  async function send(tabId, message) {
    try {
      return await chromeApi.tabs.sendMessage(tabId, message);
    } catch (_error) {
      return null;
    }
  }

  async function monitorOptions() {
    const stored = await chromeApi.storage.local.get({ hiringPreferences: {} });
    const prefs = shared.sanitizeHiringPreferences(stored.hiringPreferences || {});
    return {
      autoExpand: prefs.autoExpand,
      filter: prefs.filter,
      matchesOnly: prefs.matchesOnly,
      historyMode: prefs.historyMode,
      keepHistory: prefs.historyMode !== "off",
      historyRetentionDays: prefs.historyRetentionDays
    };
  }

  async function onCommand(command) {
    if (!COMMANDS.includes(command)) return { ok: false, error: "unknown_command" };
    const tab = await activeFeedTab();
    if (!tab) return { ok: false, error: "open_feed" };
    if (command === "toggle-monitor") {
      const status = await send(tab.id, { type: SHARED_MESSAGE_TYPES.HIRING.GET_STATUS, query: {} });
      if (status && status.monitoring) return send(tab.id, { type: SHARED_MESSAGE_TYPES.HIRING.STOP });
      return send(tab.id, { type: SHARED_MESSAGE_TYPES.HIRING.START, options: await monitorOptions() });
    }
    const status = await send(tab.id, { type: SHARED_MESSAGE_TYPES.SCROLL.GET_STATUS });
    const state = status && status.state;
    if (state === "running") return send(tab.id, { type: SHARED_MESSAGE_TYPES.SCROLL.PAUSE });
    if (state === "paused") return send(tab.id, { type: SHARED_MESSAGE_TYPES.SCROLL.RESUME });
    const stored = await chromeApi.storage.local.get({ settings: shared.DEFAULT_SETTINGS });
    return send(tab.id, { type: SHARED_MESSAGE_TYPES.SCROLL.START, settings: shared.sanitizeSettings(stored.settings || {}) });
  }

  function register() {
    try {
      chromeApi.commands?.onCommand?.addListener((command) => { void onCommand(command); });
    } catch (_error) {
      /* Listener registration is unavailable in this context. */
    }
  }

  return { COMMANDS, onCommand, monitorOptions, register };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createHistoryCoordinator, normalizeHistoryRecord, createSpaFeedInjector, createCommandRouter,
    HISTORY_KEYS, HISTORY_MESSAGE_TYPES, FEED_CONTENT_SCRIPTS
  };
} else if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  createHistoryCoordinator().register();
  createSpaFeedInjector().register();
  createCommandRouter().register();
}
