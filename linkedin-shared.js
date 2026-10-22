(() => {
  "use strict";

  const SCHEMA_VERSION = "2.0";
  const MESSAGE_SCHEMA_VERSION = "2.0";
  const CATEGORIES = ["open_role", "recruiter_search", "possible", "job_seeker", "hiring_discussion", "closed", "partial"];
  const FILTERS = ["all", ...CATEGORIES];
  const HISTORY_MODES = new Set(["off", "session", "persistent"]);
  const ERROR_CODES = Object.freeze({
    STORAGE_UNAVAILABLE: "storage_unavailable",
    QUOTA_EXCEEDED: "quota_exceeded",
    INVALID_DATA: "invalid_data",
    TAB_UNAVAILABLE: "tab_unavailable",
    HISTORY_DISABLED: "history_disabled",
    HISTORY_LIMIT: "history_limit",
    NOT_FOUND: "not_found"
  });

  class LinkerterError extends Error {
    constructor(code, message, cause) {
      super(message || code);
      this.name = "LinkerterError";
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  const DEFAULT_SETTINGS = Object.freeze({
    mode: "standard",
    maxMinutes: 15,
    maxSteps: 180,
    pauseOnInput: true
  });

  const DEFAULT_HIRING_PREFS = Object.freeze({
    autoExpand: true,
    filter: "all",
    matchesOnly: false,
    exportFormat: "json",
    exportFilteredOnly: false,
    includeFullText: false,
    includeEmails: false,
    includeJobTitles: true,
    includeMetrics: true,
    includePostMetadata: true,
    keepHistory: false,
    historyMode: "off",
    historyRetentionDays: 30,
    locale: "auto",
    onboardingSeen: false
  });

  const LEGACY_MODES = Object.freeze({
    human: "standard",
    natural: "standard",
    steady: "standard",
    gentle: "standard",
    quick: "fast",
    super_safe: "super_fast"
  });
  const MODES = new Set(["standard", "fast", "super_fast"]);
  const MINUTE_OPTIONS = new Set([5, 15, 30, 60]);
  const STEP_OPTIONS = new Set([40, 80, 120, 180, 300, 500]);
  const TRACKING_PARAMS = new Set([
    "trk", "trkinfo", "originalsubdomain", "lipi", "licu", "midtoken", "midsig", "eid", "otp"
  ]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function sanitizeSettings(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const requestedMode = LEGACY_MODES[source.mode] || source.mode;
    const mode = MODES.has(requestedMode) ? requestedMode : DEFAULT_SETTINGS.mode;
    const requestedMinutes = Number(source.maxMinutes);
    let maxMinutes = MINUTE_OPTIONS.has(requestedMinutes) ? requestedMinutes : DEFAULT_SETTINGS.maxMinutes;
    const requestedSteps = Number(source.maxSteps);
    let maxSteps = STEP_OPTIONS.has(requestedSteps) ? requestedSteps : DEFAULT_SETTINGS.maxSteps;
    let pauseOnInput = source.pauseOnInput !== false;
    if (mode === "super_fast") {
      maxMinutes = Math.min(maxMinutes, 15);
      maxSteps = Math.min(maxSteps, 120);
      pauseOnInput = true;
    }
    return { mode, maxMinutes, maxSteps, pauseOnInput };
  }

  function sanitizeHiringPreferences(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const requestedMode = HISTORY_MODES.has(source.historyMode)
      ? source.historyMode
      : source.keepHistory === true ? "persistent" : "off";
    const retention = Number(source.historyRetentionDays);
    return {
      autoExpand: source.autoExpand !== false,
      filter: FILTERS.includes(source.filter) ? source.filter : "all",
      matchesOnly: source.matchesOnly === true,
      exportFormat: source.exportFormat === "csv" ? "csv" : "json",
      exportFilteredOnly: source.exportFilteredOnly === true,
      includeFullText: source.includeFullText === true,
      includeEmails: source.includeEmails === true,
      includeJobTitles: source.includeJobTitles !== false,
      includeMetrics: source.includeMetrics !== false,
      includePostMetadata: source.includePostMetadata !== false,
      keepHistory: requestedMode === "persistent",
      historyMode: requestedMode,
      historyRetentionDays: [7, 30, 90].includes(retention) ? retention : 30,
      locale: ["auto", "en", "fr", "ar"].includes(source.locale) ? source.locale : "auto",
      onboardingSeen: source.onboardingSeen === true
    };
  }

  function parseLinkedInUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const hostname = url.hostname.toLowerCase();
      const isLinkedIn = url.protocol === "https:" && (hostname === "www.linkedin.com" || hostname === "linkedin.com");
      const pathname = url.pathname;
      const isFeed = isLinkedIn && (pathname === "/" || /^\/feed(?:\/|$)/.test(pathname));
      return { url, isLinkedIn, isFeed, hostname, pathname };
    } catch (_error) {
      return { url: null, isLinkedIn: false, isFeed: false, hostname: "", pathname: "" };
    }
  }

  function canonicalizeLinkedInUrl(value, kind = "permalink") {
    const parsed = parseLinkedInUrl(value);
    if (!parsed.isLinkedIn || !parsed.url || parsed.url.username || parsed.url.password) return null;
    const { url, pathname } = parsed;
    if (url.port && url.port !== "443") return null;
    const accepted = kind === "profile"
      ? /^\/(?:in|company)\//.test(pathname)
      : kind === "feed"
        ? parsed.isFeed
        : /^\/(?:posts\/|feed\/update\/|activity[-/])/.test(pathname);
    if (!accepted) return null;
    url.protocol = "https:";
    url.hostname = "www.linkedin.com";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  }

  function normalizeIdentity(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\p{M}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalPostId(post = {}) {
    const existing = typeof post.id === "string" ? post.id.trim() : "";
    if (/^(?:urn|url|text):/.test(existing)) return existing;
    const stable = String(post.sourcePostId || existing || "").trim();
    if (stable) return `urn:${stable}`;
    const permalink = canonicalizeLinkedInUrl(post.permalink, "permalink");
    if (permalink) return `url:${permalink}`;
    const author = post.author && typeof post.author === "object" ? post.author : {};
    const authorIdentity = canonicalizeLinkedInUrl(author.profileUrl, "profile") || normalizeIdentity(author.name);
    const textIdentity = normalizeIdentity(post.fullText || post.text || post.snippet);
    return `text:${authorIdentity}|${textIdentity}`;
  }

  function validTimestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : null;
  }

  function mergeNullableObjects(previous, next) {
    if (!previous && !next) return next ?? previous ?? null;
    const output = { ...(previous || {}) };
    for (const [key, value] of Object.entries(next || {})) {
      if (value !== null && value !== undefined && value !== "") output[key] = value;
      else if (!(key in output)) output[key] = value;
    }
    return output;
  }

  function mergePostRecords(previous, next) {
    if (!previous) return next ? { ...next } : next;
    if (!next) return { ...previous };
    const previousSeen = validTimestamp(previous.lastSeenAt || previous.firstSeenAt) || 0;
    const nextSeen = validTimestamp(next.lastSeenAt || next.firstSeenAt) || 0;
    const latest = nextSeen >= previousSeen ? next : previous;
    const older = latest === next ? previous : next;
    const merged = { ...older, ...latest };
    const firstCandidates = [previous.firstSeenAt, next.firstSeenAt]
      .map((value) => ({ value, timestamp: validTimestamp(value) }))
      .filter((item) => item.timestamp !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (firstCandidates.length) merged.firstSeenAt = firstCandidates[0].value;
    merged.lastSeenAt = latest.lastSeenAt || latest.firstSeenAt || merged.lastSeenAt;
    merged.id = canonicalPostId({ ...merged, id: latest.id || older.id });

    const previousComplete = previous.contentComplete !== false && typeof previous.fullText === "string";
    const nextComplete = next.contentComplete !== false && typeof next.fullText === "string";
    if (previousComplete || nextComplete) {
      const complete = nextComplete ? next : previous;
      merged.fullText = complete.fullText;
      merged.contentComplete = true;
      merged.extractionStatus = "complete";
    } else {
      const longer = String(next.fullText || "").length >= String(previous.fullText || "").length ? next : previous;
      merged.fullText = longer.fullText || "";
      merged.contentComplete = false;
      merged.extractionStatus = "partial";
    }
    merged.author = mergeNullableObjects(older.author, latest.author);
    merged.metrics = mergeNullableObjects(older.metrics, latest.metrics);
    merged.postAge = mergeNullableObjects(older.postAge, latest.postAge);
    merged.extracted = mergeNullableObjects(older.extracted, latest.extracted);
    return merged;
  }

  function utf8ByteLength(value) {
    let bytes = 0;
    for (const character of String(value || "")) {
      const point = character.codePointAt(0);
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return bytes;
  }

  function pruneHistory(records, options = {}) {
    const enabled = options.enabled === true;
    const retentionDays = [7, 30, 90].includes(Number(options.retentionDays)) ? Number(options.retentionDays) : 30;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const maxRecords = Number.isFinite(options.maxRecords) ? Math.max(0, options.maxRecords) : 500;
    const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(2, options.maxBytes) : 3_000_000;
    const cutoff = now - retentionDays * 86_400_000;
    let truncated = false;
    const candidates = [];
    for (const record of Array.isArray(records) ? records : []) {
      if (!record || typeof record !== "object") {
        truncated = true;
        continue;
      }
      const timestamp = validTimestamp(record.lastSeenAt || record.firstSeenAt);
      if (timestamp === null || timestamp > now || (enabled && timestamp < cutoff)) {
        truncated = true;
        continue;
      }
      candidates.push({ record, timestamp });
    }
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    const kept = [];
    let bytes = 2;
    for (const { record } of candidates) {
      const size = utf8ByteLength(JSON.stringify(record)) + (kept.length ? 1 : 0);
      if (kept.length >= maxRecords || bytes + size > maxBytes) {
        truncated = true;
        continue;
      }
      kept.push(record);
      bytes += size;
    }
    return { records: kept, truncated, bytes };
  }

  function csvCell(value) {
    const trustedNumber = typeof value === "number" && Number.isFinite(value);
    const raw = value === null || value === undefined
      ? ""
      : Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
    const safe = !trustedNumber && /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  const api = {
    SCHEMA_VERSION,
    MESSAGE_SCHEMA_VERSION,
    CATEGORIES,
    FILTERS,
    ERROR_CODES,
    LinkerterError,
    DEFAULT_SETTINGS,
    DEFAULT_HIRING_PREFS,
    sanitizeSettings,
    sanitizeHiringPreferences,
    parseLinkedInUrl,
    canonicalizeLinkedInUrl,
    canonicalPostId,
    mergePostRecords,
    pruneHistory,
    csvCell,
    utf8ByteLength,
    clamp
  };
  globalThis.__LI_FEED_SHARED__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
