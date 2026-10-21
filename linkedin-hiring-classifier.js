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

  const normalizedRules = Object.fromEntries(
    Object.entries(rules).map(([key, phrases]) => [key, phrases.map(normalizeText)])
  );

  function phraseMatches(normalizedText, phrase) {
    if (!phrase) return false;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u");
    return pattern.test(normalizedText);
  }

  function findPhraseHits(normalizedText, group) {
    return (normalizedRules[group] || []).filter((phrase) => phraseMatches(normalizedText, phrase));
  }

  function extractHashtagHits(text) {
    const tags = Array.from(String(text || "").matchAll(/#([\p{L}\p{N}_]+)/gu), (match) => normalizeText(match[1]));
    const known = new Set(normalizedRules.hiringHashtags || []);
    return [...new Set(tags.filter((tag) => known.has(tag)))];
  }

  function extractEmails(text) {
    const source = String(text || "");
    const localPart = "[a-z0-9.!#$%&'*+/=?^_`{|}~-]+";
    const domainPart = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
    const fullPattern = new RegExp(`${localPart}@${domainPart}(?:\\.${domainPart})+`, "gi");
    const emails = new Set(Array.from(source.matchAll(fullPattern), (match) => match[0].toLowerCase()));

    const normalizedObfuscations = source.toLowerCase()
      .replace(/\s*(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})\s*/gi, "@")
      .replace(/\s*(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})\s*/gi, ".")
      .replace(/\s+at\s+/gi, "@")
      .replace(/\s+dot\s+/gi, ".");
    for (const match of normalizedObfuscations.matchAll(fullPattern)) emails.add(match[0].toLowerCase());
    return Array.from(emails);
  }

  function detectEmail(text) {
    if (extractEmails(text).length) return { kind: "full", hit: true };

    // Check raw @domain.tld so it is not mistaken for a full address like “to@gmail.com”.
    const partialPattern = /@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/i;
    return partialPattern.test(String(text || ""))
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

  function hasUnnegatedHit(normalizedText, hits) {
    return hits.some((phrase) => {
      const index = normalizedText.indexOf(phrase);
      if (index < 0) return false;
      const prefix = normalizedText.slice(Math.max(0, index - 55), index).trim();
      const negationAtEnd = /(?:\bno|\bnot|\bnever|\bwithout|\baucun(?:e)?|\bpas de|\bne|لا|ليس|ليست|غير|لم)(?:\s+\p{L}+){0,2}\s*$/u;
      return !negationAtEnd.test(prefix);
    });
  }

  function classify(text, options = {}) {
    const normalized = normalizeText(text);
    const openingHits = findPhraseHits(normalized, "activeOpening");
    const weakRegionalHits = findPhraseHits(normalized, "weakRegional");
    const recruiterSearchHits = findPhraseHits(normalized, "recruiterSearch");
    const recruiterTermHits = findPhraseHits(normalized, "recruiterTerms");
    const jobTermHits = findPhraseHits(normalized, "genericJobTerms");
    const applicationHits = findPhraseHits(normalized, "applicationCta");
    const jobSeekerHits = findPhraseHits(normalized, "jobSeeker");
    const adviceHits = findPhraseHits(normalized, "adviceNews");
    const closedHits = findPhraseHits(normalized, "closedOrNegative");
    const contactHits = findPhraseHits(normalized, "contactCues");
    const hashtagHits = extractHashtagHits(text);
    const email = detectEmail(text);
    const emailLink = hasEmailLink(options.hrefs || []);
    const jobLink = hasJobLink(options.hrefs || []);

    const openScore =
      (openingHits.length ? 4 : 0) +
      (weakRegionalHits.length ? 1 : 0) +
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

    let category = "none";
    let score = Math.max(openScore, recruiterScore);
    let confidence = "none";
    const contextualHiringSignal = openingHits.length || recruiterSearchHits.length || recruiterTermHits.length ||
      jobTermHits.length || applicationHits.length || jobLink || hashtagHits.length;

    const hasCurrentOpening = hasUnnegatedHit(normalized, openingHits);
    const hasCurrentRecruiterSearch = hasUnnegatedHit(normalized, recruiterSearchHits);

    if (closedHits.length && !hasCurrentOpening && !hasCurrentRecruiterSearch) {
      category = "closed";
      confidence = "likely";
      score = 0;
    } else if (openingHits.length && openScore >= 5) {
      category = "open_role";
      confidence = openScore >= 6 ? "strong" : "likely";
    } else if (recruiterSearchHits.length && recruiterScore >= 4) {
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
    } else if (contextualHiringSignal && (openScore >= 2 || recruiterScore >= 2 || hashtagHits.length)) {
      category = "possible";
      confidence = score >= 4 ? "review" : "low";
    }

    const evidence = [];
    if (openingHits.length) evidence.push(`Hiring phrase: ${openingHits[0]}`);
    if (weakRegionalHits.length) evidence.push(`Regional colloquial signal: ${weakRegionalHits[0]}`);
    if (recruiterSearchHits.length) evidence.push(`Recruiter search: ${recruiterSearchHits[0]}`);
    if (recruiterTermHits.length) evidence.push(`Recruiting term: ${recruiterTermHits[0]}`);
    if (jobTermHits.length) evidence.push(`Employment term: ${jobTermHits[0]}`);
    if (applicationHits.length) evidence.push(`Application cue: ${applicationHits[0]}`);
    if (jobSeekerHits.length) evidence.push(`Job-seeker cue: ${jobSeekerHits[0]}`);
    if (adviceHits.length) evidence.push(`Advice/news cue: ${adviceHits[0]}`);
    if (closedHits.length) evidence.push(`Closed/negative cue: ${closedHits[0]}`);
    if (email.kind === "full") evidence.push("Email address");
    else if (email.kind === "partial") evidence.push("Email-like @domain");
    if (emailLink) evidence.push("Email link");
    if (contactHits.length) evidence.push(`Contact cue: ${contactHits[0]}`);
    if (jobLink) evidence.push("Job/careers link");
    if (hashtagHits.length) evidence.push(`Hiring hashtag: #${hashtagHits[0]}`);

    return {
      category,
      confidence,
      score: Math.round(score * 10) / 10,
      evidence: [...new Set(evidence)].slice(0, 4),
      signals: {
        activeOpening: openingHits.length > 0,
        regional: weakRegionalHits.length > 0,
        recruiterSearch: recruiterSearchHits.length > 0,
        jobSeeker: jobSeekerHits.length > 0,
        adviceNews: adviceHits.length > 0,
        closed: closedHits.length > 0,
        email: email.kind,
        emailLink,
        jobLink,
        hashtag: hashtagHits.length > 0
      }
    };
  }

  globalThis.__LI_FEED_HIRING_CLASSIFIER__ = { normalizeText, classify, detectEmail, extractEmails };
})();
