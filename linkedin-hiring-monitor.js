(() => {
  "use strict";

  const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
  const shared = globalThis.__LI_FEED_SHARED__;
  if (!classifier) throw new Error("The local hiring classifier must load before the feed monitor.");
  if (!shared) throw new Error("Shared primitives must load before the feed monitor.");

  const MAX_RESULTS = 80;
  const MAX_EXPORT_RECORDS = 1000;
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
  let historyGeneration = 0;
  let historySaveTimer = null;
  let historySaveQueue = Promise.resolve();
  let historyLimitReached = false;
  let historyMode = "off";
  let historyCount = 0;
  let historyError = null;
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

  function normalizeLabel(element) {
    return classifier.normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.innerText || element.textContent || ""}`);
  }

  function isSeeMoreControl(element, body = null) {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    if (body && !body.contains(element)) return false;
    const label = normalizeLabel(element);
    if (/comments?|repl(?:y|ies)|reactions?|commentaires?|r[ée]pondre|تعليقات?|ردود|رد/iu.test(label)) return false;
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

  // Card-level classes only. `feed-shared-update-v2` is a card, but its BEM children
  // (`__description-wrapper`, `__content`, `__actor`, `__social-actions`) are parts of that
  // card. Treating them as cards made one post produce several roots, several archive
  // records, and inflated category counts.
  function isCardClassToken(token) {
    if (!token || token.includes("__")) return false;
    return token === "feed-shared-update-v2" || token === "occludable-update" ||
      /feed[-\w]*(?:update|post)|(?:post|update)[-\w]*card|card[-\w]*(?:post|update)/.test(token);
  }

  function isLikelyPostRoot(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    const className = typeof element.className === "string" ? element.className.toLowerCase() : "";
    const role = (element.getAttribute("role") || "").toLowerCase();
    const urn = element.getAttribute("data-urn") || "";
    const dataId = element.getAttribute("data-id") || "";
    const testId = (element.getAttribute("data-test-id") || "").toLowerCase();
    const viewName = (element.getAttribute("data-view-name") || "").toLowerCase();
    const knownCardClass = className.split(/\s+/).some(isCardClassToken);
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
    return deduplicateNestedRoots(Array.from(roots));
  }

  const POST_URN_PATTERN = /urn:li:(?:activity|share|ugcPost|jobPosting|job):[\w-]+/i;
  const ACTOR_SELECTOR = "[class*='update-components-actor'],[class*='feed-shared-actor']";
  const ACTOR_NAME_SELECTOR = "[class*='actor__name'],[data-test-id*='actor-name']";
  const REACTOR_PATTERN = /aime ce contenu|adore ce contenu|a republi(?:é|e) ce contenu|a partag(?:é|e) ce contenu|a ajout(?:é|e) un commentaire|c(?:é|e)l(?:è|e)bre ce contenu|likes? this|loves? this|reposted this|shared this|commented on this|celebrates this/iu;

  // `[class*='update-components-actor']` also matches every BEM child of the actor block, so
  // only the container itself counts as an actor.
  function isActorContainer(element) {
    const className = typeof element.className === "string" ? element.className : "";
    return className.split(/\s+/).some((token) => token === "update-components-actor" || token === "feed-shared-actor");
  }
  const IDENTITY_ATTRIBUTES = ["data-urn", "data-id", "data-entity-urn", "data-urn-public", "id"];

  function urnIn(value) {
    if (!value) return "";
    let text = String(value);
    try { text = decodeURIComponent(text); } catch (_error) { /* a malformed escape is still searchable raw */ }
    const match = text.match(POST_URN_PATTERN);
    return match ? match[0] : "";
  }

  function postIdentityOf(element) {
    if (!element || typeof element.getAttribute !== "function") return "";
    for (const attribute of IDENTITY_ATTRIBUTES) {
      const found = urnIn(element.getAttribute(attribute));
      if (found) return found;
    }
    return "";
  }

  // A real 2026 feed card carries its post URN in the permalink anchor and not always in a
  // data attribute. Identity, permalink and deduplication all depend on finding it, so the
  // whole card is searched: attributes, then descendants, then hrefs, then ancestors.
  function urnFromHrefs(element) {
    if (!element || typeof element.querySelectorAll !== "function") return "";
    for (const anchor of Array.from(element.querySelectorAll("a[href]"))) {
      const found = urnIn(anchor.getAttribute("href") || anchor.href);
      if (found) return found;
    }
    return "";
  }

  // A reshare or a reactor wrapper ("X aime ce contenu", "X a republié ce contenu",
  // "X a ajouté un commentaire") means the post that was detected is the INNER one. Author,
  // permalink, identity and age must come from that container, otherwise a shared vacancy is
  // attributed to whoever shared it and the same post forks into one record per reactor.
  function resolveContentScope(root) {
    if (!root || typeof root.querySelectorAll !== "function") return root;
    const reshares = Array.from(root.querySelectorAll("[class*='reshare']"))
      .filter((node) => cleanText(node.innerText || node.textContent || "").length > 40);
    if (reshares.length) return reshares[reshares.length - 1];
    const actors = Array.from(root.querySelectorAll(ACTOR_SELECTOR)).filter(isActorContainer);
    if (actors.length > 1 && REACTOR_PATTERN.test(cleanText(actors[0].innerText || actors[0].textContent || ""))) {
      return actors[actors.length - 1].parentElement || root;
    }
    return root;
  }

  function urnFromDescendants(element) {
    if (!element || typeof element.querySelectorAll !== "function") return "";
    for (const node of Array.from(element.querySelectorAll("[data-urn],[data-id],[data-entity-urn],[id]"))) {
      const found = postIdentityOf(node);
      if (found) return found;
    }
    return "";
  }

  // One post must never be archived twice. A nested element that looks like a card is part of
  // the enclosing card unless it carries its own distinct post identity — which is exactly how
  // a reshare appears inside the post that shares it.
  function deduplicateNestedRoots(roots) {
    const kept = [];
    for (const root of roots) {
      const ownerIndex = kept.findIndex((other) => other !== root && other.contains(root));
      if (ownerIndex < 0) {
        kept.push(root);
        continue;
      }
      const identity = postIdentityOf(root);
      const ownerIdentity = postIdentityOf(kept[ownerIndex]);
      // No identity of its own: it is part of the enclosing card, so it must not be archived.
      if (!identity) continue;
      // A different identity is a reshare inside the post that shares it: both are real posts.
      if (ownerIdentity && ownerIdentity !== identity) {
        kept.push(root);
        continue;
      }
      // The same identity (or an ancestor without one) means this is the card itself and the
      // ancestor is only a wrapper. Prefer the innermost card so body, see-more, and permalink
      // selection stay scoped to it.
      kept[ownerIndex] = root;
    }
    return kept;
  }

  function collectPostRoots() {
    const scope = document.querySelector("[role='main'],main") || document.body;
    const roots = findPostRootsInScope(scope);
    // LinkedIn sometimes places the feed cards outside its current <main> wrapper.
    if (!roots.length && scope && scope !== document.body) return findPostRootsInScope(document.body);
    return roots;
  }

  // True when `node` is part of the post `root` describes. The selected root is often the
  // outer feed wrapper while the real card — actor, body, permalink — sits inside it, so a
  // card boundary only stops the walk when it carries a DIFFERENT post identity. That is how a
  // reshare nested in the post that shares it stays separate, while this card's own inner
  // elements stay reachable.
  function belongsToPostRoot(node, root) {
    const rootIdentity = postIdentityOf(root) || urnFromDescendants(root) || urnFromHrefs(root);
    let current = node;
    while (current) {
      if (current === root) return true;
      if (current !== node) {
        const role = (current.getAttribute("role") || "").toLowerCase();
        const isBoundary = current.tagName === "ARTICLE" || role === "article" || postIdentityOf(current) !== "";
        if (isBoundary && rootIdentity) {
          const identity = postIdentityOf(current) || urnFromDescendants(current) || urnFromHrefs(current);
          if (identity && identity !== rootIdentity) return false;
        }
      }
      current = current.parentElement;
    }
    return false;
  }

  function findSeeMore(root, body = findBodyNode(root)) {
    if (!body) return null;
    return Array.from(body.querySelectorAll("button,[role='button']"))
      .find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true" && isSeeMoreControl(button, body));
  }

  function findBodyNode(root, control = null) {
    const selectors = [
      '[class*="feed-shared-update-v2__description-wrapper"]',
      '[class*="update-components-text"]',
      '[data-test-id*="post-text"]',
      '[data-test-id*="update-text"]',
      '[class*="feed-shared-text"]',
      '[class*="inline-show-more-text"]',
      '[class*="feed-shared-update-v2__description"]',
      '[class*="update__description"]'
    ];
    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector))
        .filter((node) => belongsToPostRoot(node, root) && !node.querySelector("article,[role='article']"))
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

  const CONTROL_LABELS = /see more|show more|see less|show less|more comments|voir plus|voir moins|afficher plus|afficher moins|commentaires|عرض المزيد|عرض اقل|إظهار المزيد|اظهار اقل|مزيد من التعليقات|mehr anzeigen|ver mais|mostrar mais|vedi altro|mostra altro|meer weergeven|daha fazla goster/iu;

  function isControlChrome(element, body) {
    if (!element || (body && !body.contains(element))) return false;
    if (isSeeMoreControl(element, body)) return true;
    const label = normalizeLabel(element);
    return Boolean(label) && CONTROL_LABELS.test(label);
  }

  // Card furniture that must never reach the text that is classified, deduplicated,
  // displayed, or exported. Applied to a clone, structurally: splicing each chrome node's own
  // text out of the whole card with lastIndexOf fails on a real feed, where bullets,
  // private-use icon glyphs, emoji and localized labels mean the chunk never matches exactly.
  const CHROME_SELECTORS = Object.freeze([
    "[hidden]", ".visually-hidden", ".sr-only",
    "[class*='visually-hidden']", "[class*='a11y']", "[class*='screen-reader']", "[class*='assistive']",
    "[class*='update-components-actor']", "[class*='feed-shared-actor']",
    "[class*='social-actions']", "[class*='social-details']", "[class*='reactions']", "[class*='reaction-count']",
    "[class*='control-menu']", "[class*='timestamp']", "[class*='sub-description']",
    "[class*='comment']", "[class*='translation']", "[class*='promo']", "[class*='sponsor']",
    "[class*='job-card']", "[class*='jobs-unified']", "[class*='job-entity']",
    "[class*='video-playback']", "[class*='video-controls']", "[class*='profile-create-dropdown']",
    "time", "[datetime]", "button", "[role='button']", "nav", "form", "input", "select", "textarea", "svg"
  ]);

  const SPONSORED_PATTERN = /(?:post|publication|annonce)\s+sponsoris|\bsponsored\b|\bpromoted\b|منشور\s+ممول|إعلان\s+ممول|\sممول\s/iu;

  function isSponsoredCard(root) {
    if (!root) return false;
    if (root.querySelector("[class*='promo'],[class*='sponsor'],[data-test-id*='sponsor']")) return true;
    for (const node of Array.from(root.querySelectorAll("[aria-label],[class*='actor'],[class*='sub-description']")).slice(0, 12)) {
      const label = `${node.getAttribute("aria-label") || ""} ${node.textContent || ""}`;
      if (SPONSORED_PATTERN.test(label)) return true;
    }
    return false;
  }

  function visibleText(node) {
    const clone = node.cloneNode(true);
    for (const selector of CHROME_SELECTORS) {
      try {
        clone.querySelectorAll(selector).forEach((element) => element.remove());
      } catch (_error) { /* an engine that rejects one selector still honours the rest */ }
    }
    return clone.textContent || "";
  }

  function nodeText(node) {
    // LinkedIn renders offscreen feed cards with content-visibility, so innerText comes back
    // empty for most of a long feed. Falling back to raw textContent is what pulled hidden
    // accessibility labels, buttons and reaction counts into post text; strip them instead.
    const inline = typeof node.innerText === "string" ? cleanText(node.innerText) : "";
    return inline || cleanText(visibleText(node));
  }

  function getPostTextDetails(root) {
    const body = findBodyNode(root);
    const control = findSeeMore(root, body);
    const text = cleanText(nodeText(body) || "");
    // Text counts as incomplete only while LinkedIn is still hiding some of it behind an
    // unexpanded control. Using the card as the text scope is no longer treated as incomplete:
    // with chrome removed structurally it yields the same body text.
    const fullTextAvailableWithoutExpansion = !control && body !== root;
    return {
      text,
      control,
      body,
      // Incomplete when LinkedIn is still hiding text behind a control, and also when the
      // body node could not be located at all: card-scoped text is a guess, not a promise.
      // `domHealth.textFallbacks` reports how often that guess is needed.
      partial: Boolean(control) || body === root,
      usedCardFallback: body === root,
      sponsored: isSponsoredCard(root),
      fullTextAvailableWithoutExpansion
    };
  }

  function getHrefs(root) {
    return Array.from(root.querySelectorAll("a[href]"), (anchor) => anchor.getAttribute("href") || anchor.href || "");
  }

  function getStableId(root) {
    // The content scope first: for a reshare, the identity that must deduplicate across runs
    // and across different people sharing it is the shared post's, not the share's.
    for (const target of [resolveContentScope(root), root]) {
      if (!target) continue;
      const own = postIdentityOf(target);
      if (own) return own.slice(0, 100);
      const nested = urnFromDescendants(target);
      if (nested) return nested.slice(0, 100);
      const fromLink = urnFromHrefs(target);
      if (fromLink) return fromLink.slice(0, 100);
    }
    // A body node that reached this point must not fork into a separate text identity for the
    // post it belongs to; inherit the enclosing card's post identity instead.
    let current = root.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 12) {
      const inherited = postIdentityOf(current) || urnFromHrefs(current);
      if (inherited) return inherited.slice(0, 100);
      current = current.parentElement;
      depth += 1;
    }
    return "";
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
    const scope = resolveContentScope(root);
    const ordered = scope === root ? hrefs : [...getHrefs(scope), ...hrefs];
    for (const href of ordered) {
      const absolute = toAbsoluteHttpUrl(href);
      const canonical = shared.canonicalizeLinkedInUrl(absolute, "permalink");
      if (canonical) return canonical;
    }
    // The post URN is enough to build the canonical permalink. Without this, a card whose
    // timestamp link is rendered lazily exports no permalink at all and the reviewer has no
    // way to open the post that was detected.
    const urn = getStableId(root);
    return urn && POST_URN_PATTERN.test(urn) ? `https://www.linkedin.com/feed/update/${urn}/` : null;
  }

  function getAuthorDetails(root, hrefs = getHrefs(root)) {
    // The author of the detected content, not of the reaction or reshare that surfaced it.
    const scope = resolveContentScope(root);
    const actor = Array.from(scope.querySelectorAll(ACTOR_SELECTOR)).filter(isActorContainer)[0] || scope;
    let name = null;
    const nameNode = Array.from(actor.querySelectorAll(ACTOR_NAME_SELECTOR))
      .find((item) => cleanText(item.innerText || item.textContent || "").length > 1);
    if (nameNode) name = cleanText(nameNode.innerText || nameNode.textContent || "").slice(0, 120);
    let profileUrl = null;
    for (const href of hrefs) {
      const absolute = toAbsoluteHttpUrl(href);
      const canonical = shared.canonicalizeLinkedInUrl(absolute, "profile");
      if (canonical) {
        profileUrl = canonical;
        break;
      }
    }
    return { name, profileUrl };
  }

  function asciiDigits(value) {
    return String(value || "")
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/٫/g, ".")
      .replace(/٬/g, ",");
  }

  // Real feed timestamps are mostly absolute in French ("18 oct.", "27 sept.", "24 sept.")
  // and only sometimes relative ("13 h", "34 min", "6 j"). Reading only relative forms is why
  // 31 of 32 exported records had no age at all.
  const ABSOLUTE_DATE_PATTERNS = [
    /\b\d{1,2}\s+(?:janvier|janv|f[ée]vrier|f[ée]vr|fevrier|fev|mars|mar|avril|avr|mai|juin|juillet|juil|ao[ûu]t|septembre|sept|sep|octobre|oct|novembre|nov|d[ée]cembre|d[ée]c|dec)\.?(?![\p{L}])/iu,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/iu,
    /\b\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر|كانون\s+الثاني|شباط|آذار|نيسان|أيّار|مايو|حزيران|تموز|آب|أيلول|تشرين\s+الأول|تشرين\s+الثاني|كانون\s+الأول)\b/u
  ];
  const MONTH_INDEX = [
    [/^janv|^janvier|^jan/iu, 0], [/^f[ée]vr?|^fevr|^f[ée]vrier|^feb/iu, 1], [/^mars|^mar/iu, 2],
    [/^avr|^avril|^apr/iu, 3], [/^mai|^may/iu, 4], [/^juin|^jun/iu, 5], [/^juil|^jul/iu, 6],
    [/^ao[ûu]t|^aug/iu, 7], [/^sept?|^sep|^septembre/iu, 8], [/^oct|^octobre/iu, 9],
    [/^nov|^novembre/iu, 10], [/^d[ée]c|^dec|^d[ée]cembre/iu, 11]
  ];
  const ARABIC_MONTH_INDEX = [
    [/يناير|كانون\s+الثاني|شباط/u, 0], [/فبراير|شباط/u, 1], [/مارس|آذار/u, 2], [/أبريل|نيسان|أيّار/u, 3],
    [/مايو|أيّار|حزيران/u, 4], [/يونيو|حزيران/u, 5], [/يوليو|تموز/u, 6], [/أغسطس|آب/u, 7],
    [/سبتمبر|أيلول/u, 8], [/أكتوبر|تشرين\s+الأول/u, 9], [/نوفمبر|تشرين\s+الثاني/u, 10],
    [/ديسمبر|كانون\s+الأول/u, 11]
  ];

  // Absolute labels carry no year, so the most recent past occurrence of that month and day is
  // the one being shown.
  function parseAbsoluteDateMs(label, capturedAtMs) {
    const text = asciiDigits(cleanText(label));
    let day = null;
    let month = null;
    const latin = text.match(/\b(\d{1,2})\s+([\p{L}\.]{3,10})/u);
    if (latin) {
      day = Number(latin[1]);
      for (const [pattern, index] of MONTH_INDEX) if (pattern.test(latin[2])) { month = index; break; }
    }
    if (month === null) {
      const english = text.match(/\b([\p{L}\.]{3,10})\s+(\d{1,2})\b/u);
      if (english) {
        day = Number(english[2]);
        for (const [pattern, index] of MONTH_INDEX) if (pattern.test(english[1])) { month = index; break; }
      }
    }
    if (month === null) {
      const arabic = text.match(/\b(\d{1,2})\s+(\S+(?:\s+\S+)?)/u);
      if (arabic) {
        day = Number(arabic[1]);
        for (const [pattern, index] of ARABIC_MONTH_INDEX) if (pattern.test(arabic[2])) { month = index; break; }
      }
    }
    if (day === null || month === null || day < 1 || day > 31) return null;
    const captured = new Date(capturedAtMs);
    let candidate = Date.UTC(captured.getUTCFullYear(), month, day, 12, 0, 0);
    // A feed shows this year unless the date has not happened yet, in which case it is last year's.
    if (candidate > capturedAtMs + 86_400_000) candidate = Date.UTC(captured.getUTCFullYear() - 1, month, day, 12, 0, 0);
    return Number.isFinite(candidate) ? candidate : null;
  }

  function findAgeLabel(value) {
    const text = asciiDigits(cleanText(value));
    for (const pattern of ABSOLUTE_DATE_PATTERNS) {
      const absolute = text.match(pattern);
      if (absolute) return absolute[0].trim();
    }
    const patterns = [
      /\b(?:just now|a few seconds ago|yesterday)\b/iu,
      // A bare single-letter unit may only follow a digit: with "a|an" allowed in front, the
      // ordinary English word "and" parsed as "an" + "d" and was exported as a post age.
      /\b\d+\s*(?:s|m|h|d|w|y|mo|yr|min|hr|hrs|wk|wks|yrs?)\b/iu,
      /\b(?:a|an|one|two|three|four|five|ten|few|several|\d+)\s+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|wk|months?|years?|yrs?)\b/iu,
      /\b(?:il y a\s+)?\d+\s*(?:secondes?|s|minutes?|min|heures?|h|jours?|j|semaines?|sem|mois|ans?|ann[ée]es?)\b/iu,
      /\b(?:il y a\s+)?(?:un|une|deux|trois|quelques)\s+(?:secondes?|minutes?|heures?|jours?|semaines?|mois|ans?|ann[ée]es?)\b/iu,
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
        const numeric = String(dateValue).trim();
        const parsed = /^\d{10}$/u.test(numeric) ? Number(numeric) * 1000
          : /^\d{13}$/u.test(numeric) ? Number(numeric)
            : Date.parse(dateValue);
        if (Number.isFinite(parsed)) publishedAt = new Date(parsed).toISOString();
      }
      const candidate = findAgeLabel(`${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.innerText || node.textContent || ""}`);
      if (candidate && (!label || candidate.length < label.length)) label = candidate;
    }
    // An absolute label is a real publish date even when the page exposed no datetime attribute.
    if (!publishedAt && label) {
      const absoluteMs = parseAbsoluteDateMs(label, capturedAtMs);
      if (absoluteMs !== null) publishedAt = new Date(absoluteMs).toISOString();
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
    const match = text.match(/(\d[\d.,]*)(?:\s*([kmb]|ألف|الف|مليون|مليار))?/iu);
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
    const multiplier = ["k", "ألف", "الف"].includes(suffix) ? 1_000
      : ["m", "مليون"].includes(suffix) ? 1_000_000
        : ["b", "مليار"].includes(suffix) ? 1_000_000_000 : 1;
    return Math.round(number * multiplier);
  }

  function parseMetricCount(value, metricPattern) {
    const text = asciiDigits(value).toLowerCase();
    const metricMatch = text.match(metricPattern);
    if (!metricMatch) return null;
    const before = text.slice(0, metricMatch.index);
    const after = text.slice(metricMatch.index + metricMatch[0].length);
    const numberAfter = after.match(/^\s*(?:[:(·—-]\s*)?(\d[\d.,]*\s*(?:[kmb]|ألف|الف|مليون|مليار)?)/iu);
    if (numberAfter) return parseMetricNumber(numberAfter[1]);
    const numberBefore = Array.from(before.matchAll(/(\d[\d.,]*\s*(?:[kmb]|ألف|الف|مليون|مليار)?)/giu));
    return numberBefore.length ? parseMetricNumber(numberBefore[numberBefore.length - 1][1]) : null;
  }

  function getPostMetrics(root) {
    // Only counts that belong to this post's own content may be reported. A reactor wrapper, a
    // nested reshare or the comment thread carries counts of its own, and attributing those to
    // the post is worse than reporting nothing, so they are excluded. Counts are never inferred
    // from bare numbers: the 2026-10-22 export showed those are dates and follower counts too.
    const scope = resolveContentScope(root) || root;
    const nodes = Array.from(scope.querySelectorAll("[aria-label],[title],button,[role='button'],[class*='social-count']"))
      .filter((node) => !isCommentThreadNode(node, scope));
    // Inside a card the social-actions region is the post's own engagement bar. It is tried
    // before any other labelled node so a job widget or follow button cannot win the match.
    const inSocialRegion = (node) => Boolean(
      node.closest && node.closest("[class*='social-actions'],[class*='social-details'],[class*='social-count']")
    );
    nodes.sort((a, b) => Number(inSocialRegion(b)) - Number(inSocialRegion(a)));
    const metricPatterns = {
      reactions: /reactions?|likes?|réactions?|j['’]aime|تفاعل|إعجاب|اعجاب/iu,
      comments: /comments?|commentaires?|تعليقات|تعليق/iu,
      reposts: /reposts?|shares?|partages?|إعادة النشر|إعادة نشر|مشاركة/iu,
      views: /impressions?|views?|vues?|مشاهدة|مشاهدات|مرات الظهور/iu
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
    const permalink = getPostPermalink(root);
    const author = getAuthorDetails(root);
    return shared.canonicalPostId({ id: stableId || undefined, permalink, author, fullText: text });
  }

  function createExportRecord(root, key, details, classification, category, previous, capturedAtMs) {
    const capturedAt = new Date(capturedAtMs).toISOString();
    const hrefs = getHrefs(root);
    const stableId = getStableId(root);
    const record = {
      id: key,
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
      extractionStatus: details.partial ? "partial" : "complete",
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
    return previous ? shared.mergePostRecords(previous, record) : record;
  }

  function extractPostRecord(root, { capturedAtMs = Date.now(), previous = null } = {}) {
    const details = getPostTextDetails(root);
    const hrefs = getHrefs(root);
    const classification = classifier.classify(details.text, { hrefs, sponsored: details.sponsored });
    const category = details.partial && classification.category === "none" ? "partial" : classification.category;
    const key = getArchiveKey(root, details.text);
    return createExportRecord(root, key, details, classification, category, previous, capturedAtMs);
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
    if (filterStyle && filterStyle.isConnected) return;
    filterStyle = document.createElement("style");
    filterStyle.setAttribute("data-li-feed-hiring-filter-style", "true");
    filterStyle.textContent = '[data-li-feed-hiring-filter-hidden="true"]{display:none!important;}';
    (document.head || document.documentElement).appendChild(filterStyle);
  }

  function reconcileFilterArtifacts(scope = document) {
    scope.querySelectorAll("[data-li-feed-hiring-filter-hidden='true']").forEach((node) => {
      node.removeAttribute("data-li-feed-hiring-filter-hidden");
    });
    scope.querySelectorAll("[data-li-feed-hiring-filter-style='true']").forEach((node) => node.remove());
    filteredRoots.clear();
    filterStyle = null;
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
    const hrefs = getHrefs(root);
    const fingerprint = JSON.stringify([details.text, details.partial, hrefs]);
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
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 2);
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
      const beforeText = body.textContent || "";
      const beforeLabel = normalizeLabel(control);
      if (document.visibilityState === "visible") window.dispatchEvent(new Event("li-feed-auto-expand-start"));
      control.click();
      state.attempts += 1;
      await sleep(waitMs);
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
      await expandPost(item.root, getPostTextDetails(item.root), { maxAttempts: 2, waitMs: 700 });
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

  function queryRecords(records, query = {}) {
    const filter = shared.FILTERS.includes(query.filter) ? query.filter : "all";
    const search = classifier.normalizeText(query.search || "");
    const filtered = Array.from(records || []).filter((record) => {
      if (!record || (filter !== "all" && record.category !== filter)) return false;
      if (!search) return true;
      const haystack = classifier.normalizeText([
        record.fullText, record.category, record.author?.name,
        ...(record.evidence || []), ...(record.extracted?.jobTitles || []), ...(record.extracted?.hashtags || [])
      ].join(" "));
      return haystack.includes(search);
    });
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
      ...page
    };
  }

  function startMonitor(options = {}) {
    reconcileFilterArtifacts();
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
      }
    });
  }
})();
