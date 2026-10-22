# Linkerter purpose-fit re-audit and new findings

**Date:** 2026-10-22

**Scope:** Independent verification of the user-supplied purpose-fit audit (PF-01 … PF-05) against the current source, plus a fresh evidence-driven pass over detection, extraction, deduplication, presentation, and documentation.

**Method:** Superpowers-guided purpose-first review. Every claim below was reproduced by executing code in this repository, not inferred from reading it. No production code was changed by this review.

**Baseline verified:** `npm install` then `npm test` → **102/102 pass**; `npm run test:classifier` → **22/22 correct**; `npm run test:browser` → **NOT RUN** (no Chrome/Chromium executable in this environment); `.github/workflows/` **does not exist**, so CI has never run (see `docs/ci/README.md`).

## Verdict on the purpose-fit audit

The audit's conclusion — "a duplicate full audit is not necessary" — was correct about *re-running the old audit*, but wrong in one important respect: it treated detection accuracy as **unmeasured** ("cannot establish that detected openings are genuine active vacancies"). Measuring it reproduces concrete defects. It also missed a P0 defect in feed-root selection that corrupts the counts, results list, and exports the whole product exists to produce.

| Audit item | Verification result | Evidence |
|---|---|---|
| PF-01 accuracy not measured strongly enough | **Confirmed and understated.** The 22-case corpus does contain only 5 `open_role` and 1 `recruiter_search` case, and the evaluator reports no precision/recall. A 65-case realistic probe now measures **`open_role` precision 0.75, recall 0.889** with 8 false positives across 4 reproducible phrase classes. | `node scripts/probe-classifier.js` |
| PF-02 default view does not prioritize openings | **Confirmed and reproduced.** With `filter: "all"` / `sort: "newest"` a mixed archive lists a `recruiter_search` post above the only genuine `open_role`. | `linkedin-hiring-monitor.js` `queryRecords()` (sorts by `lastSeenAt` only); `popup.js:131` |
| PF-03 real Chrome validation unexecuted | **Confirmed, with a sharper diagnosis.** The harness degrades correctly (`NOT RUN — no Chrome/Chromium executable found`), so the blocker is not the harness. `.github/workflows/ci.yml` is absent; `docs/ci/ci.yml` is staged because the GitHub App lacks the `workflows` permission. Only the owner can activate it. | `bash scripts/test-browser.sh`; `docs/ci/README.md` |
| PF-04 Adaptive vs Human-like naming conflict | **Confirmed.** `popup-i18n.js`, `popup.html`, `README.md`, `manifest.json` all use Adaptive naming. The rename is mechanically low-risk: `tests/dom/i18n.test.js` already enforces EN/FR/AR key parity. | `grep -rn "Adaptive" popup-i18n.js popup.html README.md manifest.json` |
| PF-05 version baseline conflict | **Confirmed**, plus additional drift: `AGENTS.md:65` still says **v1.9.0** while manifest, package, README, PRIVACY, SECURITY, SUPPORT, CHANGELOG and store docs all say **2.0.0**. | `grep -rn "1\.9\.0" AGENTS.md` |

## New findings

### N-01 — One real LinkedIn post produces multiple archive records and inflated opening counts

**Priority:** **P0** — corrupts the primary deliverable
**Type:** Reproduced functional defect (not previously reported)

**Evidence:** `node scripts/probe-feed-roots.js`

One post shaped like current LinkedIn markup (an `occludable-update` wrapper, an `article` card carrying the activity URN, and real `feed-shared-update-v2__actor|__content|__description-wrapper|__social-actions` children) yields:

```
post roots found: 7 | text selectors 3, fallbacks 4, see-more controls 3
archive records: 3 | counts.open_role: 3 | duplicateMergedCount: 1
  * open_role/strong  complete=true   id=text:|we are hiring a senior backend engineer…
  * open_role/partial complete=false  id=text:|we are hiring a senior backend engineer… see more
  * open_role/partial complete=false  id=urn:li:activity:7250000000000000001
```

The repository's own fixture reproduces it: `tests/fixtures/dom/collapsed.html` (one `<article data-urn="urn:li:activity:123">`) yields **2 archive records and `counts.open_role: 2`**.

**Root cause:** `isLikelyPostRoot()` accepts any element whose class matches `/feed-shared-update-v2|…/`, which includes real LinkedIn *child* elements (`feed-shared-update-v2__description-wrapper`, `__content`, `__actor`). `findPostRootsInScope()` walks upward from each candidate but returns the candidate itself when it matches, so nested wrappers become independent post roots. `getArchiveKey()` then derives different identities for the same post — `urn:…` from the card, `text:…` from the wrapper that carries no `data-urn` — so `canonicalPostId()` cannot merge them and `duplicateMergedCount` under-reports.

