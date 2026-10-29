(() => {
  "use strict";

  // Re-execution would recreate the module and break references captured by the
  // earlier run. SPA re-injection (background chrome.scripting) must stay harmless.
  if (globalThis.__LI_FEED_SHARED__) return;

  const SCHEMA_VERSION = "4.0";
  const MESSAGE_SCHEMA_VERSION = "2.0";
  const CATEGORIES = ["open_role", "recruiter_search", "possible", "job_seeker", "hiring_discussion", "closed", "partial"];
  const FILTERS = ["all", ...CATEGORIES];
  // Single source of truth for the signal columns of every export format (JSON, CSV,
  // HTML, Markdown). The classifier produces exactly these keys; adding a dialect signal
  // must not require touching four serializers.
  const EXPORT_SIGNAL_KEYS = Object.freeze([
    "activeOpening", "ambiguousOpening", "openingFrame", "regional",
    "regionalMaghreb", "regionalGulf", "regionalLevant", "regionalEgypt",
    "recruiterSearch", "recruiterTerms", "genericJobTerms", "applicationCta",
    "jobSeeker", "sponsored", "roleMarker", "contractTerms", "adviceNews", "closed",
    "email", "emailLink", "contactCues", "jobLink", "hashtag"
  ]);
  const HISTORY_MODES = new Set(["off", "session", "persistent"]);

  // Single source of truth for history capacity so background and shared pruning
  // cannot drift apart (bug: the background re-declared its own limits).
  const HISTORY_LIMITS = Object.freeze({
    maxRecords: 500,
    maxBytes: 3_000_000
  });

  const DEFAULT_SETTINGS = Object.freeze({
    mode: "standard",
    maxMinutes: 15,
    maxSteps: 180,
    pauseOnInput: true
  });

  // A post is "new" when the monitor first saw it after the previous run started. The
  // pipeline is the user's private saved/applied tracker; neither value affects detection.
  const PIPELINE_STATES = Object.freeze(["saved", "applied"]);
  const PIPELINE_FILTERS = Object.freeze(["all", "new", "saved", "applied"]);
  const PIPELINE_LIMIT = 2000;
  const EXPORT_FORMATS = Object.freeze(["json", "csv", "html", "markdown"]);

  // The interface ships English-only with a light theme, so preferences no longer carry
  // locale or theme fields; stored values from older versions are ignored.
  const DEFAULT_HIRING_PREFS = Object.freeze({
    autoExpand: true,
    filter: "all",
    pipelineFilter: "all",
    matchesOnly: false,
    exportFormat: "json",
    compactJson: false,
    exportFilteredOnly: false,
    includeFullText: false,
    includeEmails: false,
    includeJobTitles: true,
    includePostAge: true,
    includeMetrics: true,
    includePostMetadata: true,
    keepHistory: false,
    historyMode: "off",
    historyRetentionDays: 30,
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

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Confidence is a discrete scale, not a number; exports carry both the label and a rank
  // integer so a spreadsheet consumer can sort by it. `partial` outranks `strong` because it
  // is not a probability level at all — it marks an extraction state the reviewer must keep
  // re-checking after text expansion.
  const CONFIDENCE_RANK = Object.freeze({
    none: 0, low: 1, review: 2, likely: 3, strong: 4, partial: 5
  });

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
      pipelineFilter: PIPELINE_FILTERS.includes(source.pipelineFilter) ? source.pipelineFilter : "all",
      matchesOnly: source.matchesOnly === true,
      exportFormat: EXPORT_FORMATS.includes(source.exportFormat) ? source.exportFormat : "json",
      exportFilteredOnly: source.exportFilteredOnly === true,
      includeFullText: source.includeFullText === true,
      includeEmails: source.includeEmails === true,
      includeJobTitles: source.includeJobTitles !== false,
      // Export schema 4 re-instated engagement metrics under their own toggle. A schema-2
      // store may still carry `includeMetrics` meaning the age toggle, so it feeds
      // `includePostAge` only when `includePostAge` itself was never stored; the metrics
      // toggle is independent and defaults to on.
      includePostAge: (source.includePostAge ?? source.includeMetrics) !== false,
      includeMetrics: source.includeMetrics !== false,
      compactJson: source.compactJson === true,
      includePostMetadata: source.includePostMetadata !== false,
      keepHistory: requestedMode === "persistent",
      historyMode: requestedMode,
      historyRetentionDays: [7, 30, 90].includes(retention) ? retention : 30,
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
    // E4: keep an allowlist, not a denylist. LinkedIn rotates campaign params faster than
    // any hardcoded list (mcp, trackingId, origin, …), and every new one split a single post
    // into multiple identities. Permalinks are stable once query params are gone, so only
    // the `update` URN (when present) survives; profiles keep none.
    for (const key of Array.from(url.searchParams.keys())) {
      if (kind === "profile" || key.toLowerCase() !== "update") url.searchParams.delete(key);
    }
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

  function identityPermalink(value) {
    // Identity URLs must lose every query parameter: LinkedIn rotates short-lived
    // campaign/tracking params (e.g. ?originalSubdomain, ?trk=, ?mcp) on permalinks,
    // and keeping them split one post into many history identities.
    const canonical = canonicalizeLinkedInUrl(value, "permalink");
    return canonical ? canonical.split("?")[0] : null;
  }

  function identityAuthorPart(author) {
    const value = author && typeof author === "object" && !Array.isArray(author) ? author : {};
    return canonicalizeLinkedInUrl(value.profileUrl, "profile") || normalizeIdentity(value.name) || null;
  }

  function canonicalPostId(post = {}) {
    const existing = typeof post.id === "string" ? post.id.trim() : "";
    if (/^(?:urn|url|text):/.test(existing)) return existing;
    const stable = String(post.sourcePostId || existing || "").trim();
    if (stable) return `urn:${stable}`;
    const permalink = identityPermalink(post.permalink);
    if (permalink) return `url:${permalink}`;
    const authorIdentity = identityAuthorPart(post.author);
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
    const maxRecords = Number.isFinite(options.maxRecords) ? Math.max(0, options.maxRecords) : HISTORY_LIMITS.maxRecords;
    const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(2, options.maxBytes) : HISTORY_LIMITS.maxBytes;
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

  // ── Pipeline: saved / applied tracking and the new-since-last-run delta ──
  // These helpers are shared because two contexts need the same answer: the popup
  // (badges, counts, chips) and the feed monitor (server-side result filtering). Keeping
  // the rules here means a chip and a result row can never disagree about "new".

  /** Identity used by result rows, review labels and the pipeline. */
  function pipelinePostKey(record) {
    if (!record || typeof record !== "object") return "";
    return String(record.id || record.sourcePostId || record.permalink || "");
  }

  /**
   * True when the monitor first saw this post after the previous run started. A missing or
   * malformed baseline means there is no earlier run to compare with, so every detection
   * counts as new. A record without a readable firstSeenAt is never claimed as new.
   */
  function isNewSince(record, baselineAt) {
    const seenAt = validTimestamp(record && record.firstSeenAt);
    if (seenAt === null) return false;
    const baseline = validTimestamp(baselineAt);
    if (baseline === null) return true;
    return seenAt > baseline;
  }

  function pipelineStateOf(states, key) {
    if (!states || !key) return "";
    const entry = states instanceof Map ? states.get(key) : states[key];
    const state = typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.state : "";
    return PIPELINE_STATES.includes(state) ? state : "";
  }

  function sanitizePipeline(raw, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : PIPELINE_LIMIT;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const entries = [];
    for (const [key, value] of Object.entries(raw)) {
      const state = value && typeof value === "object" ? value.state : "";
      if (!key || !PIPELINE_STATES.includes(state)) continue;
      const updatedAt = validTimestamp(value.updatedAt);
      entries.push([key.slice(0, 180), {
        state,
        updatedAt: new Date(updatedAt === null ? now : Math.min(updatedAt, now)).toISOString()
      }]);
    }
    entries.sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt));
    return Object.fromEntries(entries.slice(-limit));
  }

  /** Immutable upsert: "" (or any unknown state) removes the entry. */
  function setPipelineState(pipeline, key, state, now = Date.now()) {
    const next = { ...sanitizePipeline(pipeline, { now }) };
    const safeKey = String(key || "").slice(0, 180);
    if (!safeKey) return next;
    if (!PIPELINE_STATES.includes(state)) delete next[safeKey];
    else next[safeKey] = { state, updatedAt: new Date(now).toISOString() };
    const entries = Object.entries(next).sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt));
    return Object.fromEntries(entries.slice(-PIPELINE_LIMIT));
  }

  function applyPipelineFilter(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const filter = PIPELINE_FILTERS.includes(options.filter) ? options.filter : "all";
    if (filter === "all") return list;
    return list.filter((record) => {
      const state = pipelineStateOf(options.states, pipelinePostKey(record));
      // "New" is the triage queue: a post you already saved or applied to has left it.
      if (filter === "new") return !state && isNewSince(record, options.baselineAt);
      return state === filter;
    });
  }

  function pipelineCounts(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const counts = { all: list.length, new: 0, saved: 0, applied: 0 };
    for (const record of list) {
      const state = pipelineStateOf(options.states, pipelinePostKey(record));
      if (!state && isNewSince(record, options.baselineAt)) counts.new += 1;
      if (state) counts[state] += 1;
    }
    return counts;
  }

  const api = {
    SCHEMA_VERSION,
    MESSAGE_SCHEMA_VERSION,
    CATEGORIES,
    FILTERS,
    CONFIDENCE_RANK,
    EXPORT_SIGNAL_KEYS,
    HISTORY_LIMITS,
    PIPELINE_STATES,
    PIPELINE_FILTERS,
    PIPELINE_LIMIT,
    EXPORT_FORMATS,
    DEFAULT_SETTINGS,
    DEFAULT_HIRING_PREFS,
    sanitizeSettings,
    sanitizeHiringPreferences,
    parseLinkedInUrl,
    canonicalizeLinkedInUrl,
    canonicalPostId,
    identityAuthorPart,
    mergePostRecords,
    pruneHistory,
    csvCell,
    utf8ByteLength,
    clamp,
    pipelinePostKey,
    isNewSince,
    pipelineStateOf,
    sanitizePipeline,
    setPipelineState,
    applyPipelineFilter,
    pipelineCounts
  };
  globalThis.__LI_FEED_SHARED__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
