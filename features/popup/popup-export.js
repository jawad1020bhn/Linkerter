(() => {
  "use strict";

  const shared = globalThis.__LI_FEED_SHARED__ || (typeof require === "function" ? require("../../core/linkedin-shared.js") : null);
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

  // Age policy mirrors the monitor: an opening first seen more than 60 days ago may no longer
  // be active. Computed at serialization so old history records get the flag too.
  const STALE_OPENING_AGE_DAYS = 60;

  function resolveRunId(options = {}) {
    if (typeof options.exportRunId === "string" && options.exportRunId) return options.exportRunId;
    const cryptoRef = globalThis.crypto;
    if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function resolveExtensionVersion(options = {}) {
    if (options.extensionVersion) return String(options.extensionVersion);
    try {
      return String(globalThis.chrome?.runtime?.getManifest?.()?.version || "2.0.0");
    } catch (_error) {
      return "2.0.0";
    }
  }

  // Provenance hashes are computed by the modules themselves at load time. The popup loads
  // the same core modules as the content script, so both contexts derive identical values.
  function provenanceSnapshot(options = {}) {
    const explicit = options.provenance && typeof options.provenance === "object" ? options.provenance : {};
    return {
      rulesHash: explicit.rulesHash || globalThis.__LI_FEED_HIRING_RULES__?.tablesHash || null,
      classifierHash: explicit.classifierHash || globalThis.__LI_FEED_HIRING_CLASSIFIER__?.classifierHash || null,
      extractorHash: explicit.extractorHash || globalThis.__LI_FEED_HIRING_POST_EXTRACT__?.extractorHash || null
    };
  }

  // v4 evidence is structured ({label, phrase, occurrences}); records produced before the
  // classifier exposed occurrence indices still project from their display strings.
  function structuredEvidence(post) {
    const detail = Array.isArray(post.evidenceDetail) ? post.evidenceDetail : null;
    if (detail && detail.length) {
      return detail
        .map((entry) => ({
          label: String(entry?.label || ""),
          phrase: entry?.phrase == null ? null : String(entry.phrase),
          occurrences: Array.isArray(entry?.occurrences)
            ? entry.occurrences.filter((index) => Number.isInteger(index))
            : []
        }))
        .filter((entry) => entry.label);
    }
    return (Array.isArray(post.evidence) ? post.evidence : []).map((entry) => {
      // Schema-v4 records can already carry structured evidence (a projected record that is
      // projected again, or history written by a future version). Stringifying those would
      // turn every line into "[object Object]".
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return {
          label: String(entry.label || ""),
          phrase: entry.phrase == null ? null : String(entry.phrase),
          occurrences: Array.isArray(entry.occurrences)
            ? entry.occurrences.filter((index) => Number.isInteger(index))
            : []
        };
      }
      const text = String(entry);
      const separator = text.indexOf(": ");
      let label = separator === -1 ? text : text.slice(0, separator);
      let phrase = separator === -1 ? null : text.slice(separator + 2);
      const occurrences = [];
      // Pre-v4 evidence lines embedded the character offset as a trailing "@12".
      if (phrase) {
        const offset = /@(\d+)$/.exec(phrase);
        if (offset) {
          occurrences.push(Number(offset[1]));
          phrase = phrase.slice(0, offset.index);
        }
      }
      return { label, phrase, occurrences };
    });
  }

  function evidenceLine(entry) {
    if (!entry || !entry.label) return "";
    return entry.phrase ? `${entry.label}: ${entry.phrase}` : entry.label;
  }

  function projectSignals(signals = {}) {
    const output = {};
    for (const key of shared.EXPORT_SIGNAL_KEYS) {
      if (key === "email") {
        output.email = ["none", "partial", "full"].includes(signals.email) ? signals.email : "none";
      } else {
        output[key] = signals[key] === true;
      }
    }
    return output;
  }

  function projectPostAge(post) {
    const age = post.postAge;
    if (!age || typeof age !== "object") return null;
    let days = Number(age.ageDaysApprox);
    if (!Number.isFinite(days)) {
      const published = Date.parse(age.publishedAt || "");
      days = Number.isFinite(published) ? (Date.now() - published) / 86_400_000 : null;
    }
    const ageDaysApprox = Number.isFinite(days) ? Math.round(days * 100) / 100 : null;
    const stale = post.stale === true ||
      (post.category === "open_role" && ageDaysApprox !== null && ageDaysApprox > STALE_OPENING_AGE_DAYS);
    if (!age.label && !age.publishedAt && ageDaysApprox === null) return null;
    return { label: age.label || null, publishedAt: age.publishedAt || null, ageDaysApprox, stale };
  }

  function projectPost(raw, preferences = {}) {
    const post = migratePost(raw);
    const fields = shared.sanitizeHiringPreferences(preferences);
    if (!post) return null;
    const signals = projectSignals(post.signals || {});
    const score = post.score;
    const scoreBasis = post.scoreBasis || (Number.isFinite(score) && score > 0 ? "openScore" : null);
    const scoreMax = post.scoreMax ??
      (scoreBasis === "recruiterScore" ? 10 : scoreBasis === "openScore" ? 15 : null);
    const output = {
      id: post.id,
      sourcePostId: post.sourcePostId || null,
      permalink: post.permalink,
      category: post.category,
      confidence: post.confidence,
      confidenceRank: shared.CONFIDENCE_RANK[post.confidence] ?? null,
      score,
      scoreMax,
      scoreBasis,
      evidence: structuredEvidence(post),
      signals,
      fullText: undefined,
      contentComplete: post.contentComplete,
      extractionStatus: post.extractionStatus,
      postAge: undefined,
      metrics: undefined,
      author: undefined,
      extracted: undefined,
      reviewLabel: post.reviewLabel || null,
      manualOverride: post.manualOverride || null,
      firstSeenAt: post.firstSeenAt,
      lastSeenAt: post.lastSeenAt
    };
    if (fields.includePostAge) output.postAge = projectPostAge(post);
    if (fields.includeMetrics) {
      const metrics = post.metrics || {};
      output.metrics = {
        reactions: Number.isFinite(metrics.reactions) ? metrics.reactions : null,
        comments: Number.isFinite(metrics.comments) ? metrics.comments : null,
        reposts: Number.isFinite(metrics.reposts) ? metrics.reposts : null,
        views: Number.isFinite(metrics.views) ? metrics.views : null
      };
    }
    if (fields.includePostMetadata) {
      output.author = {
        name: post.author?.name || null,
        profileUrl: post.author?.profileUrl || null,
        headline: post.author?.headline || null
      };
    }
    const extracted = {};
    if (fields.includeEmails) extracted.emails = post.extracted.emails || [];
    if (fields.includeJobTitles) extracted.jobTitles = post.extracted.jobTitles || [];
    if (fields.includePostMetadata) {
      extracted.hashtags = post.extracted.hashtags || [];
      extracted.links = post.extracted.links || [];
    }
    if (Object.keys(extracted).length) output.extracted = extracted;
    if (fields.includeFullText) output.fullText = post.fullText;
    if (Array.isArray(post.historyStores) && post.historyStores.length) {
      output.historyStores = [...post.historyStores];
    }
    if (Array.isArray(post.classificationHistory) && post.classificationHistory.length) {
      output.classificationHistory = post.classificationHistory.slice(-5);
    }
    // Drop the placeholder keys that were gated off, keeping field order stable.
    for (const key of ["fullText", "postAge", "metrics", "author", "extracted"]) {
      if (output[key] === undefined) delete output[key];
    }
    return output;
  }

  function fieldSummary(preferences) {
    return {
      fullText: preferences.includeFullText,
      emails: preferences.includeEmails,
      jobTitles: preferences.includeJobTitles,
      postAge: preferences.includePostAge,
      postMetadata: preferences.includePostMetadata,
      metrics: preferences.includeMetrics
    };
  }

  function buildJsonPayload(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    const exportedAt = options.now ? options.now() : new Date().toISOString();
    return {
      schemaVersion: shared.SCHEMA_VERSION,
      exportedAt,
      exportRunId: resolveRunId(options),
      extensionVersion: resolveExtensionVersion(options),
      locale: options.locale || "en",
      provenance: provenanceSnapshot(options),
      monitorRun: options.monitorRun || null,
      domHealthSnapshot: options.domHealthSnapshot || null,
      scope: options.scope || (preferences.exportFilteredOnly
        ? `Posts from the selected category: ${preferences.filter}.`
        : "All detected posts available from the current run and local history."),
      selectedCategory: preferences.exportFilteredOnly ? preferences.filter : "all",
      fieldsIncluded: fieldSummary(preferences),
      extractionNotes: options.extractionNotes || null,
      confidenceRank: { ...shared.CONFIDENCE_RANK },
      scoreBasis: {
        openScore: { max: globalThis.__LI_FEED_HIRING_CLASSIFIER__?.OPEN_SCORE_MAX ?? 15 },
        recruiterScore: { max: globalThis.__LI_FEED_HIRING_CLASSIFIER__?.RECRUITER_SCORE_MAX ?? 10 }
      },
      posts: projected
    };
  }

  function joinPipe(value) {
    if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== "").join("|");
    if (value === null || value === undefined) return "";
    return String(value);
  }

  // Column definitions are ordered exactly like the published schema (audit §11.3) plus the
  // dialect signals and review/override columns. Every column is always emitted; a field the
  // user did not request stays an empty cell, so index-based consumers never shift.
  const CSV_FIELDS = [
    ["id", (post) => post.id],
    ["permalink", (post) => post.permalink],
    ["category", (post) => post.category],
    ["confidence", (post) => post.confidence],
    ["confidenceRank", (post) => post.confidenceRank],
    ["score", (post) => post.score],
    ["scoreMax", (post) => post.scoreMax],
    ["scoreBasis", (post) => post.scoreBasis],
    ["evidence_count", (post) => post.evidence.length],
    ["evidence_phrases", (post) => joinPipe(post.evidence.map(evidenceLine))],
    ["signal_activeOpening", (post) => post.signals.activeOpening],
    ["signal_ambiguousOpening", (post) => post.signals.ambiguousOpening],
    ["signal_openingFrame", (post) => post.signals.openingFrame],
    ["signal_regional", (post) => post.signals.regional],
    ["signal_recruiterSearch", (post) => post.signals.recruiterSearch],
    ["signal_recruiterTerms", (post) => post.signals.recruiterTerms],
    ["signal_genericJobTerms", (post) => post.signals.genericJobTerms],
    ["signal_applicationCta", (post) => post.signals.applicationCta],
    ["signal_jobSeeker", (post) => post.signals.jobSeeker],
    ["signal_sponsored", (post) => post.signals.sponsored],
    ["signal_roleMarker", (post) => post.signals.roleMarker],
    ["signal_contractTerms", (post) => post.signals.contractTerms],
    ["signal_adviceNews", (post) => post.signals.adviceNews],
    ["signal_closed", (post) => post.signals.closed],
    ["signal_email", (post) => post.signals.email],
    ["signal_emailLink", (post) => post.signals.emailLink],
    ["signal_contactCues", (post) => post.signals.contactCues],
    ["signal_jobLink", (post) => post.signals.jobLink],
    ["signal_hashtag", (post) => post.signals.hashtag],
    ["signal_regionalMaghreb", (post) => post.signals.regionalMaghreb],
    ["signal_regionalGulf", (post) => post.signals.regionalGulf],
    ["signal_regionalLevant", (post) => post.signals.regionalLevant],
    ["signal_regionalEgypt", (post) => post.signals.regionalEgypt],
    ["contentComplete", (post) => post.contentComplete],
    ["extractionStatus", (post) => post.extractionStatus],
    ["ageLabel", (post) => post.postAge?.label],
    ["publishedAt", (post) => post.postAge?.publishedAt],
    ["ageDaysApprox", (post) => post.postAge?.ageDaysApprox],
    ["stale", (post) => post.postAge?.stale],
    ["metric_reactions", (post) => post.metrics?.reactions],
    ["metric_comments", (post) => post.metrics?.comments],
    ["metric_reposts", (post) => post.metrics?.reposts],
    ["metric_views", (post) => post.metrics?.views],
    ["authorName", (post) => post.author?.name],
    ["authorProfileUrl", (post) => post.author?.profileUrl],
    ["hashtags", (post) => joinPipe(post.extracted?.hashtags)],
    ["links", (post) => joinPipe(post.extracted?.links)],
    ["emails", (post) => joinPipe(post.extracted?.emails)],
    ["jobTitles", (post) => joinPipe(post.extracted?.jobTitles)],
    ["fullText", (post) => post.fullText],
    ["reviewLabel", (post) => post.reviewLabel],
    ["manualOverride", (post) => post.manualOverride],
    ["historyStores", (post) => joinPipe(post.historyStores)],
    ["sourcePostId", (post) => post.sourcePostId]
  ];

  function buildCsv(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    const exportedAt = options.now ? options.now() : new Date().toISOString();
    const metadata = {
      schemaVersion: shared.SCHEMA_VERSION,
      exportedAt,
      exportRunId: resolveRunId(options),
      extensionVersion: resolveExtensionVersion(options),
      locale: options.locale || "en",
      rulesHash: provenanceSnapshot(options).rulesHash,
      classifierHash: provenanceSnapshot(options).classifierHash,
      extractorHash: provenanceSnapshot(options).extractorHash,
      selectedCategory: preferences.exportFilteredOnly ? preferences.filter : "all",
      scope: options.scope || (preferences.exportFilteredOnly
        ? `Posts from the selected category: ${preferences.filter}.`
        : "All detected posts available from the current run and local history."),
      fieldsIncluded: JSON.stringify(fieldSummary(preferences)),
      monitorRun: JSON.stringify(options.monitorRun || null)
    };
    const lines = Object.entries(metadata).map(([key, value]) => `# ${key},${shared.csvCell(value)}`);
    lines.push(CSV_FIELDS.map(([name]) => shared.csvCell(name)).join(","));
    for (const post of projected) {
      lines.push(CSV_FIELDS.map(([, getValue]) => {
        const value = getValue(post);
        return shared.csvCell(typeof value === "boolean" ? String(value) : value);
      }).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}`;
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
    // selectorHealth may carry free-text level/message fields; they are allowlist-sanitized
    // and length-capped so diagnostics stay a structured, injection-safe artifact.
    const allowedText = (value, max) =>
      String(value || "").replace(/[^\p{L}\p{N} .,:%()\-]/gu, "").slice(0, max);
    const health = input.selectorHealth || {};
    const selectorHealth = { ...numericRecord(health) };
    const healthLevel = allowedText(health.level, 16);
    const healthMessage = allowedText(health.message, 200);
    if (healthLevel) selectorHealth.level = healthLevel;
    if (healthMessage) selectorHealth.message = healthMessage;
    return {
      schemaVersion: shared.SCHEMA_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
      extensionVersion: String(input.extensionVersion || "2.0.0").replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 30),
      browserVersion: String(input.browserVersion || "unknown").replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 40) || "unknown",
      messageSchemaVersion: String(input.messageSchemaVersion || shared.MESSAGE_SCHEMA_VERSION).replace(/[^0-9a-zA-Z.-]/g, "").slice(0, 20),
      operations: numericRecord(input.operations),
      errors,
      selectorHealth,
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
    // The download needs a moment to start in a real browser; revoking immediately can
    // kill it. A default grace delay applies unless the caller asks for a different one.
    const delay = Number(options.revokeDelayMs);
    const graceMs = Number.isFinite(delay) ? Math.max(0, delay) : 1500;
    if (graceMs > 0) setTimeout(revoke, graceMs);
    else revoke();
    return { ok: true, diagnostic, json, filename: anchor.download };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  // Human-readable exports. They reuse every projection gate, so a field the user did not
  // request never appears in HTML/Markdown either.
  function buildHtml(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    const rows = projected.map((post) => `
    <article>
      <h2><a href="${escapeHtml(post.permalink)}">${escapeHtml(post.category)} · ${escapeHtml(post.confidence)}</a></h2>
      <p><strong>Score:</strong> ${escapeHtml(post.score)}${post.scoreMax ? ` / ${escapeHtml(post.scoreMax)}` : ""} <strong>Permalink:</strong> ${escapeHtml(post.permalink)}</p>
      <ul>${post.evidence.map((entry) => `<li>${escapeHtml(evidenceLine(entry))}</li>`).join("")}</ul>
      ${post.author?.name ? `<p><strong>Author:</strong> ${escapeHtml(post.author.name)}</p>` : ""}
      ${post.postAge?.label ? `<p><strong>Age:</strong> ${escapeHtml(post.postAge.label)}</p>` : ""}
      ${post.fullText ? `<p>${escapeHtml(post.fullText)}</p>` : ""}
    </article>`).join("\n");
    return `<!doctype html>
<html lang="${escapeHtml(options.locale || "en")}">
<head><meta charset="utf-8"><title>Linkerter export</title></head>
<body>
  <h1>LinkedIn hiring posts (${projected.length})</h1>
  <p>Schema ${escapeHtml(shared.SCHEMA_VERSION)} · generated ${escapeHtml(options.now ? options.now() : new Date().toISOString())}</p>
${rows}
</body>
</html>`;
  }

  function buildMarkdown(posts, options = {}) {
    const preferences = shared.sanitizeHiringPreferences(options.preferences || {});
    const projected = selectedPosts(posts, preferences).map((post) => projectPost(post, preferences)).filter(Boolean);
    const lines = [
      `# LinkedIn hiring posts (${projected.length})`,
      "",
      `Schema ${shared.SCHEMA_VERSION} · generated ${options.now ? options.now() : new Date().toISOString()}`,
      ""
    ];
    for (const post of projected) {
      lines.push(`## [${post.category} · ${post.confidence}](${post.permalink || ""})`, "");
      lines.push(`- **Score:** ${post.score ?? "—"}${post.scoreMax ? ` / ${post.scoreMax}` : ""}`);
      for (const entry of post.evidence) lines.push(`- ${evidenceLine(entry)}`);
      if (post.author?.name) lines.push(`- **Author:** ${post.author.name}`);
      if (post.postAge?.label) lines.push(`- **Age:** ${post.postAge.label}`);
      if (post.fullText) lines.push("", post.fullText);
      lines.push("");
    }
    return lines.join("\n");
  }

  const api = { projectPost, buildJsonPayload, buildCsv, buildHtml, buildMarkdown, mergeExportSources, migratePost, sanitizeDiagnostic, downloadDiagnostic };
  globalThis.__LI_FEED_EXPORT__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