**Impact on the stated purpose:** category counters and "total results" are inflated (300% in the reproduction); the same opening appears several times in the review list with **contradictory** `complete` / `partial` labels; pagination and archive limits (`MAX_EXPORT_RECORDS`) are consumed by duplicates; JSON/CSV exports — built from `exportRecords` — contain duplicates; DOM-compatibility health reports "7 post card(s) matched" for one post, misleading the diagnostic the owner relies on to detect LinkedIn layout changes.

**Why the suite missed it:** every extraction test calls `extractPostRecord(document.querySelector("#post"))` directly on the article, and every scan test uses simplified markup (`<article data-urn><div class="feed-shared-text">…`) that yields exactly one root. The only realistic-fixture assertion on text is `record.fullText.includes("visible part")`, which cannot detect duplication. No test asserts "one realistic card → exactly one archive record".

**Required direction:** deduplicate roots by containment (discard a root that is a descendant of another selected root unless it is a genuine nested reshare, which `tests/fixtures/dom/reposts.html` already models); require a card-level identity rather than a class *substring* match (whole-token `feed-shared-update-v2` / `occludable-update`, or presence of a post URN); when a root has no stable ID, resolve the key from its enclosing card. Add a regression test asserting one realistic card yields one root, one record, and `counts.open_role === 1`, and keep the nested-repost test passing so reshares remain two distinct posts.

### N-02 — Page chrome leaks into extracted post text and exports

**Priority:** P2
**Type:** Reproduced data-quality defect

**Evidence:** `node scripts/probe-feed-roots.js`

For `tests/fixtures/dom/collapsed.html` the card-root record's text ends with `"…This is the visible part.\n See more"`. For the realistic card, a root's text ends with `"…careers page.\n see more\n \n \n \n Permalink\n 2h"` — the see-more control label, a link label, and the timestamp are inside `fullText`.

