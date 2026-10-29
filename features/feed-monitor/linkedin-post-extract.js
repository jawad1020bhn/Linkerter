(() => {
  "use strict";

  const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;
  const shared = globalThis.__LI_FEED_SHARED__;
  if (!classifier) throw new Error("The local hiring classifier must load before the post extractors.");
  if (!shared) throw new Error("Shared primitives must load before the post extractors.");
  // Idempotent load: programmatic re-injection must not rebuild the selector tables while
  // the first instance's caches stay alive.
  if (globalThis.__LI_FEED_HIRING_POST_EXTRACT__) return;

  /*
   * Pure DOM-extraction layer for the feed monitor.
   *
   * Everything here reads a post card from the LinkedIn DOM and reports what it holds:
   * card boundaries and post identity, text expansion state, author, permalink, post
   * age and engagement metrics. None of these functions touch monitor state,
   * chrome.* or timers, so the extraction rules stay verifiable without a live feed
   * session and the monitor file keeps only orchestration: scanning, caches,
   * filtering, history and messaging.
   */

  const MORE_LABELS = [
    "see more", "show more", "read more", "show full post", "show full text",
    "voir plus", "afficher plus", "afficher tout", "lire la suite", "voir la suite",
    "عرض المزيد", "عرض الكل", "قراءة المزيد",
    "ver mas", "mostrar mas", "ver publicación completa", "mostrar publicación completa",
    "mehr anzeigen", "ver mais", "mostrar mais", "vedi altro", "mostra altro", "meer weergeven",
    "daha fazla gor", "daha fazla goster"
  ];

  // Fallback for a localized label missing from the list above. "Translate" is deliberately
  // NOT a candidate: clicking it swaps the text instead of revealing more of it.
  const MORE_LABEL_FALLBACK = /\bmore\b|\bplus\b|المزيد|الكل/iu;

  function normalizeLabel(element) {
    return classifier.normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.innerText || element.textContent || ""}`);
  }

  function isSeeMoreControl(element, body = null) {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    if (body && !body.contains(element)) return false;
    const label = normalizeLabel(element);
    if (/comments?|repl(?:y|ies)|reactions?|commentaires?|r[ée]pondre|تعليقات?|ردود|رد/iu.test(label)) return false;
    if (MORE_LABELS.some((phrase) => label.includes(classifier.normalizeText(phrase)))) return true;
    return MORE_LABEL_FALLBACK.test(label);
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

  function collectPostRoots() {
    const scope = document.querySelector("[role='main'],main") || document.body;
    const roots = findPostRootsInScope(scope);
    // LinkedIn sometimes places the feed cards outside its current <main> wrapper.
    if (!roots.length && scope && scope !== document.body) return findPostRootsInScope(document.body);
    return roots;
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
    // B1: a class-token independent fallback. LinkedIn's hashed class names rotate, but a
    // post still renders its copy as the longest paragraph-bearing block inside the card.
    const structural = Array.from(root.querySelectorAll("p,div"))
      .filter((node) => node !== root && belongsToPostRoot(node, root) && !node.querySelector("article,[role='article'],[class*='comment']"))
      .map((node) => ({ node, length: cleanText(node.textContent || "").length }))
      .filter((entry) => entry.length >= 200)
      .sort((a, b) => b.length - a.length);
    if (structural.length) return structural[0].node;
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

  // Card furniture that must never reach the text that is classified, deduplicated,
  // displayed, or exported. Applied to a clone, structurally: splicing each chrome node's own
  // text out of the whole card with lastIndexOf fails on a real feed, where bullets,
  // private-use icon glyphs, emoji and localized labels mean the chunk never matches exactly.
  const CHROME_SELECTORS = Object.freeze([
    "[hidden]", ".visually-hidden", ".sr-only",
    "[aria-hidden='true']",
    "[class*='visually-hidden']", "[class*='a11y']", "[class*='screen-reader']", "[class*='assistive']",
    "[class*='update-components-actor']", "[class*='feed-shared-actor']", "[class*='update-components-header']",
    "[class*='social-actions']", "[class*='social-details']", "[class*='social-count']",
    "[class*='reactions']", "[class*='reaction-count']",
    "[data-test-id*='social']", "[data-test-id*='comment']",
    "[class*='control-menu']", "[class*='timestamp']", "[class*='sub-description']",
    "[class*='comment']", "[class*='translation']", "[class*='promo']", "[class*='sponsor']",
    "[class*='follow']", "[class*='subscribe']", "[class*='see-more-less-toggle']",
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
      .replace(/\s+[—–]\s+.*$/u, "")
      .replace(/\s+[��]\s+.*$/u, "")
      .replace(/\s+(?:apply|send|email|contact|postulez|envoyez)\b.*$/iu, "")
      .replace(/\s+(?:للتقديم|للتوظيف|أرسل|ارسل|يرجى)(?:\s+.*)?$/u, "")
      .trim();
    if (title.length < 3 || title.length > 90) return null;
    const normalized = classifier.normalizeText(title);
    if (!normalized || GENERIC_TITLE_LABELS.has(normalized)) return null;
    if (/^(?:candidate|candidates|candidat|candidats|موظف|موظفين|مرشح|مرشحين)\b/u.test(normalized)) return null;
    return title;
  }

  // B9: parentheses may contain commas ("Backend Engineer (Node.js, AWS)"), so a character
  // class cannot bound the title. Capture generously, then cut at the first top-level comma —
  // commas inside parentheses stay part of the title.
  function trimTitleAtTopLevelSeparator(value) {
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === "(") depth += 1;
      else if (character === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (character === "," || character === "،" || character === ";")) {
        return value.slice(0, index);
      }
    }
    return value;
  }

  function extractJobTitleCandidates(text) {
    // Export-only phrase extraction. These candidates never affect classification.
    const patterns = [
      /\b(?:hiring|recruiting)\s+for\s+(?:an?\s+|the\s+)?([^\n;!?|]{2,100})/giu,
      /\b(?:looking\s+to\s+hire|seeking|we\s+need|we(?:'|’)re\s+looking\s+for|we\s+are\s+looking\s+for)\s+(?:an?\s+|the\s+)?([^\n;!?|]{2,100})/giu,
      /\b(?:open\s+(?:role|position)|job\s+opening|(?:job|role|position)\s+title)\s*(?:[:：—–-]\s*|for\s+)([^\n;!?|]{2,100})/giu,
      /\b(?:now\s+hiring|hiring\s+now)\s*[:：—–-]\s*([^\n;!?|]{2,100})/giu,
      /\b(?:nous\s+recherchons|nous\s+recrutons|recherchons|recrutons|nous\s+cherchons)\s+(?:(?:un|une|des|les)\s+)?([^\n;!?|]{2,100})/giu,
      /\bpostes?\s+(?:de|à\s+pourvoir\s*[:：—–-]\s*)([^\n;!?|]{2,100})/giu,
      /(?:مطلوب(?:ة)?(?:\s+للعمل)?|نبحث عن|نحتاج إلى|نحتاج)\s+([^\n,؛;.!?|]{2,100})/gu,
      /(?:وظيفة شاغرة|منصب شاغر)\s*[:：—–-]?\s*([^\n,؛;.!?|]{2,100})/gu
    ];
    const candidates = new Map();
    for (const pattern of patterns) {
      for (const match of String(text || "").matchAll(pattern)) {
        const title = cleanJobTitleCandidate(trimTitleAtTopLevelSeparator(match[1]));
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
      const base = globalThis.location?.origin || "https://www.linkedin.com";
      const url = new URL(String(value || ""), base);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (_error) {
      return null;
    }
  }

  function extractPostLinks(hrefs) {
    const unique = Array.from(new Set(hrefs.map(toAbsoluteHttpUrl).filter(Boolean)));
    // B8: LinkedIn navigation, profiles, hashtags and messaging links are noise in a hiring
    // export. Keep external domains as-is, and only the LinkedIn paths a hiring post needs.
    const useful = unique.filter((href) => {
      try {
        const url = new URL(href);
        const host = url.hostname.toLowerCase().replace(/^www\./u, "");
        if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
          return /^\/(?:jobs|job|careers|company)\//u.test(url.pathname);
        }
        return true;
      } catch (_error) {
        return false;
      }
    });
    return useful.slice(0, 40);
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

  // B11: the permalink shape depends on the URN type. Jobs use /jobs/view/<id>/, activity and
  // share URNs resolve under /feed/update/. Building /feed/update/ for a jobPosting URN
  // produced a dead link in past exports.
  function permalinkForUrn(urn) {
    if (!urn || !POST_URN_PATTERN.test(urn)) return null;
    if (/^urn:li:jobPosting:/iu.test(urn)) {
      const id = urn.split(":").pop();
      return id ? `https://www.linkedin.com/jobs/view/${id}/` : null;
    }
    return `https://www.linkedin.com/feed/update/${urn}/`;
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
    return permalinkForUrn(getStableId(root));
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
    // B6: the activity URN embeds the publish time (milliseconds). It is the last reliable
    // fallback when LinkedIn's timestamp class tokens rotate away.
    if (!publishedAt) {
      const activityUrn = /urn:li:activity:(\d{13,})/iu.exec(getStableId(root) || "");
      const candidateMs = activityUrn ? Number(activityUrn[1]) : NaN;
      if (Number.isFinite(candidateMs) &&
          candidateMs > Date.UTC(2008, 0, 1) &&
          candidateMs < capturedAtMs + 86_400_000) {
        publishedAt = new Date(candidateMs).toISOString();
      }
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
    // Spaced digit groups (French/Spanish thousands and non-breaking spaces) must be
    // captured whole: "1 234" previously stopped at the space and read as 1.
    const match = text.match(/(\d(?:[\d.,\s\u00a0]*\d)?)(?:\s*([kmb]|ألف|الف|مليون|مليار))?/iu);
    if (!match) return null;
    let numberText = match[1];
    const suffix = match[2] || "";
    // Comma/dot ambiguity is resolved BEFORE collapsing spaces, whose role is always
    // thousands ("1 234,5" → 1234.5, "1,234" → 1234, "1 234" → 1234).
    const collapseSpaces = (fragment) => fragment.replace(/[\s\u00a0]/g, "");
    const hasComma = numberText.includes(",");
    const hasDot = numberText.includes(".");
    if (hasComma && hasDot) {
      // Mixed separators: dots are decimals, commas are thousands.
      numberText = collapseSpaces(numberText.replace(/,/g, ""));
    } else if (hasComma) {
      const decimals = numberText.length - numberText.lastIndexOf(",") - 1;
      if (decimals > 0 && decimals <= 2) {
        // A short trailing group is a decimal ("1 234,5", "1,5 k"); earlier commas stay thousands.
        numberText = collapseSpaces(
          numberText.slice(0, numberText.lastIndexOf(",")).replace(/,/g, "") +
          "." + numberText.slice(numberText.length - decimals)
        );
      } else {
        numberText = collapseSpaces(numberText.replace(/,/g, ""));
      }
    } else {
      if (!suffix && /\.\d{3}$/u.test(numberText)) numberText = numberText.replace(/\./g, "");
      numberText = collapseSpaces(numberText);
    }
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
    const numberAfter = after.match(/^\s*(?:[:(·—-]\s*)?(\d(?:[\d.,\s\u00a0]*\d)?(?:\s*(?:[kmb]|ألف|الف|مليون|مليار))?)/iu);
    if (numberAfter) return parseMetricNumber(numberAfter[1]);
    const numberBefore = Array.from(before.matchAll(/(\d(?:[\d.,\s\u00a0]*\d)?(?:\s*(?:[kmb]|ألف|الف|مليون|مليار))?)/giu));
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
    // B7: when every social token rotated away, look at the structural engagement bar — the
    // button list next to the post body. Only labelled counts that name a metric are read, so
    // follower counts and dates cannot leak in.
    if (Object.values(metrics).every((count) => count === null)) {
      const body = findBodyNode(scope);
      const region = body && body !== scope
        ? body.closest("article,li,[role='article']") || body.parentElement
        : null;
      if (region) {
        const structuralNodes = Array.from(region.querySelectorAll("ul button,ul [role='button'],div button,div [role='button']"))
          .filter((node) => !isCommentThreadNode(node, scope));
        for (const [metric, pattern] of Object.entries(metricPatterns)) {
          if (metrics[metric] !== null) continue;
          for (const node of structuralNodes) {
            const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.innerText || node.textContent || ""}`;
            if (!pattern.test(label)) continue;
            const count = parseMetricCount(label, pattern);
            if (count !== null) {
              metrics[metric] = count;
              break;
            }
          }
        }
      }
    }
    return metrics;
  }

  // One identity walk per record: stable id, permalink and author each traverse the card's
  // DOM, so createExportRecord reuses the bundle getArchiveKey/extractPostRecord already
  // collected instead of re-reading the same anchors.
  function getPostIdentityBundle(root) {
    const hrefs = getHrefs(root);
    return {
      hrefs,
      stableId: getStableId(root),
      permalink: getPostPermalink(root, hrefs),
      author: getAuthorDetails(root, hrefs)
    };
  }

  function archiveKeyFromBundle(bundle, text) {
    return shared.canonicalPostId({
      id: bundle.stableId || undefined,
      permalink: bundle.permalink,
      author: bundle.author,
      fullText: text
    });
  }

  function getArchiveKey(root, text) {
    return archiveKeyFromBundle(getPostIdentityBundle(root), text);
  }

  function createExportRecord(root, key, details, classification, category, previous, capturedAtMs, identity = null) {
    const capturedAt = new Date(capturedAtMs).toISOString();
    const bundle = identity || getPostIdentityBundle(root);
    const record = {
      id: key,
      sourcePostId: bundle.stableId || null,
      permalink: bundle.permalink,
      author: bundle.author,
      category,
      confidence: details.partial ? "partial" : classification.confidence,
      score: classification.score,
      scoreBasis: classification.scoreBasis || null,
      scoreMax: classification.scoreMax ?? null,
      evidence: classification.evidence,
      evidenceDetail: classification.evidenceDetail || [],
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
        emails: extractPostEmails(details.text, bundle.hrefs),
        jobTitles: extractJobTitleCandidates(details.text),
        hashtags: extractHashtags(details.text),
        links: extractPostLinks(bundle.hrefs)
      }
    };
    // Category history: a post that first appeared as `partial` and later classified as an
    // opening must not lose that audit trail. Capped at five entries, appended only when the
    // verdict actually changes (re-scans with identical results are not history).
    const history = Array.isArray(previous?.classificationHistory) ? previous.classificationHistory.slice() : [];
    const lastEntry = history[history.length - 1];
    const nextEntry = { category, confidence: record.confidence, seenAt: capturedAt };
    if (!lastEntry || lastEntry.category !== nextEntry.category || lastEntry.confidence !== nextEntry.confidence) {
      history.push(nextEntry);
    }
    record.classificationHistory = history.slice(-5);
    return previous ? shared.mergePostRecords(previous, record) : record;
  }

  function extractPostRecord(root, { capturedAtMs = Date.now(), previous = null } = {}) {
    const details = getPostTextDetails(root);
    const identity = getPostIdentityBundle(root);
    const classification = classifier.classify(details.text, { hrefs: identity.hrefs, sponsored: details.sponsored });
    const category = details.partial && classification.category === "none" ? "partial" : classification.category;
    const key = archiveKeyFromBundle(identity, details.text);
    return createExportRecord(root, key, details, classification, category, previous, capturedAtMs, identity);
  }

  // Provenance: the extractor hash covers the selector tables and label lists, so an export
  // made after a LinkedIn DOM selector change is distinguishable from an older one.
  const sha = globalThis.__LI_SHA256__ ||
    (typeof require === "function" ? require("../../core/sha256.js") : null);
  const extractorHash = sha
    ? sha.digest(JSON.stringify({
      moreLabels: MORE_LABELS,
      chromeSelectors: CHROME_SELECTORS,
      actorSelector: ACTOR_SELECTOR,
      actorNameSelector: ACTOR_NAME_SELECTOR,
      genericTitleLabels: [...GENERIC_TITLE_LABELS],
      jobLinkPatterns: globalThis.__LI_FEED_HIRING_RULES__?.jobLinkPatterns || null
    }))
    : null;

  const api = {
    MORE_LABELS, normalizeLabel, isSeeMoreControl, isElementVisible, isCardNearViewport, isFeedListItem,
    isCardClassToken, isLikelyPostRoot, findPostRoot, findPostRootsInScope, deduplicateNestedRoots,
    collectPostRoots, POST_URN_PATTERN, ACTOR_SELECTOR, ACTOR_NAME_SELECTOR, isActorContainer,
    urnIn, postIdentityOf, urnFromHrefs, urnFromDescendants, resolveContentScope, belongsToPostRoot,
    findSeeMore, findBodyNode, cleanText, CHROME_SELECTORS, SPONSORED_PATTERN, isSponsoredCard,
    visibleText, nodeText, getPostTextDetails, getHrefs, getStableId, extractJobTitleCandidates,
    extractHashtags, toAbsoluteHttpUrl, extractPostLinks, extractPostEmails, getPostPermalink, permalinkForUrn,
    getAuthorDetails, asciiDigits, ABSOLUTE_DATE_PATTERNS, parseAbsoluteDateMs, findAgeLabel,
    parseApproxAgeSeconds, isCommentThreadNode, getPostAge, parseMetricNumber, parseMetricCount,
    getPostMetrics, getArchiveKey, createExportRecord, extractPostRecord, extractorHash
  };
  globalThis.__LI_FEED_HIRING_POST_EXTRACT__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
