(() => {
  "use strict";

  const shared = globalThis.__LI_FEED_SHARED__ || (typeof require === "function" ? require("./linkedin-shared.js") : null);
  if (!shared) throw new Error("Shared primitives must load before export helpers.");

  function migratePost(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const fullText = String(raw.fullText ?? raw.text ?? raw.snippet ?? "");
    const author = raw.author && typeof raw.author === "object" && !Array.isArray(raw.author)
      ? { name: raw.author.name || null, profileUrl: raw.author.profileUrl || null }
      : { name: typeof raw.author === "string" ? raw.author : null, profileUrl: null };
    if (author.profileUrl) author.profileUrl = shared.canonicalizeLinkedInUrl(author.profileUrl, "profile");
    const permalink = raw.permalink || raw.url
      ? shared.canonicalizeLinkedInUrl(raw.permalink || raw.url, "permalink")
      : null;
    const firstSeenAt = raw.firstSeenAt || raw.observedAt || raw.lastSeenAt || null;
    const lastSeenAt = raw.lastSeenAt || raw.observedAt || firstSeenAt;
    const contentComplete = raw.contentComplete ?? raw.textIsComplete ?? true;
    const extracted = { ...(raw.extracted || {}) };
    if (!Array.isArray(extracted.emails) && Array.isArray(raw.emails)) extracted.emails = [...raw.emails];
    const metrics = {
      reactions: raw.metrics?.reactions ?? raw.likesCount ?? null,
      comments: raw.metrics?.comments ?? raw.commentsCount ?? null,
      reposts: raw.metrics?.reposts ?? raw.repostsCount ?? null,
      views: raw.metrics?.views ?? null
    };
    const id = shared.canonicalPostId({ ...raw, author, fullText, permalink });
    return {
      ...raw,
      id,
      sourcePostId: raw.sourcePostId || null,
      category: raw.category || "none",
      confidence: raw.confidence || null,
      score: Number.isFinite(raw.score) ? raw.score : null,
      evidence: Array.isArray(raw.evidence) ? [...raw.evidence] : [],
      signals: raw.signals && typeof raw.signals === "object" ? { ...raw.signals } : {},
      fullText,
      contentComplete: contentComplete !== false,
      extractionStatus: raw.extractionStatus || (contentComplete === false ? "partial" : "complete"),
      firstSeenAt,
      lastSeenAt,
      author,
      permalink,
      extracted,
      metrics
    };
  }

  function sourceRecords(source) {
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.posts)) return source.posts;
    if (Array.isArray(source?.records)) return source.records;
    return [];
  }

  function mergeExportSources(current, history, options = {}) {
    const merged = new Map();
    const add = (raw, source) => {
      const record = migratePost(raw);
      if (!record) return;
      const provenance = raw.historyStores || [raw.historyStore || source];
      const existing = merged.get(record.id);
      if (!existing) {
        merged.set(record.id, { ...record, historyStores: [...new Set(provenance)] });
        return;
      }
      const combined = shared.mergePostRecords(existing, record);
      combined.historyStores = [...new Set([...(existing.historyStores || []), ...provenance])];
      merged.set(record.id, combined);
    };
    for (const record of sourceRecords(history)) add(record, "persistent");
    for (const record of sourceRecords(current)) add(record, "current");
    const labels = options.reviewLabels;
    return [...merged.values()].map((record) => {
      const historyStores = record.historyStores || [];
      const label = labels instanceof Map ? labels.get(record.id)?.label : labels?.[record.id]?.label;
      return {
        ...record,
        historyStore: historyStores.length === 1 ? historyStores[0] : "combined",
        historyStores,
        reviewLabel: label || record.reviewLabel || null
      };
    }).sort((a, b) => (Date.parse(a.firstSeenAt || "") || 0) - (Date.parse(b.firstSeenAt || "") || 0));
  }

  function selectedPosts(posts, preferences) {
    const source = sourceRecords(posts);
    return preferences.exportFilteredOnly && preferences.filter !== "all"
      ? source.filter((post) => post?.category === preferences.filter)
      : source;
  }

  function projectPost(raw, preferences = {}) {
    const post = migratePost(raw);
    const fields = shared.sanitizeHiringPreferences(preferences);
    if (!post) return null;
    // Export schema 3 carries only what a reviewer reads: how to open the post, the verdict and
    // why, who posted it, what was extracted, when it was posted, and the text. Internal
    // bookkeeping stays inside the extension: per-run timestamps, history provenance, review
    // labels, completeness flags and engagement metrics are used for merging, retention and
    // ordering, and exporting them only made the file harder to read. `permalink` is always
    // present — an export whose posts cannot be opened is not usable.
    const signals = post.signals || {};
    const output = {
      id: post.id,
      permalink: post.permalink,
      category: post.category,
      confidence: post.confidence,
      score: post.score,
      evidence: post.evidence,
      // The remaining two signals are the ones a reviewer acts on: how to apply, and whether the
      // post links to a job board. The rest are intermediate classifier state.
      signals: { email: signals.email || "none", jobLink: Boolean(signals.jobLink) }
    };
    const extracted = {};
    if (fields.includeEmails) extracted.emails = post.extracted.emails || [];
    if (fields.includeJobTitles) extracted.jobTitles = post.extracted.jobTitles || [];
    if (fields.includePostMetadata) {
      output.author = post.author;
      extracted.hashtags = post.extracted.hashtags || [];
      extracted.links = post.extracted.links || [];
    }
    if (Object.keys(extracted).length) output.extracted = extracted;
    if (fields.includePostAge) {
      const age = post.postAge || {};
      output.postAge = { label: age.label || null, publishedAt: age.publishedAt || null };
    }
    if (fields.includeFullText) output.fullText = post.fullText;
    return output;
  }

  function buildJsonPayload(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    return {
      schemaVersion: shared.SCHEMA_VERSION,
      exportedAt: options.now ? options.now() : new Date().toISOString(),
      scope: options.scope || (preferences.exportFilteredOnly
        ? `Posts from the selected category: ${preferences.filter}.`
        : "All detected posts available from the current run and local history."),
      selectedCategory: preferences.exportFilteredOnly ? preferences.filter : "all",
      fieldsIncluded: {
        fullText: preferences.includeFullText,
        emails: preferences.includeEmails,
        jobTitles: preferences.includeJobTitles,
        postAge: preferences.includePostAge,
        postMetadata: preferences.includePostMetadata
      },
      monitorRun: options.monitorRun || null,
      extractionNotes: options.extractionNotes || null,
      posts: projected
    };
  }

  function buildCsv(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    const fields = [
      ["id", (post) => post.id],
      ["permalink", (post) => post.permalink],
      ["category", (post) => post.category],
      ["confidence", (post) => post.confidence],
      ["score", (post) => post.score],
      ["evidence", (post) => post.evidence],
      ["email", (post) => post.signals?.email],
      ["jobLink", (post) => post.signals?.jobLink]
    ];
    if (preferences.includePostAge) fields.push(
      ["ageLabel", (post) => post.postAge?.label],
      ["publishedAt", (post) => post.postAge?.publishedAt]
    );
    if (preferences.includeEmails) fields.push(["emails", (post) => post.extracted?.emails]);
    if (preferences.includeJobTitles) fields.push(["jobTitleCandidates", (post) => post.extracted?.jobTitles]);
    if (preferences.includePostMetadata) fields.push(
      ["authorName", (post) => post.author?.name],
      ["authorProfileUrl", (post) => post.author?.profileUrl],
      ["hashtags", (post) => post.extracted?.hashtags],
      ["links", (post) => post.extracted?.links]
    );
    if (preferences.includeFullText) fields.push(["fullText", (post) => post.fullText]);
    const rows = [fields.map(([name]) => shared.csvCell(name)).join(",")];
    for (const post of projected) rows.push(fields.map(([, getValue]) => shared.csvCell(getValue(post))).join(","));
    return `\uFEFF${rows.join("\r\n")}`;
  }

  function numericRecord(value) {
    const output = {};
    for (const [key, item] of Object.entries(value || {})) {
      if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
      else if (typeof item === "boolean") output[key] = item;
    }
    return output;
  }

  function sanitizeDiagnostic(input = {}) {
    const errors = Array.isArray(input.errors)
      ? input.errors.map((error) => ({
        code: String(error?.code || "unknown").replace(/[^a-z0-9_]/gi, "").slice(0, 60) || "unknown",
        count: Number.isFinite(error?.count) ? error.count : 1
      }))
      : Object.entries(input.errors || {}).map(([code, count]) => ({
        code: String(code).replace(/[^a-z0-9_]/gi, "").slice(0, 60) || "unknown",
        count: Number.isFinite(count) ? count : 1
      }));
    return {
      schemaVersion: shared.SCHEMA_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
      extensionVersion: String(input.extensionVersion || "2.0.0").replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 30),
      browserVersion: String(input.browserVersion || "unknown").replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 40) || "unknown",
      messageSchemaVersion: String(input.messageSchemaVersion || shared.MESSAGE_SCHEMA_VERSION).replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 20),
      operations: numericRecord(input.operations),
      errors,
      selectorHealth: numericRecord(input.selectorHealth),
      timings: numericRecord(input.timings),
      counts: numericRecord(input.counts)
    };
  }

  function downloadDiagnostic(input, options = {}) {
    const documentRef = options.documentRef || globalThis.document;
    const urlApi = options.urlApi || globalThis.URL;
    const now = options.now || (() => new Date().toISOString());
    const diagnostic = sanitizeDiagnostic({ ...input, generatedAt: now() });
    const json = JSON.stringify(diagnostic, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const objectUrl = urlApi.createObjectURL(blob);
    const anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `linkerter-diagnostic-${String(diagnostic.generatedAt).replace(/:/g, "-")}.json`;
    anchor.style.display = "none";
    documentRef.body.append(anchor);
    anchor.click();
    anchor.remove();
    const revoke = () => urlApi.revokeObjectURL(objectUrl);
    if (Number(options.revokeDelayMs) > 0) setTimeout(revoke, Number(options.revokeDelayMs));
    else revoke();
    return { ok: true, diagnostic, json, filename: anchor.download };
  }

  const api = { projectPost, buildJsonPayload, buildCsv, mergeExportSources, migratePost, sanitizeDiagnostic, downloadDiagnostic };
  globalThis.__LI_FEED_EXPORT__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
