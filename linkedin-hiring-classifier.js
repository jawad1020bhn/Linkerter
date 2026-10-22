(() => {
  "use strict";

  const rules = globalThis.__LI_FEED_HIRING_RULES__;
  if (!rules) throw new Error("Hiring keyword rules were not loaded before the classifier.");

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/\p{M}/gu, "")
      .replace(/[\u200B-\u200F\uFEFF]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/[_]+/g, " ")
      .replace(/[^\p{L}\p{N}#@.+:/-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compilePhrase(value) {
    const phrase = normalizeText(value);
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return {
      phrase,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "gu")
    };
  }

  const compiledRules = Object.fromEntries(
    Object.entries(rules).map(([key, phrases]) => [key, phrases.map(compilePhrase)])
  );
  const knownHashtags = new Set((compiledRules.hiringHashtags || []).map((entry) => entry.phrase));
  const localPart = "[a-z0-9.!#$%&'*+/=?^_`{|}~-]+";
  const domainPart = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const emailPattern = new RegExp(`${localPart}@${domainPart}(?:\\.${domainPart})+`, "gi");
  const partialEmailPattern = /@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/i;
  const negationAtEnd = /(?:\bno|\bnot|\bnever|\bwithout|\baucun(?:e)?|\bpas de|\bne|لا|ليس|ليست|لسنا|غير|لم)(?:\s+\p{L}+){0,4}\s*$/u;

  function findOccurrences(normalizedText, group) {
    const occurrences = [];
    for (const entry of compiledRules[group] || []) {
      if (!entry.phrase) continue;
      for (const match of normalizedText.matchAll(entry.pattern)) {
        occurrences.push({ phrase: entry.phrase, index: match.index, length: match[0].length });
      }
    }
    return occurrences.sort((a, b) => a.index - b.index || b.length - a.length);
  }

  function isNegated(normalizedText, occurrence) {
    const prefix = normalizedText.slice(Math.max(0, occurrence.index - 80), occurrence.index).trim();
    return negationAtEnd.test(prefix);
  }

  function unnegated(normalizedText, occurrences) {
    return occurrences.filter((occurrence) => !isNegated(normalizedText, occurrence));
  }

  function extractHashtagHits(text) {
    const tags = Array.from(String(text || "").matchAll(/#([\p{L}\p{N}_]+)/gu), (match) => normalizeText(match[1]));
    return [...new Set(tags.filter((tag) => knownHashtags.has(tag)))];
  }

  function extractEmails(text) {
    const source = String(text || "");
    const emails = new Set(Array.from(source.matchAll(emailPattern), (match) => match[0].toLowerCase()));
    const normalizedObfuscations = source.toLowerCase()
      .replace(/\s*(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})\s*/gi, "@")
      .replace(/\s*(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})\s*/gi, ".")
      .replace(/\s+at\s+/gi, "@")
      .replace(/\s+dot\s+/gi, ".");
    for (const match of normalizedObfuscations.matchAll(emailPattern)) emails.add(match[0].toLowerCase());
    return Array.from(emails);
  }

  function detectEmail(text) {
    if (extractEmails(text).length) return { kind: "full", hit: true };
    return partialEmailPattern.test(String(text || ""))
      ? { kind: "partial", hit: true }
      : { kind: "none", hit: false };
  }

  function hasJobLink(hrefs = []) {
    const patterns = rules.jobLinkPatterns || [];
    return hrefs.some((href) => {
      const value = String(href || "").toLowerCase();
      return patterns.some((pattern) => value.includes(pattern.toLowerCase()));
    });
  }

  function hasEmailLink(hrefs = []) {
    return hrefs.some((href) => /^mailto:/i.test(String(href || "")));
  }

  function classify(text, options = {}) {
    const normalized = normalizeText(text);
    const openingOccurrences = findOccurrences(normalized, "activeOpening");
    const regionalOccurrences = findOccurrences(normalized, "weakRegional");
    const recruiterSearchOccurrences = findOccurrences(normalized, "recruiterSearch");
    const recruiterTermOccurrences = findOccurrences(normalized, "recruiterTerms");
    const jobTermOccurrences = findOccurrences(normalized, "genericJobTerms");
    const applicationOccurrences = findOccurrences(normalized, "applicationCta");
    const jobSeekerOccurrences = findOccurrences(normalized, "jobSeeker");
    const adviceOccurrences = findOccurrences(normalized, "adviceNews");
    const closedOccurrences = findOccurrences(normalized, "closedOrNegative").filter((occurrence) => {
      if (occurrence.phrase !== "not hiring") return true;
      return !adviceOccurrences.some((advice) => advice.index >= occurrence.index &&
        advice.index - occurrence.index < 80 &&
        !/[.!?;،؛]/.test(normalized.slice(occurrence.index, advice.index)));
    });
    const contactOccurrences = findOccurrences(normalized, "contactCues");

    const openingHits = unnegated(normalized, openingOccurrences);
    const regionalHits = unnegated(normalized, regionalOccurrences);
    const recruiterSearchHits = unnegated(normalized, recruiterSearchOccurrences);
    const recruiterTermHits = unnegated(normalized, recruiterTermOccurrences);
    const jobTermHits = unnegated(normalized, jobTermOccurrences);
    const applicationHits = unnegated(normalized, applicationOccurrences);
    const jobSeekerHits = unnegated(normalized, jobSeekerOccurrences);
    const adviceHits = unnegated(normalized, adviceOccurrences);
    const contactHits = unnegated(normalized, contactOccurrences);
    const hashtagHits = extractHashtagHits(text);
    const email = detectEmail(text);
    const emailLink = hasEmailLink(options.hrefs || []);
    const jobLink = hasJobLink(options.hrefs || []);

    const openScore =
      (openingHits.length ? 4 : 0) +
      (regionalHits.length ? 1 : 0) +
      (jobTermHits.length ? 1 : 0) +
      (applicationHits.length ? 2 : 0) +
      (email.kind === "full" ? 1 : email.kind === "partial" ? 0.5 : 0) +
      (emailLink ? 1 : 0) +
      (contactHits.length ? 1 : 0) +
      (jobLink ? 2 : 0) +
      (hashtagHits.length ? 1 : 0);
    const recruiterScore =
      (recruiterSearchHits.length ? 3 : 0) +
      (recruiterTermHits.length ? 1 : 0) +
      (jobTermHits.length ? 1 : 0) +
      (applicationHits.length ? 1 : 0) +
      (email.kind === "full" ? 1 : email.kind === "partial" ? 0.5 : 0) +
      (emailLink ? 1 : 0) +
      (jobLink ? 2 : 0);

    const positiveContext = openingHits.length || recruiterSearchHits.length || recruiterTermHits.length ||
      jobTermHits.length || jobLink || hashtagHits.length;
    let category = "none";
    let score = Math.max(openScore, recruiterScore);
    let confidence = "none";

    if (closedOccurrences.length && !openingHits.length && !recruiterSearchHits.length) {
      category = "closed";
      confidence = "likely";
      score = 0;
    } else if (openingHits.length && openScore >= 4) {
      category = "open_role";
      confidence = openScore >= 6 ? "strong" : "likely";
    } else if (recruiterSearchHits.length && recruiterScore >= 3) {
      category = "recruiter_search";
      confidence = recruiterScore >= 5 ? "strong" : "likely";
    } else if (jobSeekerHits.length && !openingHits.length && !recruiterSearchHits.length) {
      category = "job_seeker";
      confidence = "likely";
      score = Math.max(score, 2);
    } else if (adviceHits.length && !openingHits.length && !recruiterSearchHits.length) {
      category = "hiring_discussion";
      confidence = "likely";
      score = Math.max(score, 2);
    } else if (positiveContext && (openScore >= 2 || recruiterScore >= 2 || hashtagHits.length)) {
      category = "possible";
      confidence = score >= 4 ? "review" : "low";
    }

    const evidence = [];
    const addOccurrenceEvidence = (label, occurrences) => {
      for (const occurrence of occurrences) evidence.push(`${label}: ${occurrence.phrase}@${occurrence.index}`);
    };
    addOccurrenceEvidence("Hiring phrase", openingHits);
    addOccurrenceEvidence("Regional colloquial signal", regionalHits);
    addOccurrenceEvidence("Recruiter search", recruiterSearchHits);
    addOccurrenceEvidence("Recruiting term", recruiterTermHits);
    addOccurrenceEvidence("Employment term", jobTermHits);
    addOccurrenceEvidence("Application cue", applicationHits);
    addOccurrenceEvidence("Job-seeker cue", jobSeekerHits);
    addOccurrenceEvidence("Advice/news cue", adviceHits);
    addOccurrenceEvidence("Closed/negative cue", closedOccurrences);
    if (!openingHits.length && openingOccurrences.length) addOccurrenceEvidence("Negated hiring phrase", openingOccurrences);
    if (!recruiterSearchHits.length && recruiterSearchOccurrences.length) addOccurrenceEvidence("Negated recruiter search", recruiterSearchOccurrences);
    if (email.kind === "full") evidence.push("Email address");
    else if (email.kind === "partial") evidence.push("Email-like @domain");
    if (emailLink) evidence.push("Email link");
    addOccurrenceEvidence("Contact cue", contactHits);
    if (jobLink) evidence.push("Job/careers link");
    for (const tag of hashtagHits) evidence.push(`Hiring hashtag: #${tag}`);

    return {
      category,
      confidence,
      score: Math.round(score * 10) / 10,
      evidence: [...new Set(evidence)],
      signals: {
        activeOpening: openingHits.length > 0,
        regional: regionalHits.length > 0,
        recruiterSearch: recruiterSearchHits.length > 0,
        recruiterTerms: recruiterTermHits.length > 0,
        genericJobTerms: jobTermHits.length > 0,
        applicationCta: applicationHits.length > 0,
        jobSeeker: jobSeekerHits.length > 0,
        adviceNews: adviceHits.length > 0,
        closed: closedOccurrences.length > 0,
        email: email.kind,
        emailLink,
        contactCues: contactHits.length > 0,
        jobLink,
        hashtag: hashtagHits.length > 0
      }
    };
  }

  globalThis.__LI_FEED_HIRING_CLASSIFIER__ = { normalizeText, classify, detectEmail, extractEmails };
})();
