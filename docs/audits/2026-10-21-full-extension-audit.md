# Linkerter Extension — Full Audit

**Audit date:** 2026-10-21
**Extension:** LinkedIn Feed Scroller / Linkerter v1.9.0
**Audited commit:** `484442d23d4e8f2fbeb9ef80c72a0ba8e2793b6a`
**Audience:** maintainer, implementer, reviewer, and release owner
**Method:** Superpowers-guided root-cause investigation, complete runtime-source review, direct classifier probes, mocked Chrome/DOM runtime probes, accessibility checks, packaging verification, and release-readiness review.

> This is an audit and remediation backlog, not an approval of the proposed product changes and not an implementation plan. No extension behavior was changed during the audit.

---

## 1. Executive summary

The extension has a sound privacy-oriented foundation: it is a small, zero-runtime-dependency Manifest V3 extension; post analysis happens locally; history is opt-in; exports are user-initiated; runtime rendering uses safe DOM text APIs; and no external-request, remote-code, engagement, or unsafe-HTML APIs were found in the packaged source. The existing integrity verifier and unpacked-package script both pass.

It is **not yet ready for a public/store release**. Four high-priority problems need resolution first: incorrect negation handling, spreadsheet-formula injection in CSV, lost history updates across tabs, and retention not being enforced on every read/export path. The absence of a real automated test suite and CI makes these defects much easier to regress. Privacy/store documentation and real-Chrome validation are also missing.

### Finding totals

| Priority | Meaning | Count |
|---|---|---:|
| **P0 — critical** | Active compromise or comparably severe issue | 0 identified |
| **P1 — high** | Fix before public release | 4 |
| **P2 — medium** | Correctness, privacy, accessibility, performance, or important UX fix | 13 |
| **P3 — low** | Hardening, compatibility, maintainability, and polish | 9 |
| **Additions** | New tests, documentation, assets, architecture, and product capabilities | 12 workstreams |

### Release recommendation

Keep the current build in local/unpacked evaluation. Before submission or broader distribution:

1. Fix **F-01 through F-04** with regression tests.
2. Resolve or explicitly accept every **P2** finding; at minimum fix F-05 through F-09 and F-15.
3. Add the test/CI gate in **A-01** and privacy/store package in **A-02**.
4. Validate against real Chrome and current authenticated LinkedIn DOMs in English, French, and Arabic, including two concurrent feed tabs.

### Highest-value strengths to preserve

- **Local-only analysis:** no `fetch`, XHR, WebSocket, analytics, telemetry, or external service code in runtime files.
- **Read-only social graph:** no like, comment-posting, connect, message, or similar engagement automation.
- **Safe rendering:** untrusted post data is assigned with `textContent`; no runtime `innerHTML`, `eval`, or `new Function` was found.
- **Conservative defaults:** local history is off by default; auto-scroll has time/step limits; Super Fast caps duration/steps and locks pause-on-input.
- **Reasonable permission posture:** no `tabs`, `downloads`, `scripting`, cookies, identity, or broad web-host permissions. Host access is limited to LinkedIn, although its route scope can be narrowed further.
- **Data limits and disclosure:** current-run/history caps exist, CSV has a UTF-8 BOM, and the README documents many important limitations.
- **Packaging hygiene:** only eight runtime files enter the unpacked archive; the large Superpowers installation is excluded.
- **Classifier invariants:** direct probes confirmed that a job title alone, email/contact details alone, and a weak regional phrase alone do not produce a hiring category.

---

## 2. Scope, evidence, and limitations

### Included

- `manifest.json`
- `content.js`
- `linkedin-hiring-rules.js`
- `linkedin-hiring-classifier.js`
- `linkedin-hiring-monitor.js`
- `popup.html`, `popup.css`, `popup.js`
- `README.md`
- `scripts/verify-superpowers.sh` and `scripts/package-extension.sh`
- Test, CI, repository, privacy, accessibility, and release readiness

The packaged runtime reviewed is approximately **168 KB** and **3,714 lines** across the principal source/manifest/documentation files listed in the audit inventory.

### Verification performed

| Check | Result |
|---|---|
| `bash scripts/verify-superpowers.sh` | **8/8 checks passed** |
| JavaScript syntax checks | Passed for all five runtime JavaScript files |
| Manifest/classifier smoke test | Passed |
| `bash scripts/package-extension.sh /tmp/linkerter-audit.zip` | Passed; eight files; ZIP integrity passed |
| Direct classifier probes | Reproduced positive/negative/category-calibration findings |
| Actual popup/monitor source in `jsdom` with mocked Chrome APIs | Reproduced CSV, retention, merge, focus, selector, URL, result-truncation, and concurrent-history findings |
| Accessibility semantic scan | 23 rule passes and 0 reported violations with color contrast disabled; manual keyboard/contrast review still found issues |
| Manual contrast calculations | Several normal-text combinations measured **2.29:1–3.44:1**, below 4.5:1 |
| Classifier microbenchmark | 1,000 classifications in about **846 ms** in Node; useful as a scaling signal, not a browser performance certification |
| Superpowers installation | Local copies are internally synchronized; v7.0.0 |

### Important limitations

- No Chrome/Chromium binary or authenticated LinkedIn session was available in the sandbox. Selectors, actual click behavior, Chrome throttling, popup focus behavior, download completion, and long-feed performance still require real-browser validation.
- Runtime probes executed the actual source with mocked Chrome APIs and DOM/layout behavior. They prove the reported code paths, not every browser-specific manifestation.
- The performance number is a Node microbenchmark, not a Chrome trace. Performance findings are therefore marked as scaling risks until profiled in the browser.
- The accessibility scan is not a screen-reader test. jsdom cannot establish real color rendering, focus behavior, zoom, or popup-window behavior.
- Network privacy was established from source review, not from observing a Chrome network trace.
- Chrome Web Store policy and LinkedIn policy compatibility require a separate current, human review. This audit does not claim legal or terms-of-service compliance.
- This is comprehensive for the checked-in source, but “no other defects exist” cannot be guaranteed without live-browser and production-data testing.

### Evidence labels used below

- **Reproduced:** the actual function/source was executed and the behavior observed.
- **Code-verified:** the deterministic path is visible in source, but a full browser reproduction was not run.
- **Risk:** plausible browser/timing interaction that needs targeted validation.
- **Enhancement:** an improvement or product decision rather than a confirmed defect.

---

## 3. Priority index

