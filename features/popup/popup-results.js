(() => {
  "use strict";

  const shared = globalThis.__LI_FEED_SHARED__ || (typeof require === "function" ? require("../../core/linkedin-shared.js") : null);
  const i18n = globalThis.__LI_FEED_I18N__ || (typeof require === "function" ? require("./popup-i18n.js") : null);
  if (!shared || !i18n) throw new Error("Shared and localization primitives must load before result rendering.");
  const t = (key, substitutions) => i18n.t(key, substitutions);

  const CATEGORY_LABELS = {
    open_role: "Opening",
    recruiter_search: "Recruiter search",
    possible: "Possible match",
    job_seeker: "Job seeker / referral",
    hiring_discussion: "Hiring advice / news",
    closed: "Closed / negative",
    partial: "Partial text",
    none: "No hiring signal"
  };
  const REVIEW_LABELS = new Set(["useful", "irrelevant", "false_positive"]);

  function postKey(post) {
    return String(post?.id || post?.sourcePostId || post?.permalink || "");
  }

  function setText(node, value) {
    const text = String(value ?? "");
    if (node.textContent !== text) node.textContent = text;
  }

  function originalLink(post, className = "original-post-link", documentRef = globalThis.document) {
    const href = shared.canonicalizeLinkedInUrl(post?.permalink, "permalink");
    if (!href) return null;
    const anchor = documentRef.createElement("a");
    anchor.className = className;
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = t("results.openOriginal");
    return anchor;
  }

  function createResultRow(post, options = {}) {
    const documentRef = options.documentRef || globalThis.document;
    const item = documentRef.createElement("article");
    item.className = "match-item";
    item.dataset.postId = postKey(post);

    const top = documentRef.createElement("div");
    top.className = "match-topline";
    const category = documentRef.createElement("span");
    category.className = "match-category";
    const confidence = documentRef.createElement("span");
    confidence.className = "confidence-chip";
    const pipelineBadge = documentRef.createElement("span");
    pipelineBadge.className = "pipeline-badge";
    pipelineBadge.hidden = true;
    top.append(category, confidence, pipelineBadge);

    const snippet = documentRef.createElement("p");
    snippet.className = "match-snippet";
    const evidence = documentRef.createElement("p");
    evidence.className = "match-evidence";
    const actions = documentRef.createElement("div");
    actions.className = "result-actions";
    // Pipeline marks are local bookkeeping; they never feed back into detection.
    for (const [state, labelKey] of [["saved", "pipeline.save"], ["applied", "pipeline.markApplied"]]) {
      const toggle = documentRef.createElement("button");
      toggle.type = "button";
      toggle.className = "button button-ghost pipeline-toggle";
      toggle.dataset.pipelineAction = state;
      toggle.setAttribute("aria-pressed", "false");
      toggle.textContent = t(labelKey);
      toggle.addEventListener("click", () => item._resultOptions?.onPipeline?.(item.dataset.postId, state));
      actions.append(toggle);
    }
    const detail = documentRef.createElement("button");
    detail.type = "button";
    detail.className = "button button-secondary detail-button";
    detail.textContent = t("results.details");
    detail.addEventListener("click", () => item._resultOptions?.onDetail?.(item.dataset.postId));
    actions.append(detail);

    const reviewRow = documentRef.createElement("div");
    reviewRow.className = "review-row";
    const reviewCopy = documentRef.createElement("span");
    reviewCopy.className = "review-label";
    reviewCopy.textContent = t("review.label");
    const reviewSelect = documentRef.createElement("select");
    reviewSelect.className = "review-select";
    reviewSelect.setAttribute("aria-label", t("review.aria"));
    for (const [value, label] of [["", "review.none"], ["useful", "review.useful"], ["irrelevant", "review.irrelevant"], ["false_positive", "review.false_positive"]]) {
      const option = documentRef.createElement("option");
      option.value = value;
      option.textContent = t(label);
      reviewSelect.append(option);
    }
    reviewSelect.addEventListener("change", () => {
      const label = REVIEW_LABELS.has(reviewSelect.value) ? reviewSelect.value : "";
      item._resultOptions?.onReview?.(item.dataset.postId, label);
    });
    reviewRow.append(reviewCopy, reviewSelect);
    item.append(top, snippet, evidence, actions, reviewRow);
    item._resultOptions = options;
    updateResultRow(item, post, options);
    return item;
  }

  function updateResultRow(item, post, options) {
    item._resultOptions = options;
    const category = item.querySelector(".match-category");
    const confidence = item.querySelector(".confidence-chip");
    const partial = post.contentComplete === false || post.extractionStatus === "partial" || post.partial === true;
    category.className = `match-category ${post.category || "possible"}`;
    setText(category, options.categoryLabels?.[post.category] || t(CATEGORY_LABELS[post.category] ? `category.${post.category}` : "category.possible"));
    confidence.className = `confidence-chip ${post.confidence || "low"}`;
    const confidenceKey = ["strong", "likely", "low"].includes(post.confidence) ? `confidence.${post.confidence}` : "confidence.review";
    setText(confidence, partial ? t("review.partial") : t(confidenceKey));
    setText(item.querySelector(".match-snippet"), post.snippet || post.fullText || t("results.noPreview"));
    setText(item.querySelector(".match-evidence"), Array.isArray(post.evidence) && post.evidence.length
      ? t("results.signals", { signals: post.evidence.join(" · ") })
      : t("results.lowConfidence"));

    let partialNote = item.querySelector(".partial-note");
    if (partial && !partialNote) {
      partialNote = item.ownerDocument.createElement("span");
      partialNote.className = "partial-note";
      partialNote.textContent = t("results.partial");
      item.querySelector(".match-evidence").after(partialNote);
    } else if (!partial && partialNote) partialNote.remove();

    // Age is shown only when the page exposed it, so a missing timestamp is never guessed.
    // A stale marker keeps months-old openings visibly separate from current ones.
    const ageLabel = post?.postAge?.label || null;
    const stale = post?.stale === true && Boolean(ageLabel);
    item.classList.toggle("stale", stale);
    let ageNode = item.querySelector(".match-age");
    if (ageLabel) {
      if (!ageNode) {
        ageNode = item.ownerDocument.createElement("span");
        ageNode.className = "match-age";
        item.querySelector(".match-topline").append(ageNode);
      }
      setText(ageNode, t("results.postedAge", { age: ageLabel }));
    } else if (ageNode) ageNode.remove();

    let staleNote = item.querySelector(".stale-note");
    if (stale) {
      if (!staleNote) {
        staleNote = item.ownerDocument.createElement("span");
        staleNote.className = "stale-note";
        item.querySelector(".match-evidence").after(staleNote);
      }
      setText(staleNote, t("results.staleNote"));
    } else if (staleNote) staleNote.remove();

    const actions = item.querySelector(".result-actions");
    let link = actions.querySelector(".original-post-link");
    const expectedHref = shared.canonicalizeLinkedInUrl(post.permalink, "permalink");
    if (expectedHref && !link) {
      link = originalLink(post, "original-post-link", item.ownerDocument);
      actions.append(link);
    } else if (expectedHref && link.href !== expectedHref) link.href = expectedHref;
    if (!expectedHref && link) link.remove();

    setText(item.querySelector(".detail-button"), t("results.details"));
    if (link) setText(link, t("results.openOriginal"));
    setText(item.querySelector(".review-label"), t("review.label"));
    const review = item.querySelector(".review-select");
    review.setAttribute("aria-label", t("review.aria"));
    for (const option of review.options) option.textContent = t(option.value ? `review.${option.value}` : "review.none");
    review.disabled = !postKey(post);
    if (review.ownerDocument.activeElement !== review) {
      const entry = options.reviewLabels instanceof Map
        ? options.reviewLabels.get(postKey(post))
        : options.reviewLabels?.[postKey(post)];
      const label = typeof entry === "string" ? entry : entry?.label;
      review.value = REVIEW_LABELS.has(label) ? label : "";
    }

    // "New" is a property of the run, not a stored mark: a post loses the badge once it
    // gets a pipeline state or the next run moves the baseline past it.
    const key = postKey(post);
    const pipelineState = shared.pipelineStateOf(options.pipeline, key);
    const fresh = !pipelineState && shared.isNewSince(post, options.baselineAt);
    const badge = item.querySelector(".pipeline-badge");
    if (badge) {
      badge.hidden = !pipelineState && !fresh;
      badge.className = `pipeline-badge${pipelineState ? ` ${pipelineState}` : " new"}`;
      setText(badge, t(pipelineState === "saved" ? "pipeline.savedBadge"
        : pipelineState === "applied" ? "pipeline.appliedBadge" : "pipeline.newBadge"));
    }
    for (const toggle of item.querySelectorAll("[data-pipeline-action]")) {
      const action = toggle.getAttribute("data-pipeline-action");
      const active = pipelineState === action;
      toggle.classList.toggle("is-active", active);
      toggle.setAttribute("aria-pressed", String(active));
      toggle.disabled = !key;
      setText(toggle, t(action === "saved" ? "pipeline.save" : "pipeline.markApplied"));
    }
  }

  function emptyCopy(options) {
    const filter = options.pipelineFilter;
    if (filter === "new") return { title: "pipeline.emptyNew", detail: "results.emptyMonitorDetail" };
    if (filter === "saved") return { title: "pipeline.emptySaved", detail: "results.emptyMonitorDetail" };
    if (filter === "applied") return { title: "pipeline.emptyApplied", detail: "results.emptyMonitorDetail" };
    return {
      title: options.monitoring ? "results.emptyMonitorTitle" : "results.emptyTitle",
      detail: options.monitoring ? "results.emptyMonitorDetail" : "results.emptyDetail"
    };
  }

  function renderEmpty(container, options) {
    const copy = emptyCopy(options);
    // The flag lives on the container: renderResults uses it to know the list holds the
    // placeholder rather than rows, and a stale placeholder must never trail real results.
    if (container.dataset.empty === "true") {
      setText(container.querySelector("strong"), t(copy.title));
      setText(container.querySelector("span:last-child"), t(copy.detail));
      return;
    }
    const documentRef = container.ownerDocument;
    const empty = documentRef.createElement("div");
    empty.className = "empty-state";
    const icon = documentRef.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌕";
    const title = documentRef.createElement("strong");
    title.textContent = t(copy.title);
    const detail = documentRef.createElement("span");
    detail.textContent = t(copy.detail);
    empty.append(icon, title, detail);
    container.dataset.empty = "true";
    container.replaceChildren(empty);
  }

  function renderResults(container, results, options = {}) {
    const items = (Array.isArray(results) ? results : []).filter((post) => postKey(post));
    if (!items.length) {
      renderEmpty(container, options);
      return;
    }
    // popup.html ships a static placeholder so the pane is never blank before the first
    // status arrives; it has to go as soon as there is a real row to show.
    container.querySelectorAll(":scope > .empty-state").forEach((node) => node.remove());
    delete container.dataset.empty;
    const existing = new Map(Array.from(container.querySelectorAll(":scope > [data-post-id]"), (row) => [row.dataset.postId, row]));
    const desired = items.map((post) => {
      const key = postKey(post);
      const row = existing.get(key) || createResultRow(post, { ...options, documentRef: container.ownerDocument });
      updateResultRow(row, post, options);
      existing.delete(key);
      return row;
    });
    for (const row of existing.values()) row.remove();
    desired.forEach((row, index) => {
      const current = container.children[index] || null;
      if (current !== row) container.insertBefore(row, current);
    });
  }

  function renderDetail(container, post, options = {}) {
    const documentRef = container.ownerDocument;
    const close = documentRef.createElement("button");
    close.type = "button";
    close.className = "button button-secondary detail-close";
    close.dataset.closeDetail = "true";
    close.textContent = t("results.closeDetails");
    close.addEventListener("click", () => {
      container.hidden = true;
      options.onClose?.();
    });
    const title = documentRef.createElement("h3");
    title.textContent = post?.author?.name || t("results.details");
    const author = documentRef.createElement("p");
    author.className = "detail-author";
    author.textContent = post?.author?.name ? t("results.author", { name: post.author.name }) : t("results.authorUnavailable");
    const fullText = documentRef.createElement("p");
    fullText.className = "detail-full-text";
    fullText.textContent = post?.fullText || t("results.fullTextUnavailable");
    const age = documentRef.createElement("p");
    age.className = "detail-age";
    age.textContent = t("results.age", {
      age: post?.postAge?.label || post?.postAge?.publishedAt || post?.firstSeenAt || t("results.unavailable")
    });
    const evidence = documentRef.createElement("p");
    evidence.className = "detail-evidence";
    evidence.textContent = Array.isArray(post?.evidence) && post.evidence.length
      ? t("results.signals", { signals: post.evidence.join(" · ") })
      : t("results.lowConfidence");
    const metrics = documentRef.createElement("p");
    metrics.className = "detail-metrics";
    const values = post?.metrics || {};
    const display = (value) => value === null || value === undefined ? t("results.unavailable") : String(value);
    metrics.textContent = t("results.metrics", {
      reactions: display(values.reactions), comments: display(values.comments),
      reposts: display(values.reposts), views: display(values.views)
    });
    const extraction = documentRef.createElement("p");
    extraction.className = "detail-extraction";
    const extractionStatus = post?.extractionStatus || (post?.contentComplete === false ? "partial" : "complete");
    extraction.textContent = t("results.extraction", {
      status: ["complete", "partial"].includes(extractionStatus) ? t(`extraction.${extractionStatus}`) : extractionStatus
    });
    container.replaceChildren(close, title, author, fullText, age, evidence, metrics, extraction);
    const link = originalLink(post, "original-post-link", documentRef);
    if (link) container.append(link);
    container.hidden = false;
  }

  const api = { postKey, createResultRow, renderResults, renderDetail, CATEGORY_LABELS };
  globalThis.__LI_FEED_RESULTS__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
