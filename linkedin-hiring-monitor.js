(() => {
  "use strict";

  const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
  if (!classifier) throw new Error("The local hiring classifier must load before the feed monitor.");

  const MAX_RESULTS = 80;
  const MAX_EXPORT_RECORDS = 1000;
  const MAX_HISTORY_RECORDS = 500;
  const MAX_HISTORY_BYTES = 3_000_000;
  const HISTORY_SAVE_DELAY_MS = 4_000;
  const METRICS_REFRESH_MS = 30_000;
  const MAX_QUEUE = 16;
  const MORE_LABELS = [
    "see more", "show more", "voir plus", "afficher plus", "عرض المزيد", "ver mas", "mostrar mas",
    "mehr anzeigen", "ver mais", "mostrar mais", "vedi altro", "mostra altro", "meer weergeven",
    "daha fazla gor", "daha fazla goster"
  ];

  let monitoring = false;
  let autoExpand = true;
  let activeFilter = "all";
  let matchesOnly = false;
  let monitorGeneration = 0;
  let filterStyle = null;
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
  let monitorStartedAt = null;
  let monitorStoppedAt = null;
  let processedCount = 0;
  let keepHistory = false;
  let historyRetentionDays = 30;
  let historyRecords = [];
  let historyLoaded = false;
  let historyLoadPromise = Promise.resolve();
  let historyGeneration = 0;
  let historySaveTimer = null;
  let historySaveQueue = Promise.resolve();
  let historyLimitReached = false;
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

  function isFeedPage() {
    return location.hostname === "www.linkedin.com" &&
      (location.pathname === "/" || /^\/feed(?:\/|$)/.test(location.pathname));
  }

  function normalizeLabel(element) {
    return classifier.normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.innerText || element.textContent || ""}`);
  }

  function isSeeMoreControl(element) {
    const label = normalizeLabel(element);
    return MORE_LABELS.some((phrase) => label.includes(classifier.normalizeText(phrase)));
  }

  function isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < (window.innerHeight || 768);
  }

  function isCardNearViewport(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || 768;
    return rect.width > 0 && rect.height > 0 && rect.bottom > -120 && rect.top < height * 1.3;
  }

  function isFeedListItem(element) {
    if ((element.getAttribute("role") || "").toLowerCase() !== "listitem") return false;
    const textLength = cleanText(element.innerText || element.textContent || "").length;
    if (textLength < 80 || textLength > 15_000) return false;
    const buttonCount = element.querySelectorAll("button,[role='button']").length;
    const linkCount = element.querySelectorAll("a[href]").length;
    return buttonCount >= 1 && linkCount >= 2;
  }

  function isLikelyPostRoot(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    const className = typeof element.className === "string" ? element.className.toLowerCase() : "";
    const role = (element.getAttribute("role") || "").toLowerCase();
    const urn = element.getAttribute("data-urn") || "";
    const dataId = element.getAttribute("data-id") || "";
    const testId = (element.getAttribute("data-test-id") || "").toLowerCase();
    const viewName = (element.getAttribute("data-view-name") || "").toLowerCase();
    const knownCardClass = /feed-shared-update-v2|occludable-update|feed[-\w]*(?:update|post)|(?:post|update)[-\w]*card|card[-\w]*(?:post|update)/.test(className);
    const postUrn = /urn:li:(activity|share|ugcpost):/i.test(urn) || /urn:li:(activity|share|ugcpost):/i.test(dataId);
    const feedView = /feed.*(update|post)|(update|post).*feed/.test(viewName);
    const feedTestId = /feed.*(update|post)|(update|post).*feed/.test(testId);
    return element.tagName === "ARTICLE" || role === "article" || knownCardClass || postUrn || feedView || feedTestId || isFeedListItem(element);
  }

  function findPostRoot(element) {
    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 18) {
      if (isLikelyPostRoot(current)) return current;
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function findPostRootsInScope(scope) {
    if (!scope) return [];
    const selector = "article,[role='article'],[role='listitem'],[data-urn],[data-id*='urn:li:'],[data-view-name*='feed']," +
      "[class*='feed-shared-update-v2'],[class*='occludable-update'],[class*='feed-post'],[class*='feed-update']," +
      "[class*='post-card'],[class*='update-card'],[data-test-id*='feed-update'],[data-test-id*='feed-post']";
    const candidates = scope.querySelectorAll(selector);
    const roots = new Set();
    for (const candidate of candidates) {
      const root = findPostRoot(candidate);
      if (root && scope.contains(root)) roots.add(root);
    }
    return Array.from(roots);
  }

  function collectPostRoots() {
    const scope = document.querySelector("[role='main'],main") || document.body;
    const roots = findPostRootsInScope(scope);
    // LinkedIn sometimes places the feed cards outside its current <main> wrapper.
    if (!roots.length && scope && scope !== document.body) return findPostRootsInScope(document.body);
    return roots;
  }

  function findSeeMore(root) {
    return Array.from(root.querySelectorAll("button,[role='button']"))
      .find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true" && isSeeMoreControl(button));
  }

  function findBodyNode(root, control = null) {
    const selectors = [
      '[class*="feed-shared-update-v2__description-wrapper"]',
      '[data-test-id*="post-text"]',
      '[data-test-id*="update-text"]',
      '[class*="feed-shared-text"]',
      '[class*="inline-show-more-text"]',
      '[class*="update__description"]'
    ];
    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector))
        .filter((node) => !node.querySelector("article,[role='article']"))
        .sort((a, b) => (b.textContent || "").length - (a.textContent || "").length);
      if (nodes.length) return nodes[0];
    }

    if (control) {
      const controlTextLength = (control.innerText || control.textContent || "").length;
      let current = control.parentElement;
      let depth = 0;
      while (current && current !== root && depth < 10) {
        const className = typeof current.className === "string" ? current.className.toLowerCase() : "";
        const textLength = (current.innerText || current.textContent || "").length;
        if (/description|feed-shared-text|inline-show-more-text/.test(className) &&
            !/see-more-less-toggle/.test(className) && textLength > controlTextLength + 20) return current;
        current = current.parentElement;
        depth += 1;
      }
    }
    return root;
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200B-\u200F\uFEFF]/g, "")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getPostTextDetails(root) {
    const control = findSeeMore(root);
    const body = findBodyNode(root, control);
    const visibleText = cleanText(body.innerText || body.textContent || "");
    const rawText = cleanText(body.textContent || visibleText);
    const style = window.getComputedStyle(body);
    const hasHiddenTextInDom = rawText.length > visibleText.length + 24;
    const clampValue = style.webkitLineClamp || style.lineClamp || "none";
    const hasVisualClamp = Boolean(clampValue && clampValue !== "none" && clampValue !== "0");
    const hasOverflowingText = body.scrollHeight > body.clientHeight + 10 || hasVisualClamp;
    const fullTextAvailableWithoutExpansion = !control || hasHiddenTextInDom || hasOverflowingText;
    const text = hasHiddenTextInDom ? rawText : visibleText;

    return {
      text,
      control,
      body,
      partial: Boolean(control && !fullTextAvailableWithoutExpansion),
      fullTextAvailableWithoutExpansion
    };
  }

  function getHrefs(root) {
    return Array.from(root.querySelectorAll("a[href]"), (anchor) => anchor.getAttribute("href") || anchor.href || "");
  }

  function getStableId(root) {
    const urn = root.getAttribute("data-urn");
    const id = root.getAttribute("data-id");
    return String(urn || id || "").slice(0, 100);
  }

  const GENERIC_TITLE_LABELS = new Set([
    "role", "roles", "open role", "roles available", "position", "positions", "open position", "position available",
    "job", "jobs", "job opening", "job openings", "opening", "openings", "vacancy", "vacancies",
    "candidate", "candidates", "employee", "employees", "poste", "postes",
    "emploi", "emplois", "candidat", "candidats", "profil", "profils", "وظيفة", "وظائف", "منصب",
    "مناصب", "موظف", "موظفين", "مرشح", "مرشحين"
  ].map((value) => classifier.normalizeText(value)));

  function cleanJobTitleCandidate(value) {
    let title = cleanText(value)
      .replace(/^[\s:：—–-]+|[\s:：—–-]+$/gu, "")
      .replace(/^(?:a|an|the|un|une|des|les|du|de la)\s+/iu, "")
      .replace(/\s+(?:apply|send|email|contact|postulez|envoyez)\b.*$/iu, "")
      .replace(/\s+(?:للتقديم|للتوظيف|أرسل|ارسل|يرجى)(?:\s+.*)?$/u, "")
      .trim();
    if (title.length < 3 || title.length > 90) return null;
    const normalized = classifier.normalizeText(title);
    if (!normalized || GENERIC_TITLE_LABELS.has(normalized)) return null;
    if (/^(?:candidate|candidates|candidat|candidats|موظف|موظفين|مرشح|مرشحين)\b/u.test(normalized)) return null;
    return title;
  }

  function extractJobTitleCandidates(text) {
    // Export-only phrase extraction. These candidates never affect classification.
    const patterns = [
      /\b(?:hiring|recruiting)\s+for\s+(?:an?\s+|the\s+)?([^,\n،;.!?|]{2,100})/giu,
      /\b(?:looking\s+to\s+hire|seeking|we\s+need|we(?:'|’)re\s+looking\s+for|we\s+are\s+looking\s+for)\s+(?:an?\s+|the\s+)?([^,\n،;.!?|]{2,100})/giu,
      /\b(?:open\s+(?:role|position)|job\s+opening|(?:job|role|position)\s+title)\s*(?:[:：—–-]\s*|for\s+)([^,\n،;.!?|]{2,100})/giu,
      /\b(?:now\s+hiring|hiring\s+now)\s*[:：—–-]\s*([^,\n،;.!?|]{2,100})/giu,
      /\b(?:nous\s+recherchons|nous\s+recrutons|recherchons|recrutons|nous\s+cherchons)\s+(?:(?:un|une|des|les)\s+)?([^,\n،;.!?|]{2,100})/giu,
      /\bpostes?\s+(?:de|à\s+pourvoir\s*[:：—–-]\s*)([^,\n،;.!?|]{2,100})/giu,
      /(?:مطلوب(?:ة)?(?:\s+للعمل)?|نبحث عن|نحتاج إلى|نحتاج)\s+([^\n،,؛;.!?|]{2,100})/gu,
      /(?:وظيفة شاغرة|منصب شاغر)\s*[:：—–-]?\s*([^\n،,؛;.!?|]{2,100})/gu
    ];
    const candidates = new Map();
    for (const pattern of patterns) {
      for (const match of String(text || "").matchAll(pattern)) {
        const title = cleanJobTitleCandidate(match[1]);
        if (title) candidates.set(classifier.normalizeText(title), title);
      }
    }
    return Array.from(candidates.values()).slice(0, 12);
  }

  function extractHashtags(text) {
    const tags = new Map();
    for (const match of String(text || "").matchAll(/#([\p{L}\p{N}_]+)/gu)) {
      const tag = match[1];
      const normalized = classifier.normalizeText(tag);
      if (normalized && !tags.has(normalized)) tags.set(normalized, tag);
    }
    return Array.from(tags.values()).slice(0, 50);
  }

  function toAbsoluteHttpUrl(value) {
    try {
      const url = new URL(String(value || ""), location.origin);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (_error) {
      return null;
    }
  }

  function extractPostLinks(hrefs) {
    return Array.from(new Set(hrefs.map(toAbsoluteHttpUrl).filter(Boolean))).slice(0, 40);
  }

  function extractPostEmails(text, hrefs) {
    const emails = new Set(classifier.extractEmails(text));
    for (const href of hrefs) {
      if (!/^mailto:/i.test(href)) continue;
      let addressText = href.replace(/^mailto:/i, "").split("?")[0];
      try { addressText = decodeURIComponent(addressText); } catch (_error) { /* Keep the raw address if malformed. */ }
      for (const email of classifier.extractEmails(addressText)) emails.add(email);
    }
    return Array.from(emails);
  }

  function getPostPermalink(root, hrefs = getHrefs(root)) {
    for (const href of hrefs) {
      const absolute = toAbsoluteHttpUrl(href);
      if (absolute && /\/(?:feed\/update|posts)\/|activity[-/]/i.test(absolute)) return absolute;
    }
    return null;
  }

  function getAuthorDetails(root, hrefs = getHrefs(root)) {
    const nameSelectors = [
      ".update-components-actor__name", ".feed-shared-actor__name", "[data-test-id*='actor-name']"
    ];
    let name = null;
    for (const selector of nameSelectors) {
      const node = Array.from(root.querySelectorAll(selector))
        .find((item) => cleanText(item.innerText || item.textContent || "").length > 1);
      if (node) {
        name = cleanText(node.innerText || node.textContent || "").slice(0, 120);
        break;
      }
    }
    let profileUrl = null;
    for (const href of hrefs) {
      const absolute = toAbsoluteHttpUrl(href);
      if (absolute && /linkedin\.com\/(?:in|company)\//i.test(absolute)) {
        profileUrl = absolute;
        break;
      }
    }
    return { name, profileUrl };
  }

  function asciiDigits(value) {
    return String(value || "")
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  }

  function findAgeLabel(value) {
    const text = asciiDigits(cleanText(value));
    const patterns = [
      /\b(?:just now|a few seconds ago|yesterday)\b/iu,
      /\b(?:\d+|a|an)\s*(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|wk|w|months?|mo|years?|yrs?|yr|y)(?:\s+ago)?\b/iu,
      /\b(?:il y a\s+)?(?:\d+|un|une)\s*(?:secondes?|s|minutes?|min|heures?|h|jours?|j|semaines?|sem|mois|ans?|années?)(?:\s+ago)?\b/iu,
      /(?:منذ\s*)?\d+\s*(?:ثانية|ثواني?|دقيقة|دقائق|ساعة|ساعات|يوم|أيام|اسبوع|أسابيع|شهر|أشهر|سنة|سنوات)/u,
      /(?:à l'instant|اليوم|أمس|الآن)/iu
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0].trim();
    }
    return null;
  }

  function parseApproxAgeSeconds(label) {
    if (!label) return null;
    const normalized = classifier.normalizeText(asciiDigits(label));
    if (/just now|a few seconds|a l instant|maintenant|الان|اليوم/u.test(normalized)) return 0;
    if (/yesterday|hier|امس/u.test(normalized)) return 86_400;

    const numberMatch = normalized.match(/(?:il y a\s*|منذ\s*)?(\d+|un|une|a|an)\s*(.*)/u);
    if (!numberMatch) return null;
    const amount = /^\d+$/u.test(numberMatch[1]) ? Number(numberMatch[1]) : 1;
    const unit = numberMatch[2];
    if (/^(?:s|sec|secs|second|seconds|seconde|secondes|ثانية|ثوان)/u.test(unit)) return amount;
    if (/^(?:m|min|mins|minute|minutes|دقيقة|دقائق)/u.test(unit)) return amount * 60;
    if (/^(?:h|hr|hrs|hour|hours|heure|heures|ساعة|ساعات)/u.test(unit)) return amount * 3600;
    if (/^(?:d|day|days|jour|jours|يوم|أيام)/u.test(unit)) return amount * 86_400;
    if (/^(?:w|wk|wks|week|weeks|semaine|semaines|أسبوع|أسابيع)/u.test(unit)) return amount * 604_800;
    if (/^(?:mo|month|months|mois|شهر|أشهر)/u.test(unit)) return amount * 2_592_000;
    if (/^(?:y|yr|yrs|year|years|an|ans|année|années|سنة|سنوات)/u.test(unit)) return amount * 31_536_000;
    return null;
  }

  function isCommentThreadNode(node, root) {
    let current = node;
    let depth = 0;
    while (current && current !== root && depth < 10) {
      const className = typeof current.className === "string" ? current.className.toLowerCase() : "";
      if (/comment-item|feed-shared-comment|comments-comment|comment-timestamp/.test(className)) return true;
      current = current.parentElement;
      depth += 1;
    }
    return false;
  }

  function getPostAge(root, capturedAtMs) {
    const primaryNodes = Array.from(root.querySelectorAll("time,[datetime],[class*='sub-description'],[class*='timestamp']"))
      .filter((node) => !isCommentThreadNode(node, root));
    const nodes = primaryNodes.some((node) => findAgeLabel(`${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.innerText || node.textContent || ""}`))
      ? primaryNodes
      : [...primaryNodes, ...Array.from(root.querySelectorAll("[aria-label]")).filter((node) => !isCommentThreadNode(node, root))];
    let label = null;
    let publishedAt = null;
    for (const node of nodes) {
      const dateValue = node.getAttribute("datetime") || node.getAttribute("data-timestamp");
      if (dateValue && !publishedAt) {
        const parsed = Date.parse(dateValue);
        if (Number.isFinite(parsed)) publishedAt = new Date(parsed).toISOString();
      }
      const candidate = findAgeLabel(`${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.innerText || node.textContent || ""}`);
      if (candidate && (!label || candidate.length < label.length)) label = candidate;
    }
    const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
    const ageSecondsApprox = Number.isFinite(publishedMs)
      ? Math.max(0, Math.floor((capturedAtMs - publishedMs) / 1000))
      : parseApproxAgeSeconds(label);
    return {
      label,
      publishedAt,
      ageSecondsApprox,
      ageDaysApprox: ageSecondsApprox === null ? null : Math.round((ageSecondsApprox / 86_400) * 100) / 100
    };
  }

  function parseMetricNumber(value) {
    const text = asciiDigits(value).toLowerCase();
    const match = text.match(/(\d[\d.,]*)(?:\s*([kmb]))?/i);
    if (!match) return null;
    let numberText = match[1];
    const suffix = match[2] || "";
    if (numberText.includes(",") && numberText.includes(".")) numberText = numberText.replace(/,/g, "");
    else if (numberText.includes(",")) {
      const decimals = numberText.length - numberText.lastIndexOf(",") - 1;
      numberText = suffix && decimals <= 2 ? numberText.replace(",", ".") : numberText.replace(/,/g, "");
    } else if (!suffix && /\.\d{3}$/u.test(numberText)) numberText = numberText.replace(/\./g, "");
    const number = Number(numberText);
    if (!Number.isFinite(number)) return null;
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    return Math.round(number * multiplier);
  }

  function parseMetricCount(value, metricPattern) {
    const text = asciiDigits(value).toLowerCase();
    const metricMatch = text.match(metricPattern);
    if (!metricMatch) return null;
    const before = text.slice(0, metricMatch.index);
    const after = text.slice(metricMatch.index + metricMatch[0].length);
    const numberAfter = after.match(/^\s*(?:[:(·—-]\s*)?(\d[\d.,]*\s*[kmb]?)/i);
    if (numberAfter) return parseMetricNumber(numberAfter[1]);
    const numberBefore = Array.from(before.matchAll(/(\d[\d.,]*\s*[kmb]?)/gi));
    return numberBefore.length ? parseMetricNumber(numberBefore[numberBefore.length - 1][1]) : null;
  }

  function getPostMetrics(root) {
    const nodes = Array.from(root.querySelectorAll("[aria-label],[title],button,[role='button'],[class*='social-count']"));
    const metricPatterns = {
      reactions: /reactions?|likes?|réactions?|j['’]aime|تفاعل|إعجاب|اعجاب/iu,
      comments: /comments?|commentaires?|تعليقات|تعليق/iu,
      reposts: /reposts?|shares?|partages?|إعادة النشر|إعادة نشر|مشاركة/iu,
      views: /impressions?|views?|vues?|مشاهدات|مرات الظهور/iu
    };
    const metrics = {};
    for (const [metric, pattern] of Object.entries(metricPatterns)) {
      let count = null;
      for (const node of nodes) {
        const className = typeof node.className === "string" ? node.className : "";
        const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${className} ${node.innerText || node.textContent || ""}`;
        if (!pattern.test(label)) continue;
        count = parseMetricCount(label, pattern);
        if (count !== null) break;
      }
      metrics[metric] = count;
    }
    return metrics;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function getArchiveKey(root, text) {
    const stableId = getStableId(root);
    if (stableId) return `urn:${stableId}`;
    const permalink = getPostPermalink(root);
    if (permalink) return `url:${permalink}`;
    const author = getAuthorDetails(root);
    const identity = `${classifier.normalizeText(author.profileUrl || author.name || "")}|${classifier.normalizeText(text)}`;
    return `text:${stableHash(identity)}`;
  }

  function createExportRecord(root, key, details, classification, category, previous, capturedAtMs) {
    const capturedAt = new Date(capturedAtMs).toISOString();
    const hrefs = getHrefs(root);
    const stableId = getStableId(root);
    return {
      id: stableId || key,
      sourcePostId: stableId || null,
      permalink: getPostPermalink(root, hrefs),
      author: getAuthorDetails(root, hrefs),
      category,
      confidence: details.partial ? "partial" : classification.confidence,
      score: classification.score,
      evidence: classification.evidence,
      signals: classification.signals,
      fullText: details.text,
      contentComplete: !details.partial,
      firstSeenAt: previous?.firstSeenAt || capturedAt,
      lastSeenAt: capturedAt,
      postAge: getPostAge(root, capturedAtMs),
      metrics: getPostMetrics(root),
      metricsCapturedAt: capturedAt,
      extracted: {
        emails: extractPostEmails(details.text, hrefs),
        jobTitles: extractJobTitleCandidates(details.text),
        hashtags: extractHashtags(details.text),
        links: extractPostLinks(hrefs)
      }
    };
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
    if (category === "none") {
      if (previousKey) {
        archiveKeys.delete(root);
        decrementArchiveRootCount(previousKey);
      }
      return;
    }
    const candidateKey = getArchiveKey(root, details.text);
    const key = candidateKey.startsWith("text:") && previousKey ? previousKey : candidateKey;
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
      if (keepHistory) scheduleHistorySave();
      while (exportRecords.size > MAX_EXPORT_RECORDS) {
        const oldestKey = exportRecords.keys().next().value;
        exportRecords.delete(oldestKey);
        archiveRootCounts.delete(oldestKey);
        archiveLimitReached = true;
      }
    } else {
      const previousSeenAtMs = Date.parse(previous.lastSeenAt || "");
      previous.lastSeenAt = new Date(capturedAtMs).toISOString();
      if (keepHistory && (!Number.isFinite(previousSeenAtMs) || capturedAtMs - previousSeenAtMs >= 60_000)) scheduleHistorySave();
    }
    archiveKeys.set(root, key);
  }

  function getExportPayload() {
    const posts = Array.from(exportRecords.values()).sort((a, b) => Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt));
    return {
      supported: true,
      isFeed: isFeedPage(),
      ok: true,
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      scope: "All detected posts from the current monitor run, independent of the selected category filter.",
      monitorRun: {
        startedAt: monitorStartedAt,
        stoppedAt: monitorStoppedAt,
        active: monitoring,
        recordCount: posts.length,
        recordLimit: MAX_EXPORT_RECORDS,
        limitReached: archiveLimitReached,
        duplicateCardsMerged: duplicateMergedCount
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

  function utf8ByteLength(value) {
    let bytes = 0;
    for (const character of String(value || "")) {
      const codePoint = character.codePointAt(0);
      bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    }
    return bytes;
  }

  function pruneHistory(records, now = Date.now()) {
    const cutoff = now - historyRetentionDays * 86_400_000;
    const candidates = records.filter((record) => {
      if (!record || typeof record !== "object") return false;
      const timestamp = Date.parse(record.lastSeenAt || record.firstSeenAt || "");
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    }).sort((a, b) => Date.parse(b.lastSeenAt || b.firstSeenAt) - Date.parse(a.lastSeenAt || a.firstSeenAt));

    const kept = [];
    let byteCount = 2;
    let truncated = false;
    for (const record of candidates) {
      const size = utf8ByteLength(JSON.stringify(record)) + 1;
      if (kept.length >= MAX_HISTORY_RECORDS || byteCount + size > MAX_HISTORY_BYTES) {
        truncated = true;
        continue;
      }
      kept.push(record);
      byteCount += size;
    }
    return { records: kept, truncated };
  }

  async function loadHistoryFromStorage() {
    if (historyLoaded) return;
    historyLoadPromise = (async () => {
      try {
        const stored = await chrome.storage.local.get({ hiringPostHistory: [] });
        const original = Array.isArray(stored.hiringPostHistory) ? stored.hiringPostHistory : [];
        const pruned = pruneHistory(original);
        historyRecords = pruned.records;
        historyLimitReached = pruned.truncated;
        historyLoaded = true;
        if (historyRecords.length !== original.length) scheduleHistorySave();
      } catch (_error) {
        historyRecords = [];
        historyLoaded = true;
      }
    })();
    await historyLoadPromise;
  }

  async function persistHistory(expectedGeneration = historyGeneration) {
    if (!keepHistory || expectedGeneration !== historyGeneration) return;
    await loadHistoryFromStorage();
    if (!keepHistory || expectedGeneration !== historyGeneration) return;
    try {
      const stored = await chrome.storage.local.get({
        hiringPostHistory: [],
        hiringPreferences: { keepHistory }
      });
      if (!keepHistory || expectedGeneration !== historyGeneration || stored.hiringPreferences?.keepHistory === false) return;
      const merged = new Map();
      const existing = Array.isArray(stored.hiringPostHistory) ? stored.hiringPostHistory : historyRecords;
      for (const record of existing) {
        if (!record || typeof record !== "object") continue;
        const key = String(record.id || record.permalink || "");
        if (key) merged.set(key, record);
      }
      for (const record of exportRecords.values()) {
        const key = String(record.id || record.permalink || "");
        if (!key) continue;
        const previous = merged.get(key);
        if (!previous || Date.parse(record.lastSeenAt) >= Date.parse(previous.lastSeenAt || previous.firstSeenAt)) merged.set(key, record);
      }
      const pruned = pruneHistory(Array.from(merged.values()));
      historyRecords = pruned.records;
      historyLimitReached = pruned.truncated;
      if (!keepHistory || expectedGeneration !== historyGeneration) return;
      await chrome.storage.local.set({ hiringPostHistory: historyRecords });
    } catch (_error) {
      historyLimitReached = true;
    }
  }

  function scheduleHistorySave(immediate = false) {
    if (!keepHistory) return;
    clearTimeout(historySaveTimer);
    historySaveTimer = null;
    const expectedGeneration = historyGeneration;
    if (immediate) {
      historySaveQueue = historySaveQueue.then(() => persistHistory(expectedGeneration)).catch(() => {});
    } else {
      historySaveTimer = setTimeout(() => {
        historySaveTimer = null;
        scheduleHistorySave(true);
      }, HISTORY_SAVE_DELAY_MS);
    }
  }

  function configureHistory(options = {}) {
    const retentionOptions = [7, 30, 90];
    const previousKeepHistory = keepHistory;
    const previousRetentionDays = historyRetentionDays;
    if (typeof options.keepHistory === "boolean") keepHistory = options.keepHistory;
    const requestedDays = Number(options.historyRetentionDays);
    if (retentionOptions.includes(requestedDays)) historyRetentionDays = requestedDays;
    if (previousKeepHistory !== keepHistory || previousRetentionDays !== historyRetentionDays) historyGeneration += 1;
    if (keepHistory) {
      void loadHistoryFromStorage().then(() => scheduleHistorySave(true));
    } else {
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
    }
  }

  function ensureFilterStyle() {
    if (filterStyle && filterStyle.isConnected) return;
    filterStyle = document.createElement("style");
    filterStyle.setAttribute("data-li-feed-hiring-filter-style", "true");
    filterStyle.textContent = '[data-li-feed-hiring-filter-hidden="true"]{display:none!important;}';
    (document.head || document.documentElement).appendChild(filterStyle);
  }

  function restoreHiddenPosts() {
    for (const root of filteredRoots) {
      if (root.isConnected) root.removeAttribute("data-li-feed-hiring-filter-hidden");
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
        root.removeAttribute("data-li-feed-hiring-filter-hidden");
        filteredRoots.delete(root);
      }
      return;
    }

    ensureFilterStyle();
    // Keep incomplete or uncertain cards visible until enough text is available.
    const show = partial || category === "partial" ||
      (category !== "none" && (activeFilter === "all" || category === activeFilter));
    if (show) {
      root.removeAttribute("data-li-feed-hiring-filter-hidden");
      filteredRoots.delete(root);
    } else {
      root.setAttribute("data-li-feed-hiring-filter-hidden", "true");
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
    domHealth.scannedCards += 1;
    if (details.body !== root) domHealth.textSelectorMatches += 1;
    else domHealth.textFallbacks += 1;
    if (details.control) domHealth.seeMoreControls += 1;

    const classification = classifier.classify(details.text, { hrefs: getHrefs(root) });
    let category = classification.category;
    if (details.partial && category === "none") category = "partial";
    upsertExportRecord(root, details, classification, category);

    if (category === "none") {
      results.delete(root);
    } else {
      results.set(root, {
        id: getStableId(root) || archiveKeys.get(root) || getArchiveKey(root, details.text),
        category,
        confidence: details.partial ? "partial" : classification.confidence,
        score: classification.score,
        evidence: classification.evidence,
        partial: details.partial,
        snippet: details.text.slice(0, 230),
        updatedAt: Date.now()
      });
      while (results.size > MAX_RESULTS) {
        const oldest = results.keys().next().value;
        results.delete(oldest);
      }
    }

    applyFeedFilter(root, category, details.partial);

    if (details.partial && autoExpand && details.control && isElementVisible(details.control)) {
      queueExpansion(root, details.control);
    }
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
      // In the foreground, pause auto-scroll briefly while the card expands. In a hidden tab,
      // keep the background scroll session running and let its adaptive layout feedback compensate.
      if (document.visibilityState === "visible") window.dispatchEvent(new Event("li-feed-auto-expand-start"));
      item.control.click();
      await sleep(700);
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

  function scan() {
    if (!monitoring) return;
    if (!isFeedPage()) {
      stopMonitor();
      return;
    }
    if (scanning) {
      scanAgain = true;
      return;
    }

    scanning = true;
    const roots = collectPostRoots();
    const background = document.visibilityState !== "visible";
    const candidates = background ? roots : roots.filter(isCardNearViewport);
    domHealth.checks += 1;
    domHealth.postRootsFound = roots.length;
    domHealth.scannedCards = 0;
    domHealth.textSelectorMatches = 0;
    domHealth.textFallbacks = 0;
    domHealth.seeMoreControls = 0;
    for (const root of candidates) updatePost(root, background);
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
    scanning = false;
    if (scanAgain) {
      scanAgain = false;
      scheduleScan(50);
    } else {
      // Poll loaded cards so the monitor and DOM health check continue in a hidden tab.
      scheduleScan(background ? 5_000 : 1_800);
    }
  }

  function scheduleScan(delay = 250) {
    if (!monitoring) return;
    clearTimeout(scheduledScan);
    scheduledScan = setTimeout(scan, delay);
  }

  function getStatus() {
    cleanDisconnectedResults();
    const counts = {
      open_role: 0,
      recruiter_search: 0,
      possible: 0,
      job_seeker: 0,
      hiring_discussion: 0,
      closed: 0,
      partial: 0
    };
    const uniqueResults = new Map();
    for (const result of results.values()) {
      const key = String(result.id || `${result.category}:${result.snippet || ""}`);
      const previous = uniqueResults.get(key);
      if (!previous || result.updatedAt > previous.updatedAt) uniqueResults.set(key, result);
    }
    const uniqueResultValues = Array.from(uniqueResults.values());
    for (const result of uniqueResultValues) {
      if (Object.hasOwn(counts, result.category)) counts[result.category] += 1;
    }
    const resultList = uniqueResultValues
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    return {
      supported: true,
      isFeed: isFeedPage(),
      monitoring,
      autoExpand,
      activeFilter,
      matchesOnly,
      processedCount,
      archiveCount: exportRecords.size,
      archiveLimit: MAX_EXPORT_RECORDS,
      archiveLimitReached,
      duplicateMergedCount,
      historyEnabled: keepHistory,
      historyRetentionDays,
      historyCount: historyRecords.length,
      historyLimitReached,
      domHealth: {
        ...domHealth,
        background: document.visibilityState !== "visible",
        postsWithAge: Array.from(exportRecords.values()).filter((record) => record.postAge?.label || record.postAge?.publishedAt).length,
        postsWithMetrics: Array.from(exportRecords.values()).filter((record) => Object.values(record.metrics || {}).some((count) => count !== null && count !== undefined)).length
      },
      counts,
      results: resultList
    };
  }

  function startMonitor(options = {}) {
    if (!isFeedPage()) return { supported: true, isFeed: false, ok: false, error: "Open the LinkedIn feed first." };
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
      if (matchesOnly) ensureFilterStyle();
      results.clear();
      exportRecords.clear();
      archiveKeys = new WeakMap();
      archiveRootCounts = new Map();
      archiveLimitReached = false;
      duplicateMergedCount = 0;
      monitorStartedAt = new Date().toISOString();
      monitorStoppedAt = null;
      processedCount = 0;
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
        observer = new MutationObserver(() => scheduleScan(220));
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

  function stopMonitor() {
    if (monitoring) monitorStoppedAt = new Date().toISOString();
    monitoring = false;
    monitorGeneration += 1;
    restoreHiddenPosts();
    if (observer) observer.disconnect();
    observer = null;
    if (scrollListener) document.removeEventListener("scroll", scrollListener, true);
    if (visibilityListener) document.removeEventListener("visibilitychange", visibilityListener);
    scrollListener = null;
    visibilityListener = null;
    clearTimeout(scheduledScan);
    scheduledScan = null;
    expansionQueue = [];
    if (keepHistory) scheduleHistorySave(true);
    return { supported: true, isFeed: isFeedPage(), ok: true, status: getStatus() };
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    switch (message.type) {
      case "GET_HIRING_STATUS":
        sendResponse(getStatus());
        return false;
      case "EXPORT_HIRING_POSTS":
        sendResponse(getExportPayload());
        return false;
      case "START_HIRING_MONITOR":
        sendResponse(startMonitor(message.options || {}));
        return false;
      case "STOP_HIRING_MONITOR":
        sendResponse(stopMonitor());
        return false;
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
      default:
        return false;
    }
  });

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.hiringPostHistory) {
        const nextHistory = changes.hiringPostHistory.newValue;
        if (Array.isArray(nextHistory)) {
          const pruned = pruneHistory(nextHistory);
          historyRecords = pruned.records;
          historyLimitReached = pruned.truncated;
        } else {
          historyRecords = [];
          historyLimitReached = false;
        }
        historyLoaded = true;
        clearTimeout(historySaveTimer);
        historySaveTimer = null;
      }
      if (changes.hiringPreferences?.newValue && typeof changes.hiringPreferences.newValue === "object") {
        const preferences = changes.hiringPreferences.newValue;
        const nextFilter = typeof preferences.filter === "string" ? preferences.filter : activeFilter;
        const nextMatchesOnly = typeof preferences.matchesOnly === "boolean" ? preferences.matchesOnly : matchesOnly;
        if (activeFilter !== nextFilter || matchesOnly !== nextMatchesOnly) restoreHiddenPosts();
        activeFilter = nextFilter;
        matchesOnly = nextMatchesOnly;
        if (typeof preferences.autoExpand === "boolean") setAutoExpand(preferences.autoExpand);
        configureHistory({
          keepHistory: preferences.keepHistory === true,
          historyRetentionDays: preferences.historyRetentionDays
        });
        if (monitoring && matchesOnly) ensureFilterStyle();
        if (monitoring) scheduleScan(50);
      }
    });
  }
})();