| ID | Priority | Area | Finding | Evidence |
|---|---|---|---|---|
| F-01 | P1 | Classifier | Negated/mixed-polarity text is classified as active hiring | Reproduced |
| F-02 | P1 | Security/export | CSV cells permit spreadsheet formulas from untrusted post content | Reproduced |
| F-03 | P1 | History/data integrity | Concurrent tabs can overwrite each other’s history records | Reproduced |
| F-04 | P1 | Privacy/retention | Enabled retention is not enforced on every initialization/export path | Reproduced |
| F-05 | P2 | Auto-expansion | “See more comments” and similar controls can be selected and clicked | Reproduced |
| F-06 | P2 | Data minimization | Any partial non-hiring card can enter the detected archive/history | Code-verified |
| F-07 | P2 | Results | Category filtering happens after a global 50-result truncation | Reproduced |
| F-08 | P2 | Export/history | A newer partial record replaces richer complete history | Reproduced |
| F-09 | P2 | Popup/accessibility | Polling rebuilds results, destroys focus, and can spam live regions | Reproduced/code-verified |
| F-10 | P2 | Metadata | External URLs can be mistaken for LinkedIn permalinks/authors | Reproduced |
| F-11 | P2 | Classifier quality | Thresholds and standalone cues cause surprising categories/noise | Reproduced |
| F-12 | P2 | Performance | Repeated full-feed classification and debounced scans do not scale safely | Benchmark/code/risk |
| F-13 | P2 | Multi-tab behavior | Global preference events cause cross-tab side effects and history write amplification | Code-verified |
| F-14 | P2 | Popup state | Overlapping polls can apply stale responses after commands/target changes | Risk |
| F-15 | P2 | Accessibility | Tiny, low-contrast text and incomplete tab keyboard semantics | Measured/code-verified |
| F-16 | P2 | Reliability | API/storage failures are inconsistently surfaced and sometimes misreported | Code-verified |
| F-17 | P2 | Scroll/monitor UX | Auto-expansion can pause scrolling until manual resume | Code-verified |
| F-18 | P3 | Message protocol | Popup reads `keepHistory`; monitor returns `historyEnabled` | Code-verified |
| F-19 | P3 | Export schema | Partial state overloads confidence and structured evidence is incomplete | Code-verified |
| F-20 | P3 | Deduplication | URL identity is not canonicalized; fallback identity uses only a 32-bit hash | Code-verified |
| F-21 | P3 | Extraction | Numeric timestamps and localized metrics need broader validation | Code-verified |
| F-22 | P3 | Feed filtering | Extension reloads can leave stale hidden attributes/styles | Risk |
| F-23 | P3 | Target lifecycle | Remembered tabs are not revalidated against their window; URL checks differ | Code-verified |
| F-24 | P3 | Compatibility/permissions | No tested Chrome floor; all LinkedIn routes receive all content scripts | Code-verified |
| F-25 | P3 | Maintainability | Large stateful files, duplicated logic, and layered/dead CSS increase drift | Code-verified |
| F-26 | P3 | Packaging | Store and deterministic release artifacts are not defined | Code-verified |

---

## 4. P1 — must fix before public release

### F-01 — Negated and mixed-polarity text becomes positive hiring detection

**Source:** `linkedin-hiring-classifier.js:82-89, 92-159`

**Root cause**

- `hasUnnegatedHit()` is used only to decide whether a closed phrase takes precedence. The `open_role`, `recruiter_search`, and `possible` branches subsequently test raw hit arrays rather than requiring unnegated positive hits.
- `indexOf(phrase)` inspects only the first occurrence. If the first occurrence is negated and a later occurrence is positive, mixed-polarity text can be classified as closed.
- The negative dictionary does not cover several forms that the positive dictionary can match, such as “not currently hiring” and “no longer recruiting.”

**Reproduced examples**

| Input | Current result | Required direction |
|---|---|---|
| `We are not currently hiring for any roles.` | `open_role`, likely, score 5 | Never a positive opening |
| `We are not actively hiring. Apply now.` | `open_role`, strong, score 6 | Never a positive opening |
| `No longer recruiting for this role.` | `recruiter_search`, strong, score 5 | Closed/none, not active recruiter search |
| `No open roles here, but our partner has open roles in Paris.` | `closed`, score 0 | Preserve the later positive clause; do not let the first negated occurrence dominate |

**Impact**

This is a core correctness failure: the UI, feed hiding, counts, history, and exports can all present a negative announcement as a current opportunity. “Strong” confidence makes the error especially misleading.

**Required fix**

- Return match occurrences with positions and evaluate negation/polarity per occurrence, not per phrase’s first `indexOf`.
- Require an unnegated positive signal in every positive branch, including fallback `possible`.
- Resolve mixed clauses at sentence/clause level; do not let one closed phrase erase an independent current opening.
- Expand EN/FR/AR negative fixtures and make the precedence rules explicit.
- Preserve the invariants that titles, contact details, and weak regional cues alone cannot classify a post.

**Acceptance tests**

- Every example above has a pinned expected non-positive/appropriate mixed-clause result.
- Test multiple occurrences, negation before and after a clause, punctuation, Arabic diacritics, French elision/accents, and mixed-language posts.
- Run a labeled corpus and compare category/confusion metrics before and after changing weights.

---

### F-02 — CSV export allows spreadsheet-formula injection

**Source:** `popup.js:848-890`, especially `csvValue()` at `882-886`

**Root cause**

CSV quoting escapes double quotes but does not neutralize formula-leading string values. LinkedIn text, author data, and other exported strings are untrusted input. Spreadsheet applications may interpret cells beginning with formula markers even when the cell is quoted.

**Reproduction**

A stored post whose `fullText` begins with:

```text
=HYPERLINK("https://attacker.invalid","click")
```

was exported as a cell beginning:

```csv
,"=HYPERLINK(""https://attacker.invalid"",""click"")"
```

**Impact**

A user who opens the export in a spreadsheet can be exposed to formula evaluation, deceptive links, or application-dependent external actions. The attack requires the export/open workflow, so this is not a remote zero-click extension compromise, but it is a release-blocking output-encoding issue.

**Required fix**

- Apply spreadsheet-specific sanitization to every untrusted **string** cell, including `=`, `+`, `-`, `@`, and leading whitespace/control-character variants used to bypass simple checks.
- Keep known numeric fields numeric; do not corrupt legitimate negative numbers.
- Preserve normal CSV quoting, CRLF, BOM, Unicode, and embedded multiline text behavior.
- Document that JSON remains the lossless data format and CSV is spreadsheet-safe presentation output.

