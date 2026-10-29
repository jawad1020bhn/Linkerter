(() => {
  "use strict";

  /*
   * Popup store: state shaping that does not touch the DOM or chrome.*.
   *
   * Everything here is a pure function so the popup controller can stay an event/render
   * shell and the rules can be unit-tested without a browser. The canonical pipeline
   * semantics live in core/linkedin-shared.js because the feed monitor needs the same
   * answers; this module adds the popup's own view models on top of them.
   */

  const shared = globalThis.__LI_FEED_SHARED__ ||
    (typeof require === "function" ? require("../../core/linkedin-shared.js") : null);
  if (!shared) throw new Error("Shared primitives must load before the popup store.");

  const REVIEW_LABELS = Object.freeze(["useful", "irrelevant", "false_positive"]);
  const REVIEW_LIMIT = 1000;
  const HISTORY_LIMIT = 1000;
  const PIPELINE_CHIPS = Object.freeze(["all", "new", "saved", "applied"]);
  const PIPELINE_CHIP_LABELS = Object.freeze({
    all: "pipeline.all",
    new: "pipeline.new",
    saved: "pipeline.saved",
    applied: "pipeline.applied"
  });

  function sanitizeReviewLabels(raw, limit = REVIEW_LIMIT) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
    const entries = [];
    for (const [id, value] of Object.entries(raw)) {
      const label = typeof value === "string" ? value : value && value.label;
      if (!id || !REVIEW_LABELS.includes(label)) continue;
      const updatedAt = value && typeof value === "object" ? Date.parse(value.updatedAt) : NaN;
      entries.push([String(id).slice(0, 180), {
        label,
        updatedAt: new Date(Number.isFinite(updatedAt) ? updatedAt : Date.now()).toISOString()
      }]);
    }
    entries.sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt));
    return new Map(entries.slice(-Math.max(0, limit)));
  }

  function sanitizeHistory(raw, limit = HISTORY_LIMIT) {
    return (Array.isArray(raw) ? raw : [])
      .filter((record) => record && typeof record === "object" && (record.id || record.permalink))
      .sort((a, b) => Date.parse(b.lastSeenAt || b.firstSeenAt || "") - Date.parse(a.lastSeenAt || a.firstSeenAt || ""))
      .slice(0, Math.max(0, limit));
  }

  /**
   * One place that turns whatever is in storage into the preference object the popup
   * renders. Legacy `keepHistory`/`includeMetrics` handling stays in the shared sanitizer;
   * this only adds the popup-specific coercion for the pipeline view.
   */
  function sanitizeStoredPreferences(raw = {}) {
    const preferences = shared.sanitizeHiringPreferences(raw);
    return {
      ...preferences,
      pipelineFilter: shared.PIPELINE_FILTERS.includes(raw && raw.pipelineFilter) ? raw.pipelineFilter : "all"
    };
  }

  function nextPipelineState(current, requested) {
    if (!shared.PIPELINE_STATES.includes(requested)) return "";
    return current === requested ? "" : requested;
  }

  function pipelineChips(counts, active = "all") {
    const source = counts && typeof counts === "object" ? counts : {};
    const selected = PIPELINE_CHIPS.includes(active) ? active : "all";
    return PIPELINE_CHIPS.map((id) => ({
      id,
      labelKey: PIPELINE_CHIP_LABELS[id],
      count: Math.max(0, Number(source[id]) || 0),
      active: id === selected
    }));
  }

  /**
   * "New since last run" is only meaningful against an earlier run. Without a baseline the
   * shared rule marks every detection as new, which is right for filtering but would make
   * the status line claim a delta that does not exist, so the UI reports zero instead.
   */
  function describeDelta(counts, baselineAt) {
    const hasBaseline = Number.isFinite(Date.parse(baselineAt || ""));
    return {
      count: hasBaseline ? Math.max(0, Number(counts && counts.new) || 0) : 0,
      hasBaseline
    };
  }

  const api = {
    REVIEW_LABELS,
    REVIEW_LIMIT,
    HISTORY_LIMIT,
    PIPELINE_CHIPS,
    sanitizeReviewLabels,
    sanitizeHistory,
    sanitizeStoredPreferences,
    nextPipelineState,
    pipelineChips,
    describeDelta,
    PIPELINE_LIMIT: shared.PIPELINE_LIMIT
  };
  globalThis.__LI_FEED_POPUP_STORE__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
