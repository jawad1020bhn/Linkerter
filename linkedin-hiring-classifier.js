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
      .replace(/[\u2010-\u2015\u2212\uFF0D]/g, "-")
      .replace(/[’‘`]/g, "'")
      .replace(/[_]+/g, " ")
      // "son/sa responsable", "H/F", "CDI/CDD" and "et/ou" all use the slash as a separator.
      .replace(/[/]+/g, " ")
      .replace(/[^\p{L}\p{N}#@.+:/-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compilePhrase(value) {
    const phrase = normalizeText(value);
    const tokens = phrase.split(/\s+/).filter(Boolean);
    const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Real captured text puts a hashtag between words ("we're #hiring") and sometimes loses
    // the space in a French elision ("offre demploi"), so word joins tolerate both. A single
    // letter is an elision (d', l', n', s', j', c', m') and needs no separator at all.
    const joined = escaped.reduce((accumulator, token, index) => {
      if (index === 0) return token;
      const elision = token.length === 1 || tokens[index - 1].length === 1;
      return `${accumulator}${elision ? "[\\s#]*" : "[\\s#]+"}${token}`;
    }, "");
    return {
      phrase,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${joined}(?=$|[^\\p{L}\\p{N}])`, "gu")
    };
  }

  // Groups that are not literal phrase lists: regex frames and clause connectives.
  const NON_PHRASE_GROUPS = new Set(["openingFrames", "negationConnectives", "jobSeekerFrames", "roleMarkerFrames"]);
  const compiledRules = Object.fromEntries(
    Object.entries(rules).filter(([key]) => !NON_PHRASE_GROUPS.has(key)).map(([key, phrases]) => [key, phrases.map(compilePhrase)])
  );
  const framePatterns = (rules.openingFrames || []).map((source) => new RegExp(source, "giu"));
  const seekerFramePatterns = (rules.jobSeekerFrames || []).map((source) => new RegExp(source, "giu"));
  const roleMarkerFramePatterns = (rules.roleMarkerFrames || []).map((source) => new RegExp(source, "giu"));
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const connectiveSources = (rules.negationConnectives || []).map((value) => escapeRegExp(normalizeText(value))).filter(Boolean);
  const connectivePattern = connectiveSources.length
    ? new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${connectiveSources.join("|")})(?=$|[^\\p{L}\\p{N}])`, "gu")
    : null;
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

  function findFrameOccurrences(normalizedText, patterns = framePatterns) {
    const occurrences = [];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of normalizedText.matchAll(pattern)) {
        occurrences.push({ phrase: match[0].trim(), index: match.index, length: match[0].length });
      }
    }
    return occurrences.sort((a, b) => a.index - b.index || b.length - a.length);
  }

  // A negation only governs its own clause. Commas are normalized away, so clause
  // boundaries are recovered from connectives and the sentence punctuation that survives.
  function clauseStart(prefix) {
    let start = 0;
    if (connectivePattern) {
      connectivePattern.lastIndex = 0;
      let match;
      while ((match = connectivePattern.exec(prefix)) !== null) start = Math.max(start, match.index + match[0].length);
    }
    const sentence = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("؛"), prefix.lastIndexOf("!"), prefix.lastIndexOf("?"));
    return Math.max(start, sentence + 1);
  }

  function isNegated(normalizedText, occurrence) {
    const rawPrefix = normalizedText.slice(Math.max(0, occurrence.index - 80), occurrence.index).trim();
    const prefix = rawPrefix.slice(clauseStart(rawPrefix));
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
    const intakeOccurrences = findOccurrences(normalized, "ambiguousOpening");
    const frameOccurrences = findFrameOccurrences(normalized);
    const regionalOccurrences = findOccurrences(normalized, "weakRegional");
    const recruiterSearchOccurrences = findOccurrences(normalized, "recruiterSearch");
    const recruiterTermOccurrences = findOccurrences(normalized, "recruiterTerms");
    const jobTermOccurrences = findOccurrences(normalized, "genericJobTerms");
    const applicationOccurrences = findOccurrences(normalized, "applicationCta");
    // A seeker says "je recherche un poste"; an employer says "je recherche la personne".
    // Both the phrase list and the subject-guarded frames feed the same signal.
    const jobSeekerOccurrences = [
      ...findOccurrences(normalized, "jobSeeker"),
      ...findFrameOccurrences(normalized, seekerFramePatterns)
    ].sort((a, b) => a.index - b.index || b.length - a.length);
    const sponsoredOccurrences = findOccurrences(normalized, "sponsoredMarkers");
    const roleMarkerOccurrences = [
      ...findOccurrences(normalized, "roleMarkers"),
      ...findFrameOccurrences(normalized, roleMarkerFramePatterns)
    ].sort((a, b) => a.index - b.index || b.length - a.length);
    const contractOccurrences = findOccurrences(normalized, "contractTerms");
    const adviceOccurrences = findOccurrences(normalized, "adviceNews");
    const closedOccurrences = findOccurrences(normalized, "closedOrNegative").filter((occurrence) => {
      if (occurrence.phrase !== "not hiring") return true;
      return !adviceOccurrences.some((advice) => advice.index >= occurrence.index &&
        advice.index - occurrence.index < 80 &&
        !/[.!?;،؛]/.test(normalized.slice(occurrence.index, advice.index)));
    });
    const contactOccurrences = findOccurrences(normalized, "contactCues");

    const openingHits = unnegated(normalized, openingOccurrences);
    const intakeHits = unnegated(normalized, intakeOccurrences);
    const frameHits = unnegated(normalized, frameOccurrences);
    const regionalHits = unnegated(normalized, regionalOccurrences);
    const recruiterSearchHits = unnegated(normalized, recruiterSearchOccurrences);
    const recruiterTermHits = unnegated(normalized, recruiterTermOccurrences);
    const jobTermHits = unnegated(normalized, jobTermOccurrences);
    const applicationHits = unnegated(normalized, applicationOccurrences);
    const jobSeekerHits = unnegated(normalized, jobSeekerOccurrences);
    const adviceHits = unnegated(normalized, adviceOccurrences);
    const contactHits = unnegated(normalized, contactOccurrences);
    // The monitor reports sponsored placements it detected structurally, so the guard still
    // works once the sponsored label itself has been stripped from the post text as chrome.
    const sponsoredHits = options.sponsored === true && !sponsoredOccurrences.length
      ? [{ phrase: "sponsored", index: 0, length: 9 }]
      : sponsoredOccurrences;
    const roleMarkerHits = roleMarkerOccurrences;
    const contractHits = contractOccurrences;
    const hashtagHits = extractHashtagHits(text);
    const email = detectEmail(text);
    const emailLink = hasEmailLink(options.hrefs || []);
    const jobLink = hasJobLink(options.hrefs || []);
    // Anything a reviewer could act on, as opposed to vocabulary that merely sounds like work.
    const actionable = email.hit || emailLink || jobLink || applicationHits.length > 0 ||
      contactHits.length > 0 || hashtagHits.length > 0;

    // "فرصة عمل" contains "عمل"; a phrase must not corroborate itself.
    const openingSpans = [...openingHits, ...intakeHits, ...frameHits];
    const independentJobTermHits = jobTermHits.filter((occurrence) => !openingSpans.some((span) =>
      occurrence.index < span.index + span.length && span.index < occurrence.index + occurrence.length));
    const jobTermVariety = new Set(jobTermHits.map((occurrence) => occurrence.phrase)).size;
    const contractVariety = new Set(contractHits.map((occurrence) => occurrence.phrase)).size;
    const employmentContext = independentJobTermHits.length > 0 || jobLink;
    const frameOnly = frameHits.length > 0 && !openingHits.length && !intakeHits.length;

    const openScore =
      (openingHits.length || frameHits.length ? 4 : 0) +
      (intakeHits.length ? 2 : 0) +
      (regionalHits.length ? 1 : 0) +
      (independentJobTermHits.length ? 1 : 0) +
      (jobTermVariety >= 3 ? 1 : 0) +
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

    const positiveContext = openingHits.length || frameHits.length || intakeHits.length ||
      recruiterSearchHits.length || recruiterTermHits.length || jobTermHits.length || jobLink || hashtagHits.length;
    let category = "none";
    let score = Math.max(openScore, recruiterScore);
    let confidence = "none";

    if (sponsoredHits.length && !openingHits.length && !frameHits.length && !recruiterSearchHits.length) {
      // A sponsored or promoted placement that names no vacancy is advertising, not a post.
      category = "none";
      confidence = "none";
      score = 0;
    } else if (closedOccurrences.length && !openingHits.length && !frameHits.length && !intakeHits.length && !recruiterSearchHits.length) {
      category = "closed";
      confidence = "likely";
      score = 0;
    } else if (frameOnly && adviceHits.length) {
      // A "Hiring:" headline about hiring itself is commentary, not a vacancy.
      category = "hiring_discussion";
      confidence = "likely";
      score = Math.max(score, 2);
    } else if ((openingHits.length || frameHits.length) && openScore >= 4) {
      category = "open_role";
      confidence = openScore >= 6 ? "strong" : "likely";
    } else if (intakeHits.length && employmentContext && openScore >= 4 && roleMarkerHits.length) {
      // Opening-shaped intake phrasing needs independent employment context AND structural
      // proof that a specific role is described. "Come discover our job offers" with a link
      // and #recrutement is a marketing CTA, not a vacancy, and stays in the review bucket.
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
    } else if (positiveContext && (openScore >= 2 || recruiterScore >= 2 || hashtagHits.length || jobTermVariety >= 3) &&
      (actionable || intakeHits.length || recruiterSearchHits.length || jobTermVariety >= 2)) {
      // Employment vocabulary on its own is not a reason to open a review item: contract words
      // and a stray "jobs" appear in career stories and platform marketing. Something must be
      // actionable (email, link, application or contact cue, hiring hashtag), intake-shaped, or
      // recruiter-search-shaped, or at least two distinct opportunity terms must be present.
      category = "possible";
      confidence = score >= 4 ? "review" : "low";
    }

    const evidence = [];
    const addOccurrenceEvidence = (label, occurrences) => {
      for (const occurrence of occurrences) evidence.push(`${label}: ${occurrence.phrase}@${occurrence.index}`);
    };
    addOccurrenceEvidence("Hiring phrase", openingHits);
    addOccurrenceEvidence("Vacancy frame", frameHits);
    addOccurrenceEvidence("Intake phrase", intakeHits);
    addOccurrenceEvidence("Regional colloquial signal", regionalHits);
    addOccurrenceEvidence("Recruiter search", recruiterSearchHits);
    addOccurrenceEvidence("Recruiting term", recruiterTermHits);
    addOccurrenceEvidence("Employment term", jobTermHits);
    addOccurrenceEvidence("Application cue", applicationHits);
    addOccurrenceEvidence("Job-seeker cue", jobSeekerHits);
    addOccurrenceEvidence("Advice/news cue", adviceHits);
    addOccurrenceEvidence("Closed/negative cue", closedOccurrences);
    addOccurrenceEvidence("Role marker", roleMarkerHits);
    addOccurrenceEvidence("Contract term", contractHits);
    addOccurrenceEvidence("Sponsored/promoted placement", sponsoredHits);
    if (!openingHits.length && openingOccurrences.length) addOccurrenceEvidence("Negated hiring phrase", openingOccurrences);
    if (!frameHits.length && frameOccurrences.length) addOccurrenceEvidence("Negated vacancy frame", frameOccurrences);
    if (!intakeHits.length && intakeOccurrences.length) addOccurrenceEvidence("Negated intake phrase", intakeOccurrences);
    if (!recruiterSearchHits.length && recruiterSearchOccurrences.length) addOccurrenceEvidence("Negated recruiter search", recruiterSearchOccurrences);
    if (!jobSeekerHits.length && jobSeekerOccurrences.length) addOccurrenceEvidence("Negated job-seeker cue", jobSeekerOccurrences);
    if (!adviceHits.length && adviceOccurrences.length) addOccurrenceEvidence("Negated advice/news cue", adviceOccurrences);
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
        ambiguousOpening: intakeHits.length > 0,
        openingFrame: frameHits.length > 0,
        regional: regionalHits.length > 0,
        recruiterSearch: recruiterSearchHits.length > 0,
        recruiterTerms: recruiterTermHits.length > 0,
        genericJobTerms: jobTermHits.length > 0,
        applicationCta: applicationHits.length > 0,
        jobSeeker: jobSeekerHits.length > 0,
        sponsored: sponsoredHits.length > 0,
        roleMarker: roleMarkerHits.length > 0,
        contractTerms: contractVariety > 0,
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