**Acceptance tests**

Cover all formula prefixes, leading spaces/tabs/CR/LF, quotes, commas, Arabic/RTL text, multiline posts, arrays/objects, and a round-trip through at least one real spreadsheet application.

---

### F-03 — Concurrent history writes lose records

**Source:** `linkedin-hiring-monitor.js:661-700`; multi-tab preference entry points at `960-1009` and `1077-1108`

**Root cause**

Each content script independently performs a read-merge-write sequence against `chrome.storage.local`. The merge is not atomic. Two tabs can read the same old snapshot and then write different merged arrays; the last writer replaces the first writer’s records.

**Reproduction**

Two isolated monitor contexts shared a mocked storage backend. Both reads were completed before either write. Tab A held record `tab-a`; tab B held record `tab-b`. After both actual `persistHistory()` calls completed, storage contained only:

```json
["tab-b"]
```

**Impact**

Opt-in post history and its associated review/export data can silently disappear under a supported multi-window/multi-feed workflow. Retrying without a coordination mechanism does not guarantee correctness.

**Required fix**

Choose and document one coordination design:

- Prefer a **single extension-owned writer/coordinator** (for example, an MV3 service worker) if multi-tab history remains supported; or
- Use a rigorously tested lock/revision/retry design with clear ownership and clear/reset behavior.

Also prevent idle tabs from writing unchanged snapshots. Define how clearing history interacts with queued writes so deleted data cannot be resurrected.

**Acceptance tests**

- Concurrent A+B writes retain both records.
- Same-post concurrent writes merge deterministically without losing complete content.
- Stress repeated concurrent saves, stop/start, disable-history, clear-history, tab close, and stale asynchronous completions.
- Verify no queued write can recreate records after a confirmed clear.

---

### F-04 — Retention is not enforced on every enabled-history path

**Source:** pruning exists at `linkedin-hiring-monitor.js:619-639`, but popup loading/export at `popup.js:260-265, 767-789, 944-978` only sorts/slices

**Root cause**

Retention pruning runs through monitor history configuration/persistence. The popup’s initialization and export path reads stored records directly without applying the selected age cutoff. If history is enabled but no active monitor has pruned it, expired records remain available and exportable.

**Reproduction**

With **Keep local post history enabled** and retention set to seven days, a record last seen on `2020-01-01` was loaded and included in a new JSON export. The exported post count was one.

**Impact**

The user-facing seven-/30-/90-day retention choice does not reliably bound how long data is kept or reused. This is a privacy-control correctness issue.

**Required fix**

- Centralize one retention function and use it before display, merge, persistence, and export.
- Prune on extension/popup initialization, retention changes, monitor initialization, and before export—not only after a monitor write.
- Persist removals when history is enabled; do not merely hide expired rows.
- Preserve the explicitly documented distinction that disabling history stops new saves but retains old records until the user clears them. If retention should continue while disabled, change the UI and documentation explicitly instead.

**Acceptance tests**

Use fake clocks around exact cutoff boundaries, invalid/future dates, enabled vs. disabled history, no LinkedIn tab open, monitor never started, popup-only export, and 7/30/90-day changes.

---

## 5. P2 — correctness, privacy, performance, and UX fixes

### F-05 — Auto-expansion can select non-post-text controls

**Source:** `linkedin-hiring-monitor.js:75-83, 158-160, 204-222, 812-846`

`isSeeMoreControl()` uses substring matching across the whole card, and `findSeeMore()` accepts the first matching button. A button labelled **“See more comments”** was selected and caused `details.partial === true`. During real monitoring it is eligible for `.click()`.

**Impact:** the extension can load comments or activate another “show more” feature instead of expanding the post body. This exceeds the user’s specific auto-expand-long-posts expectation and can trigger additional LinkedIn requests and DOM churn.

**Fix:** scope the control to the identified post-body container; reject labels containing comments/replies/reactions and unrelated contexts; verify the body expands or the control disappears before recording success. Add localized positive and negative fixtures.

---

### F-06 — Partial non-hiring cards enter history/export

**Source:** `linkedin-hiring-monitor.js:773-803`

When classification is `none` and text is considered partial, the category is changed to `partial` before `upsertExportRecord()`. Consequently, a collapsed ordinary post can enter the detected archive and opt-in persistent history even without a hiring signal.

**Impact:** unnecessary post text is retained/exported, counts become noisy, and F-05 increases the number of cards treated as partial.

**Fix/product decision:** separate “needs more text” from “hiring detection.” Do not persist or export a category-`none` card unless it has independent hiring evidence or the user explicitly chooses an include-uncertain option. Keep uncertain cards visible in feed filtering without automatically archiving them.

---

### F-07 — Selected categories can show zero results despite non-zero counts

**Source:** `linkedin-hiring-monitor.js:909-956`; `popup.js:532-535, 667-684`

The monitor counts all unique results, then globally sorts and slices to 50. The popup applies its selected category only to that truncated list.

**Reproduction:** 30 older `job_seeker` results plus 50 newer `open_role` results produced `counts.job_seeker === 30`, while all 50 returned results were `open_role`. Selecting Job Seekers therefore yields an empty view.

**Fix:** filter before pagination/limiting, or return a paginated result API with `total`, `returned`, `offset/cursor`, and per-category totals. Show all active-filter matches up to a clearly disclosed page size. Add tests with more than 50 and more than 80 records.

---

### F-08 — Merging destroys richer historical content

**Source:** `popup.js:779-787`; similar last-seen replacement in `linkedin-hiring-monitor.js:678-683`

Current-run records always replace same-ID history in the popup. A complete historical post with `fullText: "Complete historical post text"` was replaced by a current `fullText: "Truncated…"`, `contentComplete: false` record in the reproduced export.

**Impact:** exports and persisted history lose previously captured text and can lose stronger metadata merely because the latest observation is partial.

**Fix:** define a field-aware merge policy. Preserve complete text and the best available metadata while updating last-seen, classification, and fresh metrics independently. Never replace `contentComplete: true` with incomplete text without retaining the complete version.

---

### F-09 — Frequent rendering destroys user focus and over-announces changes

**Source:** `popup.js:503-530, 620-705, 931-941, 1083-1085`; live regions in `popup.html:41, 44, 139-140, 217`

