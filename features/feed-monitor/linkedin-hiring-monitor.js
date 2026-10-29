(() => {
  "use strict";

  const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
  const shared = globalThis.__LI_FEED_SHARED__;
  if (!classifier) throw new Error("The local hiring classifier must load before the feed monitor.");
  if (!shared) throw new Error("Shared primitives must load before the feed monitor.");
  // Idempotent load: re-execution would register a second runtime listener set while the
  // first instance's state (results, history queue) stays alive. Programmatic SPA
  // re-injection reuses the existing instance instead.
  if (globalThis.__LI_FEED_HIRING_MONITOR__) return;

  // Post extraction lives in its own pure-DOM module so it can be developed and tested
  // without a monitor session; that module owns card boundaries, identity, text, age and metrics.
  const extract = globalThis.__LI_FEED_HIRING_POST_EXTRACT__ ||
    (typeof require === "function" ? require("./linkedin-post-extract.js") : null);
  if (!extract) throw new Error("Post extractors must load before the feed monitor.");
  const {
    normalizeLabel, isSeeMoreControl, isElementVisible, isCardNearViewport, isLikelyPostRoot,
    findPostRoot, findPostRootsInScope, collectPostRoots, getStableId, getPostTextDetails,
    getHrefs, getPostPermalink, getAuthorDetails, getPostAge, parseMetricNumber, parseMetricCount,
    getPostMetrics, getArchiveKey, createExportRecord, extractPostRecord
  } = extract;

  const MAX_RESULTS = 80;
  const MAX_EXPORT_RECORDS = 1000;
  const HISTORY_SAVE_DELAY_MS = 4_000;
  const METRICS_REFRESH_MS = 30_000;
  const MAX_QUEUE = 16;


  let monitoring = false;
  let autoExpand = true;
  let activeFilter = "all";
  let matchesOnly = false;
  let monitorGeneration = 0;
  let filterStyle = null;
  let filterStyleBlocked = false;
  const filteredRoots = new Set();
  let observer = null;
  let scheduledScan = null;
  let scrollListener = null;
  let visibilityListener = null;
  let scanning = false;
  let scanAgain = false;
  let expansionQueue = [];
  let expansionWorkerActive = false;
  let attemptedRoots = new WeakSet();
  let queuedRoots = new WeakSet();
  let seenRoots = new WeakSet();
  let results = new Map();
  let exportRecords = new Map();
  let archiveKeys = new WeakMap();
  let archiveRootCounts = new Map();
  let archiveLimitReached = false;
  let duplicateMergedCount = 0;
  // Counts records evicted by the archive cap (E6): the export must not silently contain
  // fewer posts than the run actually found.
  let prunedRecords = 0;
  let monitorStartedAt = null;
  let monitorStoppedAt = null;
  let processedCount = 0;
  let keepHistory = false;
  let historyRetentionDays = 30;
  let historyGeneration = 0;
  let historySaveTimer = null;
  let historySaveQueue = Promise.resolve();
  let historyLimitReached = false;
  let historyMode = "off";
  let historyCount = 0;
  let historyError = null;
  // Pipeline state is cached from chrome.storage so result filtering and counts do not
  // need a round trip per query. The popup is the only writer; the storage listener below
  // keeps this cache current even while the popup is closed.
  let pipelineStates = {};
  let pipelineBaselineAt = null;
  let pipelineFilter = "all";
  const pendingDelta = new Map();
  const MONITOR_ID = globalThis.crypto?.randomUUID?.() || `feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const classificationCache = new WeakMap();
  const dirtyRoots = new Set();
  const scanStats = { scans: 0, batches: 0, classifications: 0, cacheHits: 0, dirtyProcessed: 0, lastScanMs: 0, totalScanMs: 0, maxScanMs: 0 };
  let domHealth = {
    checks: 0,
    postRootsFound: 0,
    scannedCards: 0,
    textSelectorMatches: 0,
    textFallbacks: 0,
    seeMoreControls: 0,
    postsWithAge: 0,
    postsWithMetrics: 0,
    lastScanAt: null,
    level: "checking",
    message: "Waiting for the first feed scan."
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Result ordering and age policy. Ranks keep active openings ahead of every secondary
  // category without hiding any of them.
  const SORT_MODES = ["relevance", "newest", "oldest"];
  const CATEGORY_RANK = Object.freeze({
    open_role: 0, recruiter_search: 1, possible: 2, job_seeker: 3, hiring_discussion: 4, closed: 5, partial: 6
  });
  const STALE_OPENING_AGE_DAYS = 60;

  function isFeedPage() {
    return location.hostname === "www.linkedin.com" &&
      (location.pathname === "/" || /^\/feed(?:\/|$)/.test(location.pathname));
  }

  function decrementArchiveRootCount(key) {
    const count = archiveRootCounts.get(key) || 0;
    if (count <= 1) {
      archiveRootCounts.delete(key);
      exportRecords.delete(key);
    } else {
      archiveRootCounts.set(key, count - 1);
    }
  }

  function upsertExportRecord(root, details, classification, category) {
    const previousKey = archiveKeys.get(root);
    if (category === "none" || category === "partial") {
      if (previousKey) {
        archiveKeys.delete(root);
        decrementArchiveRootCount(previousKey);
      }
      return;
    }
    const candidateKey = getArchiveKey(root, details.text);
    const key = candidateKey.startsWith("text:") && previousKey ? previousKey : candidateKey;
    // E1: a post first seen while truncated is keyed by its partial text. When the same card
    // later yields a stable urn/url id, re-key the pending record instead of forking it, so
    // the export does not show the same post twice (and firstSeenAt survives expansion).
    if (previousKey && previousKey !== key && previousKey.startsWith("text:") && !key.startsWith("text:")) {
      const pending = exportRecords.get(previousKey);
      if (pending) {
        exportRecords.delete(previousKey);
        archiveRootCounts.delete(previousKey);
        exportRecords.set(key, pending);
      }
    }
    if (previousKey && previousKey !== key) decrementArchiveRootCount(previousKey);

    const previous = exportRecords.get(key);
    const previousRootCount = archiveRootCounts.get(key) || 0;
    if (previousKey !== key || previousRootCount === 0) {
      if (previous) duplicateMergedCount += 1;
      archiveRootCounts.set(key, previousRootCount + 1);
    }
    const capturedAtMs = Date.now();
    const staleMetrics = !previous || capturedAtMs - Date.parse(previous.metricsCapturedAt) >= METRICS_REFRESH_MS;
    const contentChanged = !previous || previous.fullText !== details.text || previous.contentComplete !== !details.partial;
    const classificationChanged = !previous || previous.category !== category || previous.confidence !== (details.partial ? "partial" : classification.confidence) || previous.score !== classification.score;
    if (contentChanged || classificationChanged || staleMetrics) {
      const record = createExportRecord(root, key, details, classification, category, previous, capturedAtMs);
      exportRecords.delete(key);
      exportRecords.set(key, record);
      queueHistoryDelta(record);
      while (exportRecords.size > MAX_EXPORT_RECORDS) {
        const oldestKey = exportRecords.keys().next().value;
        exportRecords.delete(oldestKey);
        archiveRootCounts.delete(oldestKey);
        archiveLimitReached = true;
        prunedRecords += 1;
      }
    } else {
      const previousSeenAtMs = Date.parse(previous.lastSeenAt || "");
      if (!Number.isFinite(previousSeenAtMs) || capturedAtMs - previousSeenAtMs >= 60_000) {
        previous.lastSeenAt = new Date(capturedAtMs).toISOString();
        queueHistoryDelta(previous);
      }
    }
    archiveKeys.set(root, key);
  }

  function getExportPayload() {
    const posts = Array.from(exportRecords.values()).sort((a, b) => Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt));
    return {
      supported: true,
      isFeed: isFeedPage(),
      ok: true,
      schemaVersion: shared.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      scope: "All detected posts from the current monitor run, independent of the selected category filter.",
      provenance: {
        rulesHash: globalThis.__LI_FEED_HIRING_RULES__?.tablesHash || null,
        classifierHash: classifier.classifierHash || null,
        extractorHash: extract.extractorHash || null
      },
      domHealthSnapshot: {
        checks: domHealth.checks,
        postRootsFound: domHealth.postRootsFound,
        textSelectorMatches: domHealth.textSelectorMatches,
        textFallbacks: domHealth.textFallbacks,
        seeMoreControls: domHealth.seeMoreControls,
        postsWithAge: domHealth.postsWithAge,
        postsWithMetrics: domHealth.postsWithMetrics,
        level: domHealth.level,
        message: domHealth.message
      },
      monitorRun: {
        startedAt: monitorStartedAt,
        stoppedAt: monitorStoppedAt,
        active: monitoring,
        recordCount: posts.length,
        recordLimit: MAX_EXPORT_RECORDS,
        limitReached: archiveLimitReached,
        duplicateCardsMerged: duplicateMergedCount,
        prunedRecords
      },
      extractionNotes: {
        jobTitles: "Best-effort phrase-context extraction for export only; job titles are not classifier signals.",
        postAge: "Age and publish time are included only when visible in the page DOM; relative ages are approximate.",
        metrics: "Reaction, comment, repost, and view counts are included when exposed in the page DOM; unavailable values are null.",
        content: "contentComplete=false means the page did not expose the full post text during this monitor run."
      },
      posts
    };
  }

  function queueHistoryDelta(record) {
    if (!keepHistory || !record) return;
    pendingDelta.set(record.id, record);
    scheduleHistorySave();
  }

  function flushHistoryDelta(flushCoordinator = false) {
    clearTimeout(historySaveTimer);
    historySaveTimer = null;
    historySaveQueue = historySaveQueue.then(async () => {
      let response = { ok: true, flushed: 0 };
      const batch = Array.from(pendingDelta.values());
      if (batch.length && keepHistory) {
        response = await chrome.runtime.sendMessage({ type: "HISTORY_DELTA", monitorId: MONITOR_ID, records: batch });
        if (response?.ok) {
          for (const record of batch) {
            if (pendingDelta.get(record.id) === record) pendingDelta.delete(record.id);
          }
        }
      }
      if (flushCoordinator) {
        const flushed = await chrome.runtime.sendMessage({ type: "HISTORY_FLUSH", monitorId: MONITOR_ID });
        response = { ...response, ...flushed };
      }
      if (response && Number.isFinite(response.count)) historyCount = response.count;
      if (response && typeof response.limitReached === "boolean") historyLimitReached = response.limitReached;
      historyError = response?.ok === false ? response.error || "storage_unavailable" : null;
      return response;
    }).catch((error) => {
      historyError = "storage_unavailable";
      return { ok: false, error: historyError, message: String(error?.message || error) };
    });
    return historySaveQueue;
  }

  function scheduleHistorySave(immediate = false) {
    if (!keepHistory) return Promise.resolve({ ok: false, error: "history_disabled" });
    if (immediate) return flushHistoryDelta(false);
    clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(() => {
      historySaveTimer = null;
      void flushHistoryDelta(false);
    }, HISTORY_SAVE_DELAY_MS);
    return Promise.resolve({ ok: true, scheduled: true });
  }

  function configureHistory(options = {}) {
    const previousMode = historyMode;
    if (["off", "session", "persistent"].includes(options.historyMode)) historyMode = options.historyMode;
    else if (typeof options.keepHistory === "boolean") historyMode = options.keepHistory ? "persistent" : "off";
    keepHistory = historyMode !== "off";
    const requestedDays = Number(options.historyRetentionDays);
    if ([7, 30, 90].includes(requestedDays)) historyRetentionDays = requestedDays;
    if (previousMode !== historyMode) historyGeneration += 1;
    if (!keepHistory) {
      pendingDelta.clear();
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
    }
  }

  function ensureFilterStyle() {
    if (filterStyleBlocked) return;
    if (!filterStyle || !filterStyle.isConnected) {
      filterStyle = document.createElement("style");
      filterStyle.setAttribute("data-li-feed-hiring-filter-style", "true");
      filterStyle.textContent = '[data-li-feed-hiring-filter-hidden="true"]{display:none!important;}';
      (document.head || document.documentElement).appendChild(filterStyle);
      // Strict CSP can block the inline <style> silently; probe the rule with a throwaway
      // node and fall back to per-element inline hiding when it does not apply.
      const probe = document.createElement("span");
      probe.setAttribute("data-li-feed-hiring-filter-hidden", "true");
      (document.body || document.documentElement).appendChild(probe);
      const applied = window.getComputedStyle(probe).display === "none";
      probe.remove();
      if (!applied) {
        filterStyle.remove();
        filterStyle = null;
        filterStyleBlocked = true;
      }
    }
  }

  function showFilteredRoot(root) {
    if (filterStyleBlocked) root.style.removeProperty("display");
    else root.removeAttribute("data-li-feed-hiring-filter-hidden");
  }

  function hideFilteredRoot(root) {
    if (filterStyleBlocked) root.style.setProperty("display", "none", "important");
    else root.setAttribute("data-li-feed-hiring-filter-hidden", "true");
  }

  function reconcileFilterArtifacts(scope = document) {
    scope.querySelectorAll("[data-li-feed-hiring-filter-hidden='true']").forEach((node) => {
      node.removeAttribute("data-li-feed-hiring-filter-hidden");
      // A CSP-blocked pass may have left the inline fallback behind too.
      node.style.removeProperty("display");
    });
    scope.querySelectorAll("[data-li-feed-hiring-filter-style='true']").forEach((node) => node.remove());
    filteredRoots.clear();
    filterStyle = null;
  }

  function restoreHiddenPosts() {
    for (const root of filteredRoots) {
      if (root.isConnected) showFilteredRoot(root);
    }
    filteredRoots.clear();
    if (filterStyle) filterStyle.remove();
    filterStyle = null;
  }

  function setAutoExpand(value) {
    const next = value !== false;
    if (autoExpand && !next) {
      expansionQueue = [];
      queuedRoots = new WeakSet();
    }
    autoExpand = next;
  }

  function applyFeedFilter(root, category, partial) {
    if (!matchesOnly) {
      if (filteredRoots.has(root)) {
        showFilteredRoot(root);
        filteredRoots.delete(root);
      }
      return;
    }

    ensureFilterStyle();
    // Keep incomplete or uncertain cards visible until enough text is available.
    const show = partial || category === "partial" ||
      (category !== "none" && (activeFilter === "all" || category === activeFilter));
    if (show) {
      showFilteredRoot(root);
      filteredRoots.delete(root);
    } else {
      hideFilteredRoot(root);
      filteredRoots.add(root);
    }
  }

  function updatePost(root, allowOffscreen = false) {
    if (!monitoring || !root.isConnected || (!allowOffscreen && !isCardNearViewport(root))) return;
    if (!seenRoots.has(root)) {
      seenRoots.add(root);
      processedCount += 1;
    }

    const details = getPostTextDetails(root);
    const hrefs = getHrefs(root);
    // Sort the hrefs: LinkedIn reorders action links between renders, and an unsorted
    // fingerprint would invalidate the classification cache on every scan.
    const fingerprint = JSON.stringify([details.text, details.partial, [...hrefs].sort()]);
    domHealth.scannedCards += 1;
    if (details.body !== root) domHealth.textSelectorMatches += 1;
    else domHealth.textFallbacks += 1;
    if (details.control) domHealth.seeMoreControls += 1;
    if (details.sponsored) domHealth.sponsoredCards = (domHealth.sponsoredCards || 0) + 1;

    let cached = classificationCache.get(root);
    if (!cached || cached.fingerprint !== fingerprint) {
      const classification = classifier.classify(details.text, { hrefs, sponsored: details.sponsored });
      cached = {
        fingerprint,
        classification,
        category: details.partial && classification.category === "none" ? "partial" : classification.category
      };
      classificationCache.set(root, cached);
      scanStats.classifications += 1;
    } else scanStats.cacheHits += 1;
    const { classification, category } = cached;
    upsertExportRecord(root, details, classification, category);

    if (category === "none" || category === "partial") {
      results.delete(root);
    } else {
      results.set(root, {
        id: archiveKeys.get(root) || getArchiveKey(root, details.text),
        category,
        confidence: details.partial ? "partial" : classification.confidence,
        score: classification.score,
        evidence: classification.evidence,
        partial: details.partial,
        snippet: details.text.slice(0, 230),
        updatedAt: Date.now()
      });
      while (results.size > MAX_RESULTS) results.delete(results.keys().next().value);
    }

    applyFeedFilter(root, category, details.partial);
    if (details.partial && autoExpand && details.control && isElementVisible(details.control)) {
      queueExpansion(root, details.control);
    }
  }

  async function expandPost(root, initialDetails, options = {}) {
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    const waitMs = Math.max(0, Number(options.waitMs) || 0);
    const state = options.state || { attempts: 0, status: "pending" };
    if (state.status === "expanded" || state.status === "failed") {
      return { status: state.status, attempts: state.attempts, state };
    }
    let details = initialDetails;
    while (state.attempts < maxAttempts) {
      const control = details && details.control;
      const body = details && details.body;
      if (!root.isConnected || !control || !control.isConnected || !body || !isSeeMoreControl(control, body)) {
        state.status = "failed";
        break;
      }
      const clickGuard = control.closest("[role='dialog'],[role='menu'],nav,form");
      if (clickGuard) {
        // "Show more" controls outside post content (menus, dialogs, nav) do not expand the
        // post and clicking them could act on the user's session chrome.
        state.status = "failed";
        break;
      }
      const beforeText = body.textContent || "";
      const beforeLabel = normalizeLabel(control);
      // Hidden-tab passes still need refinement; downstream listeners gate on visibility.
      window.dispatchEvent(new Event("li-feed-auto-expand-start"));
      control.click();
      state.attempts += 1;
      await sleep(waitMs);
      // Some very long posts open a modal instead of expanding inline. Dismiss it (only a
      // dialog that is not the post itself) so the next attempt can find the inline control.
      const dialog = document.querySelector("[role='dialog']");
      if (dialog && !dialog.contains(root)) {
        const dismiss = dialog.querySelector("button[aria-label*='close' i],button[aria-label*='fermer' i],button[aria-label*='إغلاق']");
        if (dismiss) {
          dismiss.click();
          await sleep(waitMs);
        }
      }
      if (!root.isConnected) { state.status = "failed"; break; }
      const next = getPostTextDetails(root);
      const changed = (next.body.textContent || "") !== beforeText || !next.control || normalizeLabel(next.control) !== beforeLabel;
      if (changed && !next.partial) {
        state.status = "expanded";
        return { status: "expanded", attempts: state.attempts, state };
      }
      details = next;
    }
    state.status = "failed";
    return { status: "failed", attempts: state.attempts, state };
  }

  function queueExpansion(root, control) {
    if (!monitoring || !autoExpand || attemptedRoots.has(root) || queuedRoots.has(root)) return;
    if (expansionQueue.length >= MAX_QUEUE) return;
    queuedRoots.add(root);
    expansionQueue.push({ root, control });
    void runExpansionQueue();
  }

  async function runExpansionQueue() {
    if (expansionWorkerActive) return;
    expansionWorkerActive = true;
    const generation = monitorGeneration;

    while (monitoring && generation === monitorGeneration && autoExpand && expansionQueue.length) {
      const item = expansionQueue.shift();
      queuedRoots.delete(item.root);
      if (!item.root.isConnected || !item.control.isConnected || !isSeeMoreControl(item.control) || !isElementVisible(item.control)) continue;

      attemptedRoots.add(item.root);
      await expandPost(item.root, getPostTextDetails(item.root), { maxAttempts: 3, waitMs: 700 });
      if (monitoring && generation === monitorGeneration && item.root.isConnected) updatePost(item.root);
    }

    expansionWorkerActive = false;
    if (monitoring && autoExpand && expansionQueue.length) void runExpansionQueue();
  }

  function cleanDisconnectedResults() {
    for (const [root] of results) {
      if (!root.isConnected) results.delete(root);
    }
    for (const root of filteredRoots) {
      if (!root.isConnected) filteredRoots.delete(root);
    }
  }

  async function scan() {
    if (!monitoring) return;
    if (!isFeedPage()) {
      await stopMonitor();
      return;
    }
    if (scanning) {
      scanAgain = true;
      return;
    }

    scanning = true;
    const scanStartedAt = globalThis.performance?.now?.() ?? Date.now();
    scanStats.scans += 1;
    try {
      const roots = collectPostRoots();
      const background = document.visibilityState !== "visible";
      const candidates = background ? roots : roots.filter(isCardNearViewport);
      candidates.sort((a, b) => Number(dirtyRoots.has(b)) - Number(dirtyRoots.has(a)));
      domHealth.checks += 1;
      domHealth.postRootsFound = roots.length;
      domHealth.scannedCards = 0;
      domHealth.textSelectorMatches = 0;
      domHealth.textFallbacks = 0;
      domHealth.seeMoreControls = 0;
      domHealth.sponsoredCards = 0;
      for (let offset = 0; offset < candidates.length; offset += 25) {
        const batch = candidates.slice(offset, offset + 25);
        for (const root of batch) {
          if (dirtyRoots.has(root)) scanStats.dirtyProcessed += 1;
          updatePost(root, background);
          dirtyRoots.delete(root);
        }
        scanStats.batches += 1;
        if (offset + 25 < candidates.length) await sleep(0);
      }
      domHealth.lastScanAt = new Date().toISOString();
      if (!roots.length) {
        domHealth.level = domHealth.checks >= 3 ? "warning" : "checking";
        domHealth.message = domHealth.checks >= 3
          ? "No feed post cards matched. LinkedIn may have changed its page structure."
          : "Checking the feed for post cards…";
      } else if (domHealth.textSelectorMatches === 0 && domHealth.textFallbacks > 0) {
        domHealth.level = "partial";
        domHealth.message = `Found ${roots.length} card(s); using card-level text fallback. Inspect DOM compatibility if results look incomplete.`;
      } else {
        domHealth.level = "ok";
        domHealth.message = `${roots.length} post card(s) matched; ${domHealth.scannedCards} inspected${background ? " in the background tab" : " near the viewport"}; text selectors ${domHealth.textSelectorMatches}, fallback ${domHealth.textFallbacks}, see-more controls ${domHealth.seeMoreControls}.`;
      }
      cleanDisconnectedResults();
    } finally {
      const duration = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - scanStartedAt);
      scanStats.lastScanMs = duration;
      scanStats.totalScanMs += duration;
      scanStats.maxScanMs = Math.max(scanStats.maxScanMs, duration);
      scanning = false;
    }
    if (scanAgain) {
      scanAgain = false;
      scheduleScan(50);
    } else scheduleScan(document.visibilityState !== "visible" ? 5_000 : 1_800);
  }

  function scheduleScan(delay = 250) {
    if (!monitoring || scheduledScan !== null) return;
    scheduledScan = setTimeout(() => {
      scheduledScan = null;
      void scan();
    }, delay);
  }

  function markDirtyFromMutations(mutations) {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      const root = target ? findPostRoot(target) : null;
      if (root) dirtyRoots.add(root);
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType !== 1) continue;
        const ownRoot = findPostRoot(node);
        if (ownRoot) dirtyRoots.add(ownRoot);
        for (const addedRoot of findPostRootsInScope(node)) dirtyRoots.add(addedRoot);
      }
    }
  }

  // An opening the page reports as months old may no longer be an active vacancy. Age is only
  // used when the DOM exposed it; nothing is guessed when it did not.
  function isStaleOpening(record) {
    if (!record || record.category !== "open_role") return false;
    const days = Number(record.postAge?.ageDaysApprox);
    return Number.isFinite(days) && days > STALE_OPENING_AGE_DAYS;
  }

  function summarizePostAge(postAge) {
    if (!postAge || typeof postAge !== "object") return null;
    const days = Number(postAge.ageDaysApprox);
    const label = postAge.label || null;
    const publishedAt = postAge.publishedAt || null;
    if (!label && !publishedAt && !Number.isFinite(days)) return null;
    return { label, publishedAt, ageDaysApprox: Number.isFinite(days) ? days : null };
  }

  function summarizeRecord(record) {
    return {
      id: record.id,
      category: record.category,
      confidence: record.confidence,
      score: record.score,
      evidence: Array.isArray(record.evidence) ? record.evidence.slice(0, 4) : [],
      snippet: String(record.fullText || "").slice(0, 230),
      author: record.author || { name: null, profileUrl: null },
      permalink: record.permalink || null,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      contentComplete: record.contentComplete !== false,
      extractionStatus: record.extractionStatus || (record.contentComplete === false ? "partial" : "complete"),
      metrics: record.metrics || null,
      postAge: summarizePostAge(record.postAge),
      stale: isStaleOpening(record)
    };
  }

  /**
   * Cache the popup's pipeline marks and previous-run baseline. Called from the message
   * handler and from storage changes so a monitor that was already running when the popup
   * changed a mark re-filters immediately.
   */
  function configurePipeline(options = {}) {
    if (options.pipeline && typeof options.pipeline === "object") {
      pipelineStates = shared.sanitizePipeline(options.pipeline);
    }
    if (Object.hasOwn(options, "baselineAt")) {
      pipelineBaselineAt = Number.isFinite(Date.parse(options.baselineAt || "")) ? options.baselineAt : null;
    }
    if (shared.PIPELINE_FILTERS.includes(options.filter)) pipelineFilter = options.filter;
    return { pipelineFilter, pipelineBaselineAt };
  }

  /**
   * The baseline is the previous run's start, not its end: posts the last run already
   * surfaced must not be reported as new again. First run has no earlier start, so the
   * baseline stays null and every detection counts as new.
   */
  function stampRunBaseline() {
    if (!chrome.storage?.local) return;
    void (async () => {
      try {
        const stored = await chrome.storage.local.get({ hiringRunStartedAt: null, hiringLastRunAt: null });
        const previous = Number.isFinite(Date.parse(stored.hiringRunStartedAt || ""))
          ? stored.hiringRunStartedAt
          : Number.isFinite(Date.parse(stored.hiringLastRunAt || "")) ? stored.hiringLastRunAt : null;
        pipelineBaselineAt = previous;
        await chrome.storage.local.set({ hiringLastRunAt: previous, hiringRunStartedAt: new Date().toISOString() });
      } catch (_error) {
        // Storage may be unavailable; the in-memory baseline still keeps this run coherent.
      }
    })();
  }

  function queryRecords(records, query = {}) {
    const filter = shared.FILTERS.includes(query.filter) ? query.filter : "all";
    const search = classifier.normalizeText(query.search || "");
    const pipelineView = shared.PIPELINE_FILTERS.includes(query.pipelineFilter) ? query.pipelineFilter : pipelineFilter;
    const filtered = shared.applyPipelineFilter(Array.from(records || []).filter((record) => {
      if (!record || (filter !== "all" && record.category !== filter)) return false;
      if (!search) return true;
      const haystack = classifier.normalizeText([
        record.fullText, record.category, record.author?.name,
        ...(record.evidence || []), ...(record.extracted?.jobTitles || []), ...(record.extracted?.hashtags || [])
      ].join(" "));
      return haystack.includes(search);
    }), { filter: pipelineView, states: pipelineStates, baselineAt: pipelineBaselineAt });
    // "relevance" is the default view: active openings first, then the remaining categories in
    // review order, freshest post first inside a category. Chronological sorts stay chronological
    // so an explicit user choice is honoured exactly.
    const sort = SORT_MODES.includes(query.sort) ? query.sort : "relevance";
    const direction = sort === "oldest" ? 1 : -1;
    filtered.sort((a, b) => {
      const aTime = Date.parse(a.lastSeenAt || a.firstSeenAt || "") || 0;
      const bTime = Date.parse(b.lastSeenAt || b.firstSeenAt || "") || 0;
      if (sort === "relevance") {
        const rank = (CATEGORY_RANK[a.category] ?? 99) - (CATEGORY_RANK[b.category] ?? 99);
        if (rank) return rank;
        const staleness = Number(isStaleOpening(a)) - Number(isStaleOpening(b));
        if (staleness) return staleness;
        const aAge = Number(a.postAge?.ageDaysApprox);
        const bAge = Number(b.postAge?.ageDaysApprox);
        if (Number.isFinite(aAge) && Number.isFinite(bAge) && aAge !== bAge) return aAge - bAge;
        return (bTime - aTime) || String(a.id).localeCompare(String(b.id));
      }
      return direction * (aTime - bTime) || String(a.id).localeCompare(String(b.id));
    });
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(query.page) || 1));
    const start = (page - 1) * pageSize;
    return {
      results: filtered.slice(start, start + pageSize).map(summarizeRecord),
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total
    };
  }

  function getStatus(query = {}) {
    cleanDisconnectedResults();
    const counts = Object.fromEntries(shared.CATEGORIES.map((category) => [category, 0]));
    const archive = Array.from(exportRecords.values());
    for (const record of archive) if (Object.hasOwn(counts, record.category)) counts[record.category] += 1;
    const page = queryRecords(archive, { ...query, filter: query.filter || activeFilter });
    return {
      supported: true,
      isFeed: isFeedPage(),
      ok: true,
      monitoring,
      autoExpand,
      activeFilter,
      matchesOnly,
      processedCount,
      archiveCount: exportRecords.size,
      archiveLimit: MAX_EXPORT_RECORDS,
      archiveLimitReached,
      duplicateMergedCount,
      historyMode,
      historyRetentionDays,
      historyCount,
      historyLimitReached,
      historyError,
      scan: { ...scanStats },
      domHealth: {
        ...domHealth,
        background: document.visibilityState !== "visible",
        postsWithAge: archive.filter((record) => record.postAge?.label || record.postAge?.publishedAt).length,
        postsWithMetrics: archive.filter((record) => Object.values(record.metrics || {}).some((count) => count !== null && count !== undefined)).length
      },
      counts,
      pipelineFilter,
      pipelineBaselineAt,
      pipelineCounts: shared.pipelineCounts(archive, { states: pipelineStates, baselineAt: pipelineBaselineAt }),
      ...page
    };
  }

  function startMonitor(options = {}) {
    reconcileFilterArtifacts();
    if (!isFeedPage()) return { supported: true, isFeed: false, ok: false, error: "open_feed", message: "Open the LinkedIn feed first." };
    const nextFilter = typeof options.filter === "string" ? options.filter : activeFilter;
    const nextMatchesOnly = options.matchesOnly === true;
    if (activeFilter !== nextFilter || matchesOnly !== nextMatchesOnly) restoreHiddenPosts();
    setAutoExpand(options.autoExpand);
    configureHistory(options);
    activeFilter = nextFilter;
    matchesOnly = nextMatchesOnly;

    if (!monitoring) {
      monitorGeneration += 1;
      monitoring = true;
      stampRunBaseline();
      if (matchesOnly) ensureFilterStyle();
      results.clear();
      exportRecords.clear();
      archiveKeys = new WeakMap();
      archiveRootCounts = new Map();
      archiveLimitReached = false;
      duplicateMergedCount = 0;
      prunedRecords = 0;
      monitorStartedAt = new Date().toISOString();
      monitorStoppedAt = null;
      processedCount = 0;
      pendingDelta.clear();
      dirtyRoots.clear();
      historyError = null;
      Object.assign(scanStats, { scans: 0, batches: 0, classifications: 0, cacheHits: 0, dirtyProcessed: 0, lastScanMs: 0, totalScanMs: 0, maxScanMs: 0 });
      domHealth = {
        checks: 0, postRootsFound: 0, scannedCards: 0, textSelectorMatches: 0,
        textFallbacks: 0, seeMoreControls: 0, postsWithAge: 0, postsWithMetrics: 0,
        lastScanAt: null, level: "checking", message: "Checking the LinkedIn feed DOM…"
      };
      seenRoots = new WeakSet();
      attemptedRoots = new WeakSet();
      queuedRoots = new WeakSet();
      expansionQueue = [];

      // Observe body so the monitor survives LinkedIn's single-page route changes;
      // hidden-tab passes inspect loaded cards only and never scroll the page.
      const scope = document.body;
      if (scope) {
        observer = new MutationObserver((mutations) => {
          markDirtyFromMutations(mutations);
          scheduleScan(220);
        });
        observer.observe(scope, { childList: true, subtree: true, characterData: true });
      }
      scrollListener = () => scheduleScan(180);
      visibilityListener = () => scheduleScan(document.visibilityState === "visible" ? 80 : 160);
      document.addEventListener("scroll", scrollListener, { capture: true, passive: true });
      document.addEventListener("visibilitychange", visibilityListener);
      scheduleScan(40);
    } else {
      if (matchesOnly) ensureFilterStyle();
      scheduleScan(40);
    }
    return { supported: true, isFeed: true, ok: true, status: getStatus() };
  }

  async function stopMonitor() {
    if (monitoring) monitorStoppedAt = new Date().toISOString();
    monitoring = false;
    monitorGeneration += 1;
    restoreHiddenPosts();
    reconcileFilterArtifacts();
    if (observer) observer.disconnect();
    observer = null;
    if (scrollListener) document.removeEventListener("scroll", scrollListener, true);
    if (visibilityListener) document.removeEventListener("visibilitychange", visibilityListener);
    scrollListener = null;
    visibilityListener = null;
    clearTimeout(scheduledScan);
    scheduledScan = null;
    expansionQueue = [];
    const flushed = await flushHistoryDelta(true);
    return {
      supported: true,
      isFeed: isFeedPage(),
      ok: flushed?.ok !== false,
      ...(flushed?.ok === false ? { error: flushed.error || "storage_unavailable" } : {}),
      status: getStatus()
    };
  }

  function setOptions(options = {}) {
    const nextFilter = typeof options.filter === "string" ? options.filter : activeFilter;
    const nextMatchesOnly = typeof options.matchesOnly === "boolean" ? options.matchesOnly : matchesOnly;
    if (activeFilter !== nextFilter || matchesOnly !== nextMatchesOnly) restoreHiddenPosts();
    configureHistory(options);
    if (typeof options.autoExpand === "boolean") setAutoExpand(options.autoExpand);
    activeFilter = nextFilter;
    matchesOnly = nextMatchesOnly;
    if (monitoring && matchesOnly) ensureFilterStyle();
    if (monitoring) scheduleScan(50);
    return { supported: true, isFeed: isFeedPage(), ok: true, status: getStatus() };
  }

  const monitorApi = {
    isSeeMoreControl,
    isLikelyPostRoot,
    findPostRootsInScope,
    collectPostRoots,
    getStableId,
    getPostTextDetails,
    extractPostRecord,
    expandPost,
    reconcileFilterArtifacts,
    getPostAge,
    parseMetricNumber,
    parseMetricCount,
    getPostPermalink,
    getAuthorDetails,
    getArchiveKey,
    queryRecords,
    startMonitor,
    stopMonitor,
    setOptions,
    scan,
    scheduleScan,
    updatePost,
    getStatus,
    getExportPayload,
    flushHistoryDelta
  };
  globalThis.__LI_FEED_HIRING_MONITOR__ = monitorApi;
  if (typeof module !== "undefined" && module.exports) module.exports = monitorApi;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    switch (message.type) {
      case "GET_HIRING_STATUS":
        sendResponse(getStatus(message.query || {}));
        return false;
      case "GET_HIRING_POST": {
        const post = exportRecords.get(String(message.id || ""));
        sendResponse(post ? { ok: true, post } : { ok: false, error: "not_found" });
        return false;
      }
      case "EXPORT_HIRING_POSTS":
        sendResponse(getExportPayload());
        return false;
      case "START_HIRING_MONITOR":
        sendResponse(startMonitor(message.options || {}));
        return false;
      case "STOP_HIRING_MONITOR":
        void stopMonitor().then(sendResponse);
        return true;
      case "SET_HIRING_OPTIONS":
        sendResponse(setOptions(message.options || {}));
        return false;
      case "SET_HIRING_FILTER": {
        const nextFilter = typeof message.filter === "string" ? message.filter : "all";
        const nextMatchesOnly = typeof message.matchesOnly === "boolean" ? message.matchesOnly : matchesOnly;
        if (activeFilter !== nextFilter || matchesOnly !== nextMatchesOnly) restoreHiddenPosts();
        activeFilter = nextFilter;
        matchesOnly = nextMatchesOnly;
        if (monitoring && matchesOnly) ensureFilterStyle();
        if (monitoring) scheduleScan(50);
        sendResponse({ supported: true, isFeed: isFeedPage(), ok: true, status: getStatus() });
        return false;
      }
      case "SET_HIRING_PIPELINE":
        configurePipeline({
          pipeline: message.pipeline,
          baselineAt: message.baselineAt,
          filter: message.filter
        });
        sendResponse({ supported: true, isFeed: isFeedPage(), ok: true, status: getStatus() });
        return false;
      default:
        return false;
    }
  });

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const preferences = changes.hiringPreferences?.newValue;
      if (preferences && typeof preferences === "object") {
        configureHistory({
          historyMode: preferences.historyMode,
          historyRetentionDays: preferences.historyRetentionDays
        });
        if (shared.PIPELINE_FILTERS.includes(preferences.pipelineFilter)) pipelineFilter = preferences.pipelineFilter;
      }
      if (changes.hiringPipeline) configurePipeline({ pipeline: changes.hiringPipeline.newValue });
      if (changes.hiringLastRunAt) configurePipeline({ baselineAt: changes.hiringLastRunAt.newValue });
      if (changes.hiringPipeline || changes.hiringLastRunAt || preferences) {
        if (monitoring) scheduleScan(50);
      }
    });
  }
})();
