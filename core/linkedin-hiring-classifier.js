(() => {
  "use strict";

  const rules = globalThis.__LI_FEED_HIRING_RULES__;
  if (!rules) throw new Error("Hiring keyword rules were not loaded before the classifier.");
  // Idempotent load: programmatic re-injection must not rebuild the phrase tables.
  if (globalThis.__LI_FEED_HIRING_CLASSIFIER__) return;

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
      // Comma-family separators, exclamation/question marks and the LinkedIn headline pipe
      // survive so clause detection can split on them ("Do not hesitate, we are hiring…").
      // Phrase boundaries still match because the lookahead only excludes letters/digits.
      .replace(/[^\p{L}\p{N}#@.,:;+،؛!|؟-]+/gu, " ")
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
    Object.entries(rules)
      .filter(([key, phrases]) => !NON_PHRASE_GROUPS.has(key) && Array.isArray(phrases))
      .map(([key, phrases]) => [key, phrases.map(compilePhrase)])
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

  // A negation only governs its own clause, so "Do not hesitate, we are hiring…" keeps
  // its call. Boundary positions are every kept separator in the normalized text (commas
  // now survive normalization) plus every connective end, and a hit is suppressed ONLY
  // when the very clause containing it also carries an explicit closed/negative phrase.
  // A bare negator word is not enough: "There is no doubt we are hiring…" holds no closed
  // phrase, so the negator-like "no" alone must never fold the genuine call. The old
  // fixed-width prefix window did exactly that and hid real openings.
  // Clause connectives survive normalization as bare "-" when LinkedIn-style em-dashes or
  // spaced short dashes separate the clauses ("hiring — but not juniors" normalizes to
  // "hiring - but not juniors"). Parentheses and quotation marks never reach the normalized
  // text (normalizeText replaces them with spaces), so only the spaced-hyphen form carries
  // the boundary here; a hyphen inside a token ("full-time") never has both neighbours.
  // The Arabic question mark and the headline pipe count as separators too: "توظيف | شروط:"
  // headline posts are assembled from pipe-delimited sections, not one clause.
  const CLAUSE_BOUNDARY_CHARS = /[.!?;,؛،|؟]|\s-\s/gu;


  function buildClauseLocator(normalizedText) {
    const boundaries = [0];
    for (const match of normalizedText.matchAll(CLAUSE_BOUNDARY_CHARS)) {
      boundaries.push(match.index + 1);
    }
    if (connectivePattern) {
      connectivePattern.lastIndex = 0;
      let connectiveMatch;
      while ((connectiveMatch = connectivePattern.exec(normalizedText)) !== null) {
        boundaries.push(connectiveMatch.index + connectiveMatch[0].length);
      }
      connectivePattern.lastIndex = 0;
    }
    // Ascending order makes the lookup below a short early-exit scan.
    boundaries.sort((a, b) => a - b);
    return (index) => {
      let start = 0;
      for (const boundary of boundaries) {
        if (boundary <= index) start = boundary;
        else break;
      }
      return start;
    };
  }

  function extractHashtagHits(text) {
    const tags = Array.from(String(text || "").matchAll(/#([\p{L}\p{N}_]+)/gu), (match) => normalizeText(match[1]));
    return [...new Set(tags.filter((tag) => knownHashtags.has(tag)))];
  }

  function extractEmails(text) {
    // NFKC folds mathematical alphanumerics ("𝗮𝘁" → "at"); the other passes cover the
    // obfuscations recruiters actually type: [at]/(at)/{at}/<at>, spaced or line-broken
    // addresses, and "name@\n domain.com" splits.
    const source = String(text || "").normalize("NFKC");
    const emails = new Set(Array.from(source.matchAll(emailPattern), (match) => match[0].toLowerCase()));
    const normalizedObfuscations = source.toLowerCase()
      .replace(/@\s*\n\s*/g, "@")
      .replace(/\s*\n\s*\.\s*/g, ".")
      .replace(/\s*<\s*at\s*>\s*/gi, "@")
      .replace(/\s*<\s*dot\s*>\s*/gi, ".")
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

  // Ceilings of the two score formulas, declared at module scope so the export layer can
  // publish scoreBasis -> max without re-deriving the arithmetic. Keeping them here means a
  // formula change updates the ceiling in one place.
  const OPEN_SCORE_MAX = 15;
  const RECRUITER_SCORE_MAX = 10;

  function classify(text, options = {}) {    const normalized = normalizeText(text);
    const openingOccurrences = findOccurrences(normalized, "activeOpening");
    const intakeOccurrences = findOccurrences(normalized, "ambiguousOpening");
    const frameOccurrences = findFrameOccurrences(normalized);
    const regionalOccurrences = findOccurrences(normalized, "weakRegional");
    const regionalGroupOccurrences = {
      regionalMaghreb: findOccurrences(normalized, "weakRegionalMaghreb"),
      regionalGulf: findOccurrences(normalized, "weakRegionalGulf"),
      regionalLevant: findOccurrences(normalized, "weakRegionalLevant"),
      regionalEgypt: findOccurrences(normalized, "weakRegionalEgypt")
    };
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

    // A phrase hit dies only when its own clause also carries an explicit closed/negative
    // phrase; location of the clause is decided once for the whole text.
    const clauseLocator = buildClauseLocator(normalized);
    function unnegated(occurrences) {
      return occurrences.filter((occurrence) => {
        const clauseStart = clauseLocator(occurrence.index);
        return !closedOccurrences.some((closed) => clauseLocator(closed.index) === clauseStart);
      });
    }

    const openingHits = unnegated(openingOccurrences);
    const intakeHits = unnegated(intakeOccurrences);
    const frameHits = unnegated(frameOccurrences);
    const regionalGroupHits = Object.fromEntries(
      Object.entries(regionalGroupOccurrences).map(([key, occurrences]) => [key, unnegated(occurrences)])
    );
    const regionalHits = [...unnegated(regionalOccurrences), ...Object.values(regionalGroupHits).flat()]
      .filter((occurrence, index, all) => all.findIndex((other) => other.index === occurrence.index) === index);
    const recruiterSearchHits = unnegated(recruiterSearchOccurrences);
    const recruiterTermHits = unnegated(recruiterTermOccurrences);
    const jobTermHits = unnegated(jobTermOccurrences);
    const applicationHits = unnegated(applicationOccurrences);
    const jobSeekerHits = unnegated(jobSeekerOccurrences);
    const adviceHits = unnegated(adviceOccurrences);
    const contactHits = unnegated(contactOccurrences);
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
    // A consumer must be able to read a bare score ("5.5 of what?"). The basis names the
    // formula that produced it and scoreMax is that formula's ceiling; both are null when
    // the final score was zeroed by a verdict branch (sponsored/no-signal/closed).
    const scoreBasis = openScore >= recruiterScore
      ? (openScore > 0 ? "openScore" : null)
      : (recruiterScore > 0 ? "recruiterScore" : null);

    const positiveContext = openingHits.length || frameHits.length || intakeHits.length ||
      recruiterSearchHits.length || recruiterTermHits.length || jobTermHits.length ||
      regionalHits.length || jobLink || hashtagHits.length;
    let category = "none";
    let score = Math.max(openScore, recruiterScore);
    let confidence = "none";

    // A "Hiring:" headline about hiring itself is commentary, not a vacancy; but a headline
    // whose complement names a separate role ("Hiring: Senior Engineer — interview tips
    // inside") is an opening even when advice cues appear in a different clause. The
    // complement ends at the next clause boundary; advice cues inside that span mean the
    // headline advertised advice, while cues outside it leave a role complement untouched.
    function frameComplementCarriesAdvice() {
      const boundaries = [];
      for (const match of normalized.matchAll(CLAUSE_BOUNDARY_CHARS)) boundaries.push(match.index);
      return adviceHits.some((advice) => frameHits.some((frame) => {
        const frameEnd = frame.index + frame.length;
        if (frame.index >= advice.index + advice.length) return false;
        const nextBoundary = boundaries.find((boundary) => boundary >= frameEnd);
        const complementEnd = nextBoundary === undefined ? normalized.length : nextBoundary;
        // The advice cue rides on the headline itself when it starts inside the frame
        // match (text expansion can split the frame token) or lands within the
        // complement clause; cues in later clauses leave a role complement untouched.
        return advice.index < complementEnd;
      }));
    }

    if (sponsoredHits.length && !openingHits.length && !frameHits.length && !recruiterSearchHits.length) {
      // A sponsored or promoted placement that names no vacancy is advertising, not a post.
      category = "none";
      confidence = "none";
      score = 0;
    } else if (closedOccurrences.length && !openingHits.length && !frameHits.length && !intakeHits.length && !recruiterSearchHits.length) {
      category = "closed";
      confidence = "likely";
      score = 0;
    } else if (frameOnly && adviceHits.length && frameComplementCarriesAdvice()) {
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
    } else if (positiveContext && (openScore >= 2 || recruiterScore >= 2 || hashtagHits.length || jobTermVariety >= 2) &&
      (actionable || intakeHits.length || recruiterSearchHits.length || jobTermVariety >= 2)) {
      // Employment vocabulary on its own is not a reason to open a review item: contract words
      // and a stray "jobs" appear in career stories and platform marketing. Something must be
      // actionable (email, link, application or contact cue, hiring hashtag), intake-shaped, or
      // recruiter-search-shaped, or at least two distinct opportunity terms must be present.
      category = "possible";
      confidence = score >= 4 ? "review" : "low";
    }

    // Evidence display dedupes by (label, phrase): the same phrase firing twice is one
    // line, and the line carries no occurrence index. The structured evidenceDetail below
    // keeps every occurrence index for schema-v4 exports.
    const evidence = [];
    const evidenceSeen = new Set();
    const evidenceDetailMap = new Map();
    const pushEvidence = (line) => {
      if (evidenceSeen.has(line)) return;
      evidenceSeen.add(line);
      evidence.push(line);
    };
    // Structured evidence powers schema v4 ({label, phrase, occurrences}). Every occurrence
    // is recorded even when the display line dedupes, so traceability does not depend on the
    // deduplicated text.
    const addEvidenceDetail = (label, phrase, index) => {
      const key = `${label}\u0000${phrase}`;
      const entry = evidenceDetailMap.get(key) || { label, phrase, occurrences: [] };
      if (Number.isInteger(index) && !entry.occurrences.includes(index)) entry.occurrences.push(index);
      evidenceDetailMap.set(key, entry);
    };
    const addOccurrenceEvidence = (label, occurrences) => {
      const seenPhrases = new Set();
      for (const occurrence of occurrences) {
        addEvidenceDetail(label, occurrence.phrase, occurrence.index);
        if (seenPhrases.has(occurrence.phrase)) continue;
        seenPhrases.add(occurrence.phrase);
        pushEvidence(`${label}: ${occurrence.phrase}`);
      }
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
    // Evidence lists the occurrences that a clause actually suppressed, not the whole group.
    const addNegatedEvidence = (label, rawOccurrences, hits) => {
      if (hits.length >= rawOccurrences.length) return;
      addOccurrenceEvidence(label, rawOccurrences.filter((occurrence) => !hits.includes(occurrence)));
    };
    addNegatedEvidence("Negated hiring phrase", openingOccurrences, openingHits);
    addNegatedEvidence("Negated vacancy frame", frameOccurrences, frameHits);
    addNegatedEvidence("Negated intake phrase", intakeOccurrences, intakeHits);
    addNegatedEvidence("Negated recruiter search", recruiterSearchOccurrences, recruiterSearchHits);
    addNegatedEvidence("Negated job-seeker cue", jobSeekerOccurrences, jobSeekerHits);
    addNegatedEvidence("Negated advice/news cue", adviceOccurrences, adviceHits);
    if (email.kind === "full") {
      evidence.push("Email address");
      addEvidenceDetail("Email address", null, null);
    } else if (email.kind === "partial") {
      evidence.push("Email-like @domain");
      addEvidenceDetail("Email-like @domain", null, null);
    }
    if (emailLink) {
      evidence.push("Email link");
      addEvidenceDetail("Email link", null, null);
    }
    addOccurrenceEvidence("Contact cue", contactHits);
    if (jobLink) {
      evidence.push("Job/careers link");
      addEvidenceDetail("Job/careers link", null, null);
    }
    for (const tag of hashtagHits) {
      evidence.push(`Hiring hashtag: #${tag}`);
      addEvidenceDetail("Hiring hashtag", `#${tag}`, null);
    }

    return {
      category,
      confidence,
      score: Math.round(score * 10) / 10,
      scoreBasis,
      scoreMax: scoreBasis === "openScore" ? OPEN_SCORE_MAX : scoreBasis === "recruiterScore" ? RECRUITER_SCORE_MAX : null,
      evidence: [...new Set(evidence)],
      evidenceDetail: [...evidenceDetailMap.values()],
      signals: {
        activeOpening: openingHits.length > 0,
        ambiguousOpening: intakeHits.length > 0,
        openingFrame: frameHits.length > 0,
        regional: regionalHits.length > 0,
        regionalMaghreb: regionalGroupHits.regionalMaghreb.length > 0,
        regionalGulf: regionalGroupHits.regionalGulf.length > 0,
        regionalLevant: regionalGroupHits.regionalLevant.length > 0,
        regionalEgypt: regionalGroupHits.regionalEgypt.length > 0,
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

  // Provenance: rules digest + the scoring/parsing constants this build uses. An edit to
  // either side changes the classifier hash, so an exported verdict is reproducible.
  const sha = globalThis.__LI_SHA256__ ||
    (typeof require === "function" ? require("./sha256.js") : null);
  const classifierHash = sha
    ? sha.digest(JSON.stringify({
      rules: rules.tablesHash || null,
      openScoreMax: OPEN_SCORE_MAX,
      recruiterScoreMax: RECRUITER_SCORE_MAX,
      clauseBoundaries: CLAUSE_BOUNDARY_CHARS.source
    }))
    : null;
  globalThis.__LI_FEED_HIRING_CLASSIFIER__ = {
    normalizeText,
    classify,
    detectEmail,
    extractEmails,
    OPEN_SCORE_MAX,
    RECRUITER_SCORE_MAX,
    classifierHash
  };
})();