`refreshAll()` runs every 1.3 seconds. `renderHiringStatus()` calls `matchList.replaceChildren()` and recreates every review select. In the reproduction, a focused review select was disconnected after the next render and neither the old nor new select retained focus.

**Impact:** keyboard users can lose their place or an open dropdown; screen readers may receive repeated live-region updates. The same pattern makes the UI feel unstable.

**Fix:** use keyed incremental rendering, update only changed fields, preserve focus/selection, and skip renders when status has not meaningfully changed. Do not put a continuously rebuilt list or clock in an assertive/polite announcement path. Announce meaningful state transitions only.

---

### F-10 — Permalink and author extraction do not validate the URL host

**Source:** `linkedin-hiring-monitor.js:286-343`

The code matches path-like text against the entire absolute URL rather than checking `URL.hostname` and `URL.pathname`.

**Reproduced outputs**

- `https://external.invalid/posts/not-linkedin` → accepted as the post permalink.
- `https://external.invalid/?next=linkedin.com/in/not-an-author` → accepted as the author profile URL.

**Impact:** exported identity and deduplication can be wrong. This is not an XSS finding—the popup uses safe text APIs—but it is a metadata-integrity problem.

**Fix:** parse once, require an expected HTTPS LinkedIn hostname for LinkedIn permalink/profile fields, and validate path segments. Keep arbitrary external links only in the general `extracted.links` field.

---

### F-11 — Classifier calibration produces surprising categories and context-free matches

**Source:** `linkedin-hiring-classifier.js:109-159`

**Reproduced examples**

| Input | Current result |
|---|---|
| `We are hiring!` | `possible`, not `open_role` |
| `Looking for candidates.` | `possible`, not `recruiter_search` |
| `Apply now for our new credit card.` | `possible` hiring match |

The first two may reflect an intentional corroboration threshold; the third shows that an application CTA is treated as sufficient hiring context on its own.

**Required action:** do not simply tweak numbers. Build a labeled multilingual corpus, define expected category semantics, and tune thresholds against precision/recall. Require hiring context for generic CTAs, while deciding explicitly whether an unambiguous active-opening phrase alone belongs in `open_role`. Keep low-confidence review behavior where uncertainty is genuine.

---

### F-12 — Monitor/classifier work scales with the entire loaded feed

**Source:** `linkedin-hiring-classifier.js:27-41`; `linkedin-hiring-monitor.js:857-906, 997-1004`

- Every phrase test constructs a new regular expression for every classification.
- A hidden-tab pass reinspects all loaded roots every five seconds; visible passes also repeat classification.
- `seenRoots` affects counting, not avoidance of repeated extraction/classification.
- Every mutation/scroll schedules by clearing the previous timer. Sustained events can postpone scans rather than guarantee a trailing plus periodic pass.
- A Node benchmark took about 846 ms for 1,000 classifications before DOM extraction costs.

**Impact:** long feeds can create main-thread stalls, battery use, delayed scrolling, and Chrome background throttling. The exact browser severity needs a real trace.

**Fix:** precompile normalized phrase matchers; cache by stable content/link fingerprint; process dirty/new roots incrementally; batch and yield; use bounded throttling that cannot starve; and profile 100/500/1,000-card feeds in visible and hidden tabs. Avoid weakening DOM-health checks merely to hide the cost.

---

### F-13 — Preference propagation creates multi-tab side effects and redundant writes

**Source:** `linkedin-hiring-monitor.js:709-723, 1077-1108`; `popup.js:231-245`

Every LinkedIn content script receives the full preference object. With history enabled, `configureHistory()` schedules an immediate history save even for unrelated preference changes such as export format. Filter and feed-hiding options also propagate to every monitor, not only the user’s selected tab.

**Impact:** multiple tabs can rewrite a multi-megabyte history unnecessarily, amplify F-03, and change feed visibility in another window without a clear user expectation.

**Fix:** compare old/new values per key, write history only when relevant data changed, make only the owning/active monitor persist its records, and decide which preferences are global versus per-tab. Label global controls if global behavior is intentional.

---

### F-14 — Popup polling has no stale-response or in-flight protection

**Source:** `popup.js:428-485, 689-705, 708-745, 1083-1085`

The interval starts asynchronous refreshes without waiting for the prior refresh. Requests capture global target state indirectly, and responses are applied without checking that the target and command generation are still current.

**Risk:** a delayed old-tab or pre-command response can overwrite newer status after a target switch or Start/Stop action. This needs a deterministic delayed-Promise browser/unit reproduction.

**Fix:** add a single-flight scheduler, monotonically increasing target/request generations, and response guards. Disable or idempotently handle commands while pending. Test delayed/out-of-order responses explicitly rather than adding arbitrary delays.

---

### F-15 — Visual and keyboard accessibility need remediation

**Source:** `popup.css`, notably lines `11, 63, 69, 134-156, 174-185, 197-219, 234-240`; tabs at `popup.html:36-38` and `popup.js:931-941`

**Measured examples**

- Footer `#9aa6af` on `#f2f6f8`: **2.29:1**.
- Local note `#96a2ac` on white: **2.61:1**.
- Toggle/help text `#8a99a6` on `#fbfcfd`: **2.84:1**.
- Global notice `#758697` on `#f2f6f8`: **3.44:1**.

These are normal-text colors and need 4.5:1 under the applicable WCAG contrast criterion. Much of the UI is also only 7–10 px, creating a serious readability problem even where contrast passes.

The tab roles have click handling but no roving `tabindex` or arrow-key tab behavior. The automated semantic scan found no violations with contrast disabled, which does not cover these manual findings.

**Fix:** establish a readable type scale and contrast tokens, test zoom/reflow, implement the expected tab keyboard pattern or use simpler button semantics, and perform keyboard plus screen-reader testing. Preserve visible focus while fixing F-09.

---

### F-16 — Failures are swallowed or misreported

**Source:** `linkedin-hiring-monitor.js:642-656, 661-691`; `popup.js:708-745, 944-995, 1002-1068`

- Several async event handlers call storage/API operations without a terminal `.catch()` or user-visible error state.
- `persistHistory()` maps any failure to `historyLimitReached = true`, which the UI can describe as a storage cap even when the actual failure is unavailable storage, serialization, or another API error.
- Initial storage failure falls back to empty history without clearly warning that existing data may still be present but unreadable.

**Fix:** introduce typed local error states (`quota`, `unavailable`, `truncated`, `invalid-data`, `tab-gone`), centralize command error handling, avoid unhandled rejections, and preserve honest UI state. Keep diagnostics local and sanitize post content from logs.