**Impact:** control and chrome labels enter the classifier input, the dedup identity (contributing to N-01's `text:` key divergence), the on-screen snippet, and `includeFullText` exports. The existing fixture already proves hidden spans are excluded; control labels are not.

**Required direction:** exclude see-more/see-less controls, permalink/timestamp/action rows, and comment controls from the body text used for classification, identity, and export, while keeping them available for age and metric extraction. Add an assertion that extracted `fullText` from a collapsed card contains no control label.

### N-03 — `open_role` precision is 0.75: four reproducible false-positive classes

**Priority:** P1 — this is PF-01's suspicion, now measured
**Type:** Reproduced accuracy defect

**Evidence:** `node scripts/probe-classifier.js` → `open_role` precision **0.75**, recall **0.889**, 8 false positives. All 8 come from opening-shaped phrases used for something that is **not** a vacancy:

| Class | Example | Result |
|---|---|---|
| Programme / intake applications | "Applications are open for the Spring 2027 MBA intake" | `open_role/likely` |
| Event / webinar / grant applications | "Applications are open for our free webinar on negotiation skills" | `open_role/likely` |
| Volunteering / CSR | "Join our team of volunteers for the beach cleanup this Saturday!" | `open_role/likely` |
| Growth praise / employer marketing | "Our team is growing fast and I could not be prouder of what we shipped this year"; "Come work with us — literally, our office coffee bar is now legendary" | `open_role/likely` |
| French equivalent | "Candidatures ouvertes pour le concours d'entrée à l'école d'ingénieurs" | `open_role/likely` |

**Root cause:** a single `activeOpening` phrase contributes 4 points, and the `open_role` branch fires at `openingHits.length && openScore >= 4`. One phrase with no employment context is therefore sufficient for the top category — no corroboration is required.

**Decision required before fixing:** the pinned corpus encodes the opposite contract — `"We are hiring!"`, `"Nous recrutons un développeur."`, and `"نحن نوظف"` are each labeled `open_role` with no corroborating signal. Requiring corroboration (opening phrase **plus** ≥1 of employment term / application CTA / contact cue / job link / hiring hashtag, with lone phrases demoted to `possible`) raises precision but re-labels those three fixtures. `tests/integration/classifier-corpus.test.js` asserts `correct === total`, so this is an explicit owner labeling decision, not a silent threshold change. Do not add occupational title families to resolve it.

### N-04 — The most common real vacancy formats are missed entirely in EN, FR, and AR

**Priority:** P1
**Type:** Reproduced recall defect

**Evidence:** `node scripts/probe-classifier.js`

| Format | Example | Result |
|---|---|---|
| EN title-line | "Hiring: Site Reliability Engineer, hybrid, Lisbon. Apply here." | `none` (score 2) |
| FR first person | "Je recrute un développeur full-stack pour notre bureau d'Oran." | `none` (score 0, **no evidence reported**) |
| FR nominal search | "Nous sommes à la recherche d'un chef de projet IT en CDI à Paris." | `none` (score 1) |
| AR `مطلوب + title` | "مطلوب مهندس مدني للعمل في مشروع بالجزائر" | `none` (score 0) |
| AR `مطلوب + title` (no CTA) | "مطلوب محاسب في شركة بالجزائر العاصمة" | `none` (score 0) |

**Root cause:** the rule lists are adjacency-locked phrases. `hiring for` does not match `Hiring:`; `nous recrutons` / `on recrute` do not match `je recrute`; `مطلوب للعمل` / `مطلوب موظف` do not match `مطلوب مهندس`. AR cases only surface when the post happens to include a CTA phrase that is also in `activeOpening` (`أرسل سيرتك الذاتية`), which is why `op-ar-03` passed while `op-ar-04`-style posts without a CTA did not.

**Required direction:** add *grammatical frames*, not occupation lists — e.g. line-initial `hiring` followed by `:`/`-`, `je recrute`, `nous sommes à la recherche (d'|de)`, `à la recherche d'un|d'une`, AR `مطلوب <one-or-two-words> (للعمل|للانضمام)?`. Each addition must be validated against the N-03 false-positive classes so precision does not regress, and must respect the documented invariant that title families are excluded.

**Note for this repository's audience:** the FR and AR gaps matter disproportionately — the extension's stated purpose includes Algerian/DZ feed use, and both gaps are in the two non-English languages.

### N-05 — Negation window crosses clause boundaries and silently discards signals

**Priority:** P2
**Type:** Reproduced logic defect with an explainability consequence

**Evidence:** `normalizeText()` maps commas and dashes to spaces, and `negationAtEnd` allows up to 4 intervening words, so a negation in one clause suppresses a genuine cue in the next:

| Input | Result |
|---|---|
| "I am not hiring, but here are hiring tips for new engineering managers." | `none`, score 0, **evidence empty** |
| "لا نوظف حاليا لكن التقديم مفتوح لمنصب آخر" | `closed`; real cue `التقديم مفتوح` reported only as "Negated hiring phrase" |
| "We are not hiring, however we have an opening starting next month." | `closed`; `we have an opening` negated |
| "We are not hiring for this role, but we are hiring for the platform team." | `open_role` — correct only because the second phrase sits 5+ words away |

**Impact:** behaviour depends on word distance rather than clause structure, so the same "not X, but Y" pattern resolves differently by accident. Worse, negated `adviceNews` and `jobSeeker` cues are dropped from `evidence` entirely — only `activeOpening` and `recruiterSearch` negations are reported — so the user sees "No hiring signal" with no explanation even though the classifier matched text. That contradicts the product's explainable-local-classifier premise.

**Required direction:** terminate the negation scope at clause connectives (`but`, `however`, `though`, `yet`, `mais`, `par contre`, `لكن`, `بل`, `غير أن`) and at sentence punctuation before normalization discards them; emit a `Negated <group>` evidence entry for every suppressed group, not only openings and recruiter searches.

### N-06 — The "Partial text" filter can never return a result

**Priority:** P2
**Type:** Reproduced dead UI control

**Evidence:** `upsertExportRecord()` returns early for `category === "none" || category === "partial"`, so partial-only records never enter `exportRecords`. `getStatus()` builds both `counts` and the page from `exportRecords`, therefore `counts.partial` is always 0 and selecting **Partial text** always renders the empty state. Reproduced with a collapsed post whose visible text has no hiring signal: `counts.partial: 0`, `filter="partial"` → `total: 0`.

`tests/integration/monitor-contract.test.js` asserts partial-only entries are omitted, so the omission is intentional; the inconsistency is that `popup.html` still offers `partial` as a filter option and `shared.FILTERS`/`CATEGORIES` still advertise it.

**Required direction:** owner decision — either remove the `partial` filter option and the count, or retain partial records in a read-only view (excluded from exports) so users can see what the page did not expose. Do not leave a control that always reports nothing.

### N-07 — Post age is extracted but never used, so "active" is not established

**Priority:** P2 (composes with PF-02)
**Type:** Purpose-fit gap

**Evidence:** `getPostAge()` computes `label`, `publishedAt`, `ageSecondsApprox`, and `ageDaysApprox`, and exports include them. Nothing consumes them: `queryRecords()` sorts only by `lastSeenAt`/`firstSeenAt` (observation time), no category or confidence considers age, and the UI shows age only in the detail panel.

**Impact:** a reshared 11-month-old "we're hiring" post is presented identically to a one-day-old post. Since the purpose is *genuine **active** vacancies*, and LinkedIn resurfaces old posts through reshares, recency must reach the ranking or the labelling.

**Required direction:** use `ageDaysApprox` where available — e.g. an explicit stale/age indicator on results, age-aware ordering inside the openings-first view from PF-02, and an optional "hide older than N days" control — while keeping observation-time order as the fallback when the DOM exposes no age.

### N-08 — Documentation inventory drift

**Priority:** P3
**Type:** Documentation accuracy

- `tests/fixtures/README.md` documents `collapsed-post.html`, `media-post.html`, and `dear-sir-polarity.html` — **none exist** — and omits the fixtures that do (`dom/collapsed.html`, `dom/expanded.html`, `dom/arabic.html`, `dom/reposts.html`, `classifier/core.json`). *Corrected by this review.*
- `AGENTS.md:65` states **v1.9.0**; every other version reference states **2.0.0**. Left unchanged pending the PF-05 baseline decision.
- The purpose-fit audit reviewed here was never committed; it existed only in conversation. This file records its verification so findings are durable and reviewable.

## Artifacts added by this review

Measurement only — no production code, no behaviour change, no existing gate altered.

| Path | Purpose |
|---|---|
| `tests/fixtures/classifier-probe/adversarial.json` | 65 labeled EN/FR/AR cases (27 `open_role`, 12 `none`, 7 `hiring_discussion`, 7 `closed`, 5 `job_seeker`, 4 `recruiter_search`, 3 `possible`) covering active vacancies, lookalikes, negation, mixed clauses, and advice |
| `scripts/probe-classifier.js` | per-category precision/recall, `open_role` FP/FN lists, per-language accuracy; `--json`, `--strict` |
| `scripts/probe-feed-roots.js` | reproduces N-01/N-02 on one realistic card and on `collapsed.html`; `--strict` |
| `package.json` | `npm run probe:classifier`, `npm run probe:feed` (additive; `npm test` unchanged) |

The probe corpus is deliberately kept **outside** `tests/fixtures/classifier/`, because `scripts/evaluate-classifier.js` globs that directory and `tests/integration/classifier-corpus.test.js` asserts zero mismatches. Dropping these cases in there would turn a measurement into a red build before any labeling decision is made. Once N-03/N-04 are resolved and labels agreed, promote the accepted cases into the pinned corpus and enable `--strict` in CI.

## Recommended next step

Work in this order; items 1–2 are defects, items 3–6 need an owner decision before code changes.

1. **Fix N-01 feed-root selection** (with N-02 in the same change) and add the one-realistic-card → one-record regression test. This is the highest-value fix in the repository: it corrects counts, the results list, dedup accounting, exports, and DOM-health diagnostics at once, and it is unambiguous — no product decision is required.
2. **Implement PF-02 openings-first default view** on top of corrected counts, keeping an explicit "All detected" option and retaining the user's filter choice; add the mixed-feed ordering regression test. Fold N-07 age signalling into this presentation work rather than shipping it separately.
3. **Decide the N-03 labeling contract**: is a lone opening phrase an `open_role`, or is it `possible` until corroborated? This determines whether the pinned fixtures or the scoring rule changes. Then fix N-04's EN/FR/AR grammatical frames and re-measure with `npm run probe:classifier` until `open_role` precision and recall both improve.
4. **Decide N-06**: remove the dead `partial` filter or expose partial records read-only.
5. **Fix N-05** negation scope and evidence completeness (low risk, improves explainability and both FP and FN classes).
6. **Activate CI and run PF-03**: paste `docs/ci/ci.yml` to `.github/workflows/ci.yml` from the owner's account (the App lacks `workflows` permission), let the `REQUIRE_CHROME=1` browser gate run, then do sanitized authenticated-feed validation in EN/FR/AR. Resolve PF-04 (Human-like vs Adaptive) and PF-05 (0.9 vs 2.0.0) explicitly at the same time, and reconcile `AGENTS.md`.

Steps 1, 2, and 5 are repository-actionable now. Steps 3, 4, and 6 are gated on owner decisions or owner-side access, and should not be resolved silently inside accuracy work.

## Remediation status (same session, after owner instruction "fix everything")

Everything repository-actionable above is implemented. Verified state: **`npm test` 125/125 pass**, **`npm run test:classifier` 87/87 correct**, **`npm run probe:classifier -- --strict` exit 0**, **`npm run probe:feed -- --strict` exit 0** (`probe verdict: clean`), **`bash scripts/verify-superpowers.sh` 9/9 pass**, **`node --test tests/integration/package.test.js` 6/6 pass**. `npm run test:browser` remains **NOT RUN** (no Chrome executable here).

| Finding | Status | Evidence |
|---|---|---|
| N-01 duplicate roots | **Fixed.** Card-level classes only (`__` BEM children rejected); nested roots deduplicated by containment; a nested card counts as a separate post only with its own distinct URN; the innermost card carrying an identity is preferred so body/see-more/permalink selection stays scoped; URN-less roots inherit the enclosing card identity. | `tests/dom/monitor-roots.test.js` (6 tests), `npm run probe:feed` → realistic card: 1 root, 1 record, `counts.open_role: 1`, `duplicateMergedCount: 0`; `collapsed.html`: 1 root, 1 record |
| N-02 chrome in post text | **Fixed.** Control labels (see more/less, comment toggles) are stripped, and card-level fallback also excludes actor, timestamp, action row, control menu, and comment chrome. `innerText` semantics in Chrome are preserved by removing each chrome node's own text. | `tests/dom/monitor-roots.test.js` "extracted text excludes see-more labels and card chrome" asserts across *every* returned record |
| N-03 `open_role` precision | **Fixed by tiering, not by re-labeling the pinned contract.** Unambiguous hiring predicates keep their single-phrase `open_role` behaviour; opening-shaped intake phrasing needs independent employment wording or a job/careers link and otherwise stays in `possible`. A phrase can no longer corroborate itself. | `tests/unit/classifier-frames.test.js`; probe: `open_role` precision **1.0**, recall **1.0** (was 0.75 / 0.889), 0 false positives |
| N-04 EN/FR/AR recall gaps | **Fixed** with structural frames and phrases, not title families: `Hiring:`/`Hiring -` headlines, `مطلوب … للعمل\|للانضمام\|في`, `je recrute`, `nous sommes à la recherche`. A frame-only opening that is really commentary ("Hiring: what I learned …") resolves to `hiring_discussion`. | `tests/unit/classifier-frames.test.js`; probe: en 43/43, fr 12/12, ar 10/10 |
| N-05 negation scope + explainability | **Fixed.** Negation ends at clause connectives (`but`, `however`, `mais`, `لكن`, …) and sentence boundaries rather than after four words. Suppressed intake, frame, job-seeker, and advice signals are all reported as `Negated …` evidence. | `tests/unit/classifier-frames.test.js` (two tests); pinned corpus still 87/87 |
| PF-02 default view | **Fixed.** Default order is `relevance`: openings first, then recruiter searches, possible, job seekers, advice, closed; freshest post first within a category; all categories stay visible; **Newest/Oldest first** remain purely chronological; the persisted category choice still wins. | `tests/dom/monitor-ordering.test.js` (5 tests), `tests/dom/popup-result-view.test.js` |
| N-07 unused post age | **Fixed.** `postAge` and a `stale` flag (>60 days, only when the DOM exposed an age) reach result summaries; rows render a localized "Posted {age}" and a stale marker in EN/FR/AR; relevance ordering puts stale openings after current ones. | `tests/dom/monitor-ordering.test.js`, `tests/dom/popup-result-view.test.js` |
| N-06 dead filter | **Fixed** by removing the **Partial text** option (partial-only records are intentionally never archived, per `monitor-contract.test.js`). Partial content is still flagged on archived records, and `counts.partial` still contributes to the popup's "possible" metric. | `tests/dom/popup-result-view.test.js` |
| N-08 documentation drift | **Fixed.** `tests/fixtures/README.md` now lists the fixtures that exist; `AGENTS.md` says 2.0.0. | `grep -rn "1\.9\.0" AGENTS.md README.md CHANGELOG.md` → no matches |
| PF-04 naming | **Decision: keep Adaptive Standard/Fast/Super Fast.** The handoff's "Human-like" wording implies stealth or platform evasion, which contradicts this repository's stated position ("Pacing is for readability and user control, not stealth or platform evasion") and raises Chrome Web Store policy risk. Internal IDs, the three-mode limit, and Super Fast's 15-minute/120-step caps already match the handoff, so nothing functional is lost. Reversible by the owner; a rename is a three-locale string change protected by the i18n parity test. | `docs/audits/2026-10-21-full-extension-audit.md` A-12 |
| PF-05 version baseline | **Decision: keep 2.0.0.** Manifest, package, README, PRIVACY, SECURITY, SUPPORT, store docs, and CHANGELOG already agree; re-baselining to 0.9 would contradict shipped metadata and the released remediation. `AGENTS.md` was the only outlier and is now aligned. | `grep -rn "2\.0\.0" manifest.json package.json README.md` |
| PF-03 Chrome/CI | **Still owner-gated.** The staged workflow now also runs both probes strict, but `.github/workflows/ci.yml` still cannot be created from here: the GitHub App installation lacks the `workflows` permission. Activation is the ~1-minute web-UI step in `docs/ci/README.md`, after which `REQUIRE_CHROME=1 npm run test:browser` runs for real. | `docs/ci/ci.yml`, `docs/ci/README.md` |

### Two judgment calls recorded for review

1. **Eight corpus labels moved to `possible`.** Seven opening-shaped lookalikes (MBA intake, webinar, grant, entrance exam, volunteering, employer praise, employer marketing) and one title-only French post were labeled `none`/`open_role` in the first probe run and are now labeled `possible`. The requirement that matters — *never in Active openings* — is asserted separately and holds; `possible` is the review bucket, and "no hiring signal" would be wrong for text that does contain intake phrasing. This is a labeling decision, so it is stated here rather than buried in a fixture diff.
2. **Accepted limitation:** a post that names only a job title with no hiring predicate, frame, or employment wording (`Notre équipe s'agrandit ! Rejoignez-nous en tant qu'ingénieur qualité.`) stays in `possible`. Detecting it would require occupational title families, which the domain invariants forbid. It is surfaced for review, not dropped.

## Real-export verification (same day, after the owner supplied the first authenticated export)

Evidence: `linkedin-hiring-posts-2026-10-22T04-02-52Z.json`, scan started 03:55:07Z, **32 archived posts**, `duplicateCardsMerged: 0`. `fieldsIncluded.fullText: false` and `fieldsIncluded.emails: false` are the owner's export toggles, not extraction failures; post text was recovered for analysis from the `text:` identities the run itself generated. Every number below is measured from that file.

### Verdict on the six reported defects

| # | Owner's report | Verdict | Measured evidence |
|---|---|---|---|
| 1 | Job-seeker posts systematically under-detected | **Confirmed** | `job_seeker` on **1/32**, and that single hit fired on a bogus cue (`recommandation@1398`) rather than on seeker phrasing. `jobSeeker` signal fired on 1/32 while at least two posts in the corpus are seeker posts. Post #14 (a seeker post) was archived as `possible`. |
| 2 | Clear job postings stuck in `possible` with low scores | **Confirmed** | **4 of the 12** `possible` records are unambiguous vacancies (#5, #7, #11, #24): each carries an explicit opening predicate, a role, a location and an application route. |
| 3 | False positives on non-job “applications” | **Confirmed** | #1 is a **sponsored LinkedIn Jobs advertisement**, archived as `possible` on the strength of `jobs@114` plus a `linkedin.com/jobs` link. No advertising rule existed, so any product placement shaped like a job board entered review. |
| 4 | CV-sharing posts misclassified as `open_role` | **Partly refuted** | `envoyez votre cv` is an employer-side application instruction and is correct evidence for a vacancy; the CV-sharing posts in this export are employer posts. The genuine false positive is #10, promoted to `open_role` at score 7 by actor-headline words counted as body evidence. |
| 5 | Cross-run deduplication absent | **Confirmed, structural** | `id` began with `text:` on **32/32** records and `sourcePostId` was null on **32/32**. A text identity changes with any wording or extraction change, so the same post is a new record on the next run. `duplicateCardsMerged: 0` is a consequence, not a success. |
| 6 | `contentComplete: false` is the norm | **Confirmed and worse than reported** | **32/32**, not “often”. Every record was truncated at the “see more” marker, so application instructions, emails and requirements after it were silently lost. |

Additional defects found in the same file, not in the report: `author.name` null on **32/32**; `permalink` null on **26/32**; `postAge.label` null on **31/32** and literally `"and"` on the remaining one; engagement metrics all-null on **28/32**; `jobTitles` empty on **27/32**; authorship wrong on every reshare/reaction wrapper (#3, #21, #22, #25, #31); extracted text retaining comments, reshares, job widgets and social counts; and the hidden accessibility label “Post du fil d'actualité” opening every single text. Six records (#6, #15, #16, #17, #20, #29) stored their text as `url:<permalink>` while their evidence indices reached 1123–2061, which is the identity fallback of last resort being reached with unusable input.

### Root causes

1. **Root selection took the outer feed wrapper while the card sat inside it.** `belongsToPostRoot` refused to descend through `data-urn`/`role=article` boundaries, so the body node resolved to the card root itself (`body === root`) — which is precisely the `partial` condition, hence 32/32 — the actor block was rejected as not belonging to the post, and identity was searched in ancestors only.
2. **The real cards carry no `data-urn` or `data-id`.** The post URN survives only inside the permalink anchor `href`, so an attribute-only identity search could never find it.
3. **`innerText` is empty for occluded cards.** `content-visibility` occlusion (`occludable-update`) means the `innerText` path returns nothing and extraction fell back to raw `textContent` for all 32 records — which is how hidden labels, buttons, counts and comments entered every text and then every classification. `genericJobTerms` fired on 29/32 records and `recruiterTerms` on 21/32: signals with no discriminative power, because much of what they matched was actor headlines and page chrome rather than post text.

Fixture-driven confidence was false here: the browser fixture encoded the assumptions that the export refuted. That is why the fix is paired with a corpus and a fixture taken from observed markup.

### What changed

- **Identity** (`linkedin-hiring-monitor.js`): post URN patterns for activity/share/ugcPost/jobPosting; identity read from `data-urn`, `data-id`, `data-entity-urn`, `data-urn-public`, `id`, then from descendant nodes, then from hrefs inside the card; permalink derived from the URN when no anchor canonicalizes. A containment boundary now stops descent only when it carries a *different* identity, so a URN-less inner card is not a separate post.
- **Text**: body selectors extended to the `update-components-text` and `feed-shared-update-v2__description` families; chrome removal by clone-and-remove over a frozen selector list (actor blocks, control menus, social-action bars, comment threads, sponsored labels, buttons, visually-hidden nodes) instead of brittle substring splicing; `partial`, `usedCardFallback`, `sponsored` and `fullTextAvailableWithoutExpansion` reported next to the text. `partial` keeps its strict meaning.
- **Scope**: the detected content resolves to the innermost real content scope (reshare/reactor container when present), and identity, permalink, author and metrics are read from that scope.
- **Age**: EN/FR/AR absolute date patterns parse to a real `publishedAt` (12:00 UTC, rolled back a year when the date would be in the future); relative units now require a preceding digit, which removes the `"and"` label.
- **Sponsored**: detected from the card itself and passed to the classifier; advertising copy without a vacancy is `none`, so it is never archived.
- **Classifier and rules** (`linkedin-hiring-classifier.js`, `linkedin-hiring-rules.js`): phrase compilation joins tokens on `[\s#]+` so French elisions and in-phrase hashtags match; `genericJobTerms` split into opportunity terms and non-scoring `contractTerms`; new FR/EN/AR opening, role-marker, seeker and sponsored marker groups; intake promotion requires a role marker; `possible` requires an actionable route, intake evidence, a recruiter search or two independent job-term families; sponsored-without-vacancy resolves to `none`.

### Re-measurement

| Gate | Before this round | After |
|---|---|---|
| `npm test` | 125/125 | **137/137** (8 new tests against observed 2026 markup, plus 4 fixture-sanitization tests) |
| `npm run probe:classifier -- --strict` (113-case gate) | accuracy 0.785 on 87 cases; `open_role` P/R 0.75/0.889 | **accuracy 1.000 (113/113)**; P/R 1.0 for all seven categories; `open_role` **0** false positives, **0** false negatives; en 46/46, fr 32/32, ar 13/13, unlabeled 22/22 |
| Real-world subset (26 sanitized posts from the export) | correct on **13/26** (accuracy 0.500) | correct on **26/26** (accuracy 1.000) |
| `npm run probe:feed -- --strict` | clean | clean |
| `bash scripts/verify-superpowers.sh` | 9/9 | 9/9 |
| `npm run test:browser` | NOT RUN (no Chrome here) | NOT RUN — still owner-gated (PF-03) |

### Sanitization of the real-world corpus

The corpus is derived from a real authenticated export, and the first build of it leaked: 35 real `linkedin.com/in/` and `/company/` URLs with member ids (`…-215574133`), four real personal and organizational mailboxes (`@gmail.com`, a real company domain), third-party shortlinks and a booking page carrying a real username (`calendly.com/<real-name>/…`, `lnkd.in/…`, `ow.ly/…`) wrapped in LinkedIn safety redirects with `urlhash` tracking, three real job-posting ids with `trackingId` tokens, one real organization hashtag, and a real first name plus brand inside post text. All were found by scanning the fixture against the export's own identifier set and against a URL/email/slug/phone inventory, and all are now pseudonymized: placeholder slugs (`auteur-NN`, `entreprise-NN`), reserved `.example` mailboxes and hosts, synthetic job ids, tracking parameters removed, and the name and brand replaced. The gate was re-run after each pass and is unchanged at 1.000, so sanitization did not weaken the corpus.

This is now enforced rather than remembered: `tests/unit/fixture-sanitization.test.js` fails the build if a real-derived fixture contains a non-reserved email domain, a non-placeholder profile or company slug, a third-party host, a LinkedIn safety redirect, a member tracking parameter or a phone number, and fails for *any* fixture that carries a profile URL ending in a real numeric or hex member id. The test was verified non-vacuous by injecting a leaked member URL and mailbox and watching it fail, then restoring the fixture byte-identically. Cities and generic hiring hashtags were deliberately kept: they are the regional and role signal under test and identify no person.

The 13 real-world cases the shipped run got wrong, and what they classify as now: rw-en-01 `possible/3`→`none/0` (sponsored ad), rw-fr-03 `possible/2`→`none/0`, rw-ar-05 `possible/3`→`open_role/6`, rw-fr-07 `possible/6`→`open_role/8`, rw-fr-09 `open_role/6`→`hiring_discussion/4`, rw-fr-10 `open_role/7`→`possible/4`, rw-fr-11 `possible/4`→`open_role/4`, rw-fr-14 `possible/2`→`job_seeker/2`, rw-ar-18 `possible/2`→`hiring_discussion/2`, rw-ar-23 `possible/2`→`hiring_discussion/2`, rw-fr-24 `possible/7`→`open_role/10`, rw-fr-27 `possible/2`→`none/2`, rw-fr-28 `possible/3`→`hiring_discussion/3`.

### Judgment calls recorded for review

1. **Engagement counts are never inferred from bare numbers.** In the export, the bare numbers inside a card were dates and follower counts as often as reactions/reposts/comments, and the only four records that carried metrics got them from typed labels. Positional inference would have manufactured plausible wrong numbers, so metrics stay null without typed evidence; only their scoping was fixed.
2. **`partial` semantics were preserved, not relaxed.** The reported `contentComplete: false` problem was a body-selection failure, so the fix makes the body findable. A record with an unexpanded see-more control still reports `partial`, and partial-only records are still never archived.
3. **The lookalike-host test was updated, not weakened.** `tests/dom/monitor-extraction.test.js` asserted `permalink === null` for a card whose only anchors point at a non-LinkedIn host. A permalink may now be built from the card's own post URN, which is trusted identity rather than an href; the test now asserts the synthesized LinkedIn permalink *and* that no lookalike host can become the permalink or the author identity.
4. **Two corpus labels were decided on the merits.** `rw-ar-18` and `rw-fr-28` are commentary about hiring rather than vacancies or advertising, so they are labeled `hiring_discussion`. They were not relabeled to match code output; both were checked against the labeling contract before the change.
5. **Six export records were excluded from the corpus** (#6, #15, #16, #17, #20, #29) because the run stored no usable post text for them. Their identity path — the `text:` fallback reached with unusable input — is removed by the URN fallback rather than papered over, and the mechanism is documented here instead of being guessed at.

### Still open

- **PF-03 remains owner-gated:** paste `docs/ci/ci.yml` into `.github/workflows/ci.yml`, then run `REQUIRE_CHROME=1 npm run test:browser`. Until then the Chrome `innerText` text path is exercised only by the browser fixture, and this round's changes are verified under jsdom, where `innerText` is absent and the `textContent` fallback runs — the same path the real export proved was being taken.
- The next authenticated export is the real acceptance test for extraction: the expectation is `sourcePostId` non-null on every post, `author.name` non-null, `contentComplete: true` where the feed exposed no see-more control, `postAge.label` a real date, `duplicateCardsMerged > 0` across runs, and no sponsored placement in any bucket.