---

### F-17 — Auto-expansion can leave the scroller paused indefinitely

**Source:** `linkedin-hiring-monitor.js:833-846`; `content.js:558-560`

The monitor dispatches `li-feed-auto-expand-start`; the scroller calls `pauseSession()`. There is no matching resume event. A monitor comment says “pause auto-scroll briefly,” but the actual pause lasts until the user resumes or stops.

**Fix/product decision:** either:

- Resume only if this event paused a previously running session and no user input/stop occurred meanwhile, with tests for races; or
- Keep manual resume and change all copy/comments to say clearly that expansion pauses scrolling until resumed.

Do not silently resume a session the user deliberately paused.

---

## 6. P3 — hardening and maintainability backlog

### F-18 — History status property mismatch

**Source:** monitor returns `historyEnabled` at `linkedin-hiring-monitor.js:945`; popup checks `status.keepHistory` at `popup.js:630`.

The popup therefore cannot synchronize that state from this field. It is mostly masked by shared preference storage today. **Fix:** define a versioned message/status schema, use one property name, and add contract tests.

### F-19 — Export explainability is internally lossy

**Source:** `linkedin-hiring-classifier.js:161-194`; `linkedin-hiring-monitor.js:500-527, 794-802`

- `confidence` is replaced by `partial`, conflating classifier confidence with extraction completeness even though `contentComplete` already exists.
- Evidence is truncated to four entries.
- Structured `signals` omit contributing groups such as application CTA, generic job terms, recruiter terms, and contact cues.

**Fix:** preserve classifier confidence, add a separate extraction status, expose all structured signal groups, and version/document the JSON schema. UI summaries may remain concise without making exports lossy.

### F-20 — Deduplication identity needs canonicalization

**Source:** `linkedin-hiring-monitor.js:481-497`

Permalinks retain tracking query/fragment variants, and fallback author+text identity is reduced to a 32-bit hash. Distinct records can theoretically collide, while the same post can appear under multiple URLs.

**Fix:** normalize allowed LinkedIn URLs by host/path and approved query parameters; retain a collision-checkable canonical identity rather than relying only on a 32-bit digest. Test expanded text, reposts, duplicate DOM roots, tracking URLs, missing IDs, and long URLs. Review-label IDs should use the same canonical identity without lossy truncation.

### F-21 — Age and metric extraction need broader fixtures

**Source:** `linkedin-hiring-monitor.js:350-479`

`Date.parse()` is used for `data-timestamp`, although numeric epoch attributes may need explicit seconds/milliseconds handling; the primary selector does not directly include `[data-timestamp]`. Metric parsing primarily supports English-style K/M/B suffixes and broad labels.

**Fix:** add localized fixtures for EN/FR/AR numerals, compact counts, epoch timestamps, comments vs. reposts, and ambiguous labels. Keep unavailable values `null` rather than inventing precision.

### F-22 — Feed-filter artifacts need reload recovery

**Source:** `linkedin-hiring-monitor.js:725-749`

Hidden state is tracked only in the current content-script instance. If the extension context is reloaded while filtered cards remain in the DOM, a new instance does not know the old roots/styles.

**Fix:** on initialization/stop, reconcile stale extension-owned attributes and style elements safely; test reload, update, SPA navigation, and disconnected roots. Ensure cleanup never hides new content permanently.

### F-23 — Remembered target validation is incomplete

**Source:** `popup.js:337-367, 428-464, 1012-1034`

A remembered tab ID is messaged but not revalidated against its current `windowId`; moving a tab between windows can violate the per-window target model. `isLinkedInFeedUrl()` also treats root URLs with query/hash differently from the content script’s pathname check. Returning to a tab in another window may activate it without focusing its window.

**Fix:** revalidate tab identity/window/feed state, handle attach/detach or requery, use one URL parser everywhere, and test tab moves, window focus, root query/hash, SPA navigation, and closed tabs.

### F-24 — Declare compatibility and reduce route scope

**Source:** `manifest.json`

There is no `minimum_chrome_version`, despite modern JavaScript and Promise-based Chrome APIs. All four scripts run on every `https://www.linkedin.com/*` route even though operation is feed-only.

**Fix:** choose a tested Chrome floor from the actual API/feature set and declare it. Where compatible with tab URL visibility and root-feed behavior, narrow content-script matches and host access to the required LinkedIn routes. Document Chrome/Edge support separately; do not claim Firefox support without a port and tests.

### F-25 — Split stateful units and remove duplication

**Source:** `popup.js` (1,093 lines), `linkedin-hiring-monitor.js` (1,111 lines), `content.js` (591 lines), and `popup.css`

Defaults, settings sanitation, URL/feed checks, categories, and status conventions are duplicated. CSS contains repeated `html/body/.app` layers, repeated media queries, and apparently unused range/history styles. The current shared-property typo (F-18) demonstrates the drift risk.

**Fix:** after behavioral tests exist, separate classifier, extraction, archive/history, monitor, message protocol, popup state, rendering, and export responsibilities. Share constants/schemas deliberately while preserving zero runtime dependencies and the required content-script order. Consolidate CSS rather than restyling blindly.

### F-26 — Define release artifact formats

**Source:** `scripts/package-extension.sh`

The current ZIP is valid for the documented unpacked-install flow and contains a top-level `linkedin-feed-scroller/` directory. A store-upload artifact generally needs a separately verified layout with `manifest.json` at the archive root. ZIP entries also inherit source metadata, so builds are not reproducible.

**Fix:** keep the unpacked archive if users need it, add a separately named store artifact, validate both in CI, fix entry ordering/metadata for reproducibility, and record the package manifest/file hash in release notes. Do not label the current unpacked package broken—it matches its documented purpose.

---

## 7. Required enhancements and additions

### A-01 — Add a real test pyramid and CI gate (**required before public release**)

There is currently no extension test suite, package manifest, or CI workflow; the verifier is a useful smoke check only.

Add:

1. **Classifier unit tests:** all categories, EN/FR/AR normalization, negation/mixed clauses, hashtags, obfuscated emails, links, closed posts, false-positive contexts, and the title/contact/weak-regional invariants.
2. **Labeled evaluation corpus:** versioned fixtures with expected categories and measurable precision/recall; keep adversarial and regression cases.
3. **DOM extraction tests:** post-body vs. comments, reposts, collapsed/expanded content, authors/permalinks, ages/metrics, missing selectors, and localized controls.
4. **Archive/history tests:** deduplication, limits, complete-vs-partial merge, retention, concurrent writers, clear/disable races, and storage errors.
5. **Popup tests:** target lifecycle, out-of-order messages, focus-preserving rendering, category pagination, field selection, JSON/CSV snapshots, formula defense, and API failures.
6. **Scroller tests:** fake timers/frames for start/pause/resume/stop, time/step caps, hidden-tab fallback, no movement, input pause, and auto-expand interaction.
7. **Real MV3 browser tests:** load unpacked extension, actual downloads, actual `chrome.storage`, tab/window operations, reload/update, SPA navigation, and visible/hidden feeds.
8. **CI:** syntax, unit/integration/browser tests, verifier, package integrity, and release-asset checks on every change. Pin development dependencies and lock them; keep runtime dependency-free.

### A-02 — Add privacy and store-compliance materials (**required before public release**)

- A clear `PRIVACY.md`/hosted privacy policy describing exactly what is read, stored, exported, retained, and deleted.
- Explicit treatment of post text, email addresses, author/profile links, metrics, review labels, target-tab mappings, and settings.
- Accurate Chrome Web Store data-use disclosures and permission justifications, reviewed against current requirements at submission time.
- Clear explanation that the extension itself makes no external service requests, while normal LinkedIn scrolling/expansion can cause LinkedIn itself to make network requests.
- Data-retention behavior, history-off semantics, clear-history vs. clear-all behavior, and uninstall behavior.
- Responsible-use and LinkedIn-policy review; do not claim compliance solely because automation is local.

### A-03 — Add release assets and repository governance

- Extension icons at appropriate sizes plus action/store artwork.
- Store listing, screenshots, concise feature/limitation copy, support/homepage URL, and versioned release notes.
- Root project license, changelog, contributing/support guidance, and security-issue reporting path.
- Document that vendored Superpowers has its own license and is development tooling, not extension runtime.
- Automated validation that every manifest/HTML-referenced file is packaged and no development files/secrets are included.

### A-04 — Make detected results actionable

Add a safe detail view with full captured text, author/time/metadata, evidence, completeness, and a validated permalink. Provide “open original post” and, where feasible, “reveal/focus in feed” actions. Add search, sorting, category-specific pagination, and a visible `showing X of Y` indicator. Preserve current-run vs. saved-history provenance.

### A-05 — Add complete local-data controls

- “Clear all local data” with granular choices for post history, review labels, target mappings, and settings.
- Optional minimal-export defaults or an explicit sensitive-fields confirmation for full text/emails.
- A session-only history option using non-persistent storage where appropriate.
- Visible storage state, actual byte usage, last successful save, and honest quota/error reporting.

### A-06 — Introduce a shared protocol and ownership architecture

Define versioned message and export schemas, shared category/status names, and clear ownership for target selection, monitor state, and history writes. A small MV3 coordinator/service worker is justified if multi-tab history remains supported; do not add one merely for background scrolling, which already belongs to the content script.

### A-07 — Improve classifier quality without weakening its principles

- Build versioned EN/FR/AR evaluation sets and publish local precision/recall summaries.
- Add clause/context handling, better negation, and signal-combination rules.
- Consider user-managed local keyword inclusion/exclusion lists and threshold presets only after the baseline is measured.
- Keep processing local, explainable, and free of required AI/network calls.
- Preserve the rule that job titles or contact details alone never create a hiring detection; weak regional signals remain weak.

### A-08 — Add a DOM-compatibility fixture library and better health reporting

Save sanitized representative DOM fixtures for each supported LinkedIn layout/language. Version selector strategies, distinguish “no posts” from “unknown layout,” report extraction coverage by field, and expose a local compatibility report without uploading page content.

### A-09 — Add accessibility and UI localization

Beyond fixing F-09/F-15, add French and Arabic popup localization where justified, RTL layout testing, keyboard help, meaningful status announcements, zoom/reflow support, and reduced-motion consideration for nonessential UI transitions. Automated scrolling itself should remain an explicit user-started action.

### A-10 — Improve session resilience without silently retaining data

Warn before a new run discards a non-empty unexported archive. Consider explicit session-only recovery for reloads, or a clear export reminder. Do not turn on persistent history silently and do not restore scrolling/monitoring unexpectedly after a browser restart.

### A-11 — Add privacy-safe local diagnostics

Provide an on-demand diagnostic bundle containing extension version, browser version, message/schema versions, selector health counts, error categories, and timing metrics—without post text, emails, profile URLs, or tab URLs by default. No telemetry endpoint is needed.

### A-12 — Clarify product language and onboarding

Review “Human-like” wording: “Adaptive Standard/Fast/Super Fast” is clearer and avoids implying stealth or platform evasion. Add concise first-run onboarding for target selection, background throttling, auto-expansion, local history, exports, and stopping/cleanup. Keep responsible-use language in the UI, not only the README.

---

## 8. Recommended remediation sequence

Each behavior fix should follow Superpowers **systematic-debugging → test-driven-development → verification-before-completion**. The audit’s reproductions should become failing tests before implementation.

### Phase 1 — Security, privacy, and data integrity

- F-02 CSV formula defense.
- F-03 single-owner/coordinated history and clear-write races.
- F-04 centralized retention enforcement.
- F-01 occurrence-aware polarity/negation and classifier regression corpus.
- Start A-01 alongside the first fix; do not defer tests until the end.

**Exit gate:** all four P1 reproductions fail on the old code and pass on the fixed code; concurrent and retention tests are repeatable.

### Phase 2 — Monitor and export correctness

- F-05/F-06 scoped expansion and partial-card data policy.
- F-07 filter/pagination contract.
- F-08 field-aware record merge.
- F-10 URL host/path validation.
- F-11 labeled classifier calibration.
- F-18/F-19/F-20/F-21 protocol, schema, identity, and extraction hardening as migrations allow.

**Exit gate:** sanitized DOM fixtures and export contract tests pass; no richer historical content is lost.

### Phase 3 — State ownership and performance

- F-12 incremental/cached/batched scanning and real browser profiles.
- F-13 preference ownership and write reduction.
- F-14 single-flight/generation-guarded popup messaging.
- F-23 target lifecycle.
- Implement A-06 only to the extent needed to make ownership reliable.

**Exit gate:** two tabs and delayed/out-of-order responses cannot overwrite state; long-feed browser traces meet an agreed main-thread budget.

### Phase 4 — UX and accessibility

- F-09 keyed rendering and meaningful announcements.
- F-15 contrast/type/keyboard remediation.
- F-16 honest error states.
- F-17 explicit pause/resume semantics.
- F-22 stale filter recovery.
- A-04/A-05/A-09/A-12 according to approved product scope.

**Exit gate:** complete keyboard workflow, screen-reader smoke test, zoom/contrast review, and no focus loss during polling.

### Phase 5 — Release engineering and live validation

- A-02 privacy/store materials.
- A-03 assets/governance.
- F-24 compatibility/least privilege and F-25 maintainability work already justified by touched files.
- F-26 separate reproducible unpacked/store artifacts.
- Real Chrome validation on current LinkedIn layouts and current store-policy review.

**Exit gate:** a clean checkout produces identical verified artifacts; install, upgrade, use, export, clear, reload, and uninstall paths are documented and tested.

---

## 9. Final release checklist

### Correctness

- [ ] Negated posts never become positive matches; mixed-clause behavior is pinned by tests.
- [ ] Category counts and displayed results agree beyond 50/80 records.
- [ ] “See more” activates only the intended post-body control.
- [ ] Duplicate, partial, and complete records merge without data loss.
- [ ] Permalink/author fields are host-validated and deduplication is canonical.
- [ ] Start/pause/resume/stop, time/step caps, no-movement stop, and input handling pass in Chrome.

### Security and privacy

- [ ] CSV formula payloads are neutralized and real spreadsheet behavior is checked.
- [ ] Concurrent history writes and clear/disable races cannot lose or resurrect data.
- [ ] Enabled retention is enforced before storage, display, and export.
- [ ] Non-hiring partial cards are not persisted without an explicit approved reason.
- [ ] Privacy policy/store disclosures match actual behavior.
- [ ] Runtime network review confirms no extension-owned external uploads.
- [ ] Read-only social-graph invariant remains intact.

### Accessibility and UX

- [ ] Normal text reaches applicable contrast requirements; type is readable at default and zoomed sizes.
- [ ] Full keyboard flow works, including tabs and review labels.
- [ ] Polling does not destroy focus or repeatedly announce unchanged content.
- [ ] Errors are accurate, visible, and do not claim quota for unrelated failures.
- [ ] Pause/resume and global-vs-per-tab preference behavior are clear to users.

### Quality and release

- [ ] Unit, DOM, popup, concurrency, export, and real MV3 browser tests run in CI.
- [ ] EN/FR/AR classifier and DOM fixtures pass with reviewed quality metrics.
- [ ] Long visible/hidden feeds are profiled in Chrome.
- [ ] Supported Chrome versions and route permissions are explicit and tested.
- [ ] Icons, privacy, store listing, screenshots, license, changelog, and support information exist.
- [ ] Both unpacked and store archives are validated; store ZIP has the required root layout.
- [ ] A human reviews current Chrome Web Store and LinkedIn policy considerations.

---

## 10. Audit notes on existing tooling

- `scripts/verify-superpowers.sh` is useful for installation integrity and smoke checks, but its name/output should not be treated as proof of extension correctness. Keep it and add the real suite in A-01.
- The local Superpowers skill copies are synchronized with each other. A current upstream checkout also reports v7.0.0 but differs in a few files, while this repository contains an Arena-specific reference. Future updates should use a deliberate three-way diff and preserve intentional Arena adaptations rather than blindly overwriting the vendored tree.
- The current package correctly excludes `.agents`, `.claude`, documentation, and audit tooling. Temporary audit dependencies and reproduction scripts were kept outside the repository and are not runtime dependencies.

---

## 11. Bottom line

Linkerter should keep its local-only, explainable, dependency-free design. The next milestone should not be a larger feature set; it should be a **verified correctness and data-ownership milestone**. Fix the four P1 issues, make history/retention/export behavior deterministic, scope automatic clicks correctly, add regression tests, and validate accessibility and real Chrome behavior. Only then should new classifier options, richer result workflows, localization, and store distribution be layered on top.

---

## 12. Remediation status appendix — 2026-10-22

This appendix records the v2.0.0 remediation state without rewriting the original v1.9.0 findings. **Code/test remediated** means the repository implementation and executable non-browser checks are present. It does not mean a real-browser, authenticated-site, store, legal, or owner gate has passed.

### Verification snapshot

- Full local suite: **102/102 PASS** (`npm test`), including unit, integration, DOM, popup, accessibility/i18n, concurrency, export, and package tests.
- Labeled classifier corpus: **22/22 correct**, with an empty confusion matrix (`npm run test:classifier`). This is a small regression corpus, not proof of real-world precision/recall.
- Superpowers/runtime integrity: **9/9 PASS** (`bash scripts/verify-superpowers.sh`).
- Release/package suite: **6/6 PASS**, including exact allowlists, both layouts, icons, versions, documentation, CI commands, and byte-identical output under different source mtimes.
- Real Chrome MV3 harness: six scenarios implemented with sanitized intercepted HTTPS fixtures; **NOT RUN in this sandbox because no Chrome/Chromium executable is installed**. CI uses `REQUIRE_CHROME=1`; a missing browser cannot silently pass there.
- Authenticated LinkedIn, real screen-reader/zoom/color/focus review, long-feed Chrome profiling, owner licensing/publisher decisions, and store/policy approval: **NOT RUN / open external gates**.

### Finding-by-finding disposition

| Finding | Repository remediation and evidence | Remaining gate |
|---|---|---|
| F-01 | Occurrence/clause-aware polarity, positive-signal requirements, and EN/FR/AR regression fixtures in classifier unit/corpus suites. | Broader live-site quality review. |
| F-02 | Shared CSV neutralization covers formula-leading whitespace and `=`, `+`, `-`, `@`; popup/export tests cover Unicode/multiline output. | Actual spreadsheet behavior is not claimed from string tests. |
| F-03 | MV3 coordinator serializes reads/writes, merges canonical IDs, and passes concurrent-barrier/delta/clear-race tests. | Two-tab real-Chrome scenario is implemented but locally `NOT RUN`. |
| F-04 | Enabled retention is applied on coordinator initialization, writes, status, and export reads; off-mode records are preserved. | None in repository tests. |
| F-05 | Body-first, scoped “See more” selection rejects comment controls; observed-change and bounded-retry DOM tests pass. | Current authenticated labels/layouts. |
| F-06 | Non-hiring/uncertain partial cards do not enter detected history; extraction/monitor contracts pin eligibility. | Live DOM validation. |
| F-07 | Category/search/sort occur before 25-per-page pagination; popup state tests cover filtered pages and visible ranges. | None in repository tests. |
| F-08 | Shared merge preserves complete historical text while refreshing newer observations/metrics; coordinator/export tests pass. | None in repository tests. |
| F-09 | Keyed row updates preserve focused controls/selection and narrow live-region announcements; renderer/popup/axe tests pass. | Real screen-reader review. |
| F-10 | LinkedIn-only canonical permalink/profile parsing rejects lookalike/external hosts and unsafe links. | None in repository tests. |
| F-11 | Recalibrated signal combinations and labeled corpus preserve title/contact/weak-regional invariants. | Larger representative multilingual corpus remains useful. |
| F-12 | Dirty/new-root processing, fingerprint cache, 25-card batches, trailing scans, and a 1,000-root no-reclassification test are implemented. | Visible/hidden long-feed Chrome profiling is `NOT RUN`. |
| F-13 | Only the selected target issues commands; storage events do not rewrite another tab’s filter/expansion state; coordinated deltas avoid unrelated rewrites. | Real multi-window behavior. |
| F-14 | Single-flight refresh, target/command generations, stale-response guards, and pending-command idempotence tests pass. | Real browser timing verification. |
| F-15 | Consolidated readable/contrast/focus/reduced-motion/RTL/reflow CSS and roving keyboard tabs pass static/DOM/axe checks. | Real screen-reader, zoom, color, and popup-focus review is `NOT RUN`. |
| F-16 | Typed local errors, honest storage/history states, terminal async catches, and visible preference/read failures are covered by coordinator/export/popup tests. | Browser API failure injection. |
| F-17 | Expansion keeps manual resume; UI/README explicitly disclose that scrolling remains paused until the user resumes. Scroller/expansion tests cover the interaction. | Actual click/focus behavior. |
| F-18 | `historyMode` is the shared status/preference contract; legacy `keepHistory` is migrated only for compatibility. | None in repository tests. |
| F-19 | Schema-v2 records/exports preserve confidence, extraction status, complete evidence/signals, provenance, and selected optional fields. | None in repository tests. |
| F-20 | Canonical LinkedIn URLs and collision-checkable URN/URL/text identities replace lossy identity handling; shared/extraction tests pass. | None in repository tests. |
| F-21 | Epoch seconds/ms and EN/FR/AR numeric, separator, compact metric, age, comments/reposts/views fixtures pass; unavailable values stay `null`. | Current live localized markup. |
| F-22 | Initialization/stop reconcile only extension-owned hidden attributes/style nodes; stale-artifact DOM tests pass. | Real reload/update/SPA scenario is implemented but locally `NOT RUN`. |
| F-23 | Shared feed parser, per-window revalidation, moved-tab window refresh/focus, closed-tab cleanup, and root query/hash tests pass. | Actual Chrome tab/window operations. |
| F-24 | MV3 manifest declares Chrome 110 and limits content scripts to LinkedIn root/feed routes. | Real Chrome floor and authenticated route validation. |
| F-25 | Shared primitives, coordinator, exporter, keyed renderer, local dictionaries, and consolidated CSS remove the audited drift points while retaining zero runtime dependencies. | Ongoing maintainability, not a one-time guarantee. |
| F-26 | Deterministic directory-wrapped unpacked and manifest-at-root store packagers have exact allowlists, fixed metadata, icons, and reproducibility tests. | Owner records final hashes and submits only after other gates. |

### Addition/workstream disposition

| Addition | Status and evidence | Remaining gate |
|---|---|---|
| A-01 | Locked Node/jsdom/axe/Puppeteer development harness, 102 local tests, corpus evaluation, six real-MV3 scenarios, and CI workflow are present. | Required CI/browser execution; no local Chrome pass is claimed. |
| A-02 | `PRIVACY.md`, store listing/privacy worksheets, permission/storage/export/deletion disclosures, and responsible-use limitations are present. | Hosted privacy URL and current human store/LinkedIn policy review. |
| A-03 | Deterministic branded 16/48/128 icons, changelog, contribution/support/security docs, and release checklist are present; Superpowers’ separate MIT development license is documented. | Owner root license, publisher artwork/screenshots, and publication decisions. |
| A-04 | Safe full details include text, author, age, evidence, metrics, extraction state, and validated original-post links; search/sort/category pagination includes showing X–Y of Z and provenance. | Real popup interaction/download validation. |
| A-05 | History/all-data controls, session mode, minimal sensitive-field defaults, combined byte usage, last successful save, and honest storage errors are implemented and tested. | Real Chrome storage/download validation. |
| A-06 | MV3 single-writer coordinator, shared schema/status names, canonical identity, target generations, and schema-v2 messages/exports are present. | Real MV3 activation/concurrency validation. |
| A-07 | Occurrence-aware classifier and 22-case labeled evaluation preserve local explainability and all negative invariants. | Larger reviewed corpus; no unrequested keyword/threshold feature was added. |
| A-08 | Sanitized collapsed/expanded/repost/EN/FR/AR DOM fixtures, selector-health counts, field coverage, and sanitized compatibility diagnostics are present. | Current authenticated LinkedIn layouts. |
| A-09 | Local EN/FR/AR dictionaries cover static and popup-owned dynamic text, Arabic RTL, onboarding, keyboard tabs, reduced motion, reflow, and focus preservation. | Real assistive-technology/zoom review. |
| A-10 | Non-empty unexported archive confirmation, session history, no silent persistence, and no auto-resume behavior are implemented; reload/SPA browser scenarios exist. | Actual reload/session recovery is locally `NOT RUN`. |
| A-11 | Explicit local diagnostic download includes extension/browser/protocol versions, selector/operation/error counts, and scan timings while stripping content, emails, URLs, and free-form messages. | Real diagnostic download event. |
| A-12 | Adaptive Standard/Fast/Super Fast naming and localized responsible-use first-run onboarding explain target, background throttling, local history/exports, and stopping/cleanup. | Owner policy wording review. |

### Release boundary

All repository-actionable items in the approved plan have implementation and regression coverage. That statement is deliberately narrower than “public release approved.” The exact blockers and owner actions are maintained in `docs/store/release-checklist.md`: real Chrome, authenticated LinkedIn, assistive-technology/live performance checks, root license, publisher/privacy URL, current policy review, and actual store approval. No license, screenshot, live-site result, or approval has been fabricated.
