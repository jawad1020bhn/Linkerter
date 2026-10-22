# Linkerter Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every repository-actionable fix and addition in the approved full-extension audit and produce a verified v2.0.0 release candidate.

**Architecture:** A shared zero-dependency primitive layer and a small MV3 service worker establish canonical records and single-writer session/persistent history. Content scripts retain feed-local scrolling/monitoring, while focused popup modules handle localized accessible rendering, result workflows, and safe exports. Node/DOM/integration/browser tests and deterministic packaging gate each stage.

**Tech Stack:** Manifest V3, plain JavaScript/HTML/CSS, Chrome storage/session/runtime/tabs APIs, Node 22 `node:test`, jsdom, axe-core, puppeteer-core with system Chrome, Bash/Python packaging, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-21-full-remediation-design.md`
**Audit:** `docs/audits/2026-10-21-full-extension-audit.md`

## Global Constraints

- Manifest V3; `minimum_chrome_version` is `"110"`; extension/README version becomes `2.0.0`.
- Zero runtime dependencies and zero extension-owned external service requests.
- Never automate LinkedIn social-graph engagement; only documented scrolling and post-body expansion are permitted.
- Job titles, contact details, or weak regional cues alone never create a hiring detection.
- Content-script order remains rules → classifier → monitor → scroll controller; `linkedin-shared.js` may load first.
- Existing storage migrates lazily and idempotently without silently discarding readable records.
- All new behavior uses strict RED → GREEN → REFACTOR; no implementation is claimed complete without fresh verification.
- Work and commits remain on `arena/c284f01b-linkerter`.

## Review Focus

1. **Multilingual occurrence polarity:** negated, repeated, and mixed-clause EN/FR/AR text must not become false positive openings; Task 2 pins exact cases.
2. **Concurrent storage lifecycle:** parallel writes, mode changes, and clear operations must not lose/resurrect records; Task 3 uses barriers and fake clocks.
3. **Hostile/untrusted input:** formulas, malformed URLs, comments controls, ambiguous metrics, and stale DOM must remain safe; Tasks 1, 4, and 7 pin payloads.
4. **Asynchronous UI stability:** delayed responses and repeated identical statuses must not overwrite new commands or destroy focus; Task 8 controls Promise completion order.
5. **Migration/reload/release boundaries:** v1.9.0 data, session reloads, extension reload artifacts, and two ZIP layouts must survive predictably; Tasks 3, 6, 10, and 11 verify them.

## File Structure

- **Shared/coordinator:** `linkedin-shared.js`, `background.js`, `manifest.json`.
- **Feed runtime:** `linkedin-hiring-rules.js`, `linkedin-hiring-classifier.js`, `linkedin-hiring-monitor.js`, `content.js`.
- **Popup:** `popup.js`, `popup-export.js`, `popup-results.js`, `popup-i18n.js`, `popup.html`, `popup.css`.
- **Tests:** `tests/unit/`, `tests/dom/`, `tests/integration/`, `tests/browser/`, `tests/fixtures/`.
- **Release:** `scripts/`, `.github/workflows/ci.yml`, `icons/`, `docs/store/`, root policy/support documents.

---

### Task 1: Shared primitives, test harness, and safe record/export foundations

**Files:**
- Create: `package.json`, `package-lock.json`, `tests/helpers/`, `tests/unit/shared.test.js`, `linkedin-shared.js`
- Modify: `.gitignore`, `AGENTS.md`, `CLAUDE.md` only where runtime file inventory changes
- Test: `tests/unit/shared.test.js`

**Interfaces:**
- Produces global `__LI_FEED_SHARED__` with `SCHEMA_VERSION`, `DEFAULT_SETTINGS`, `DEFAULT_HIRING_PREFS`, `sanitizeSettings()`, `parseLinkedInUrl()`, `canonicalizeLinkedInUrl()`, `canonicalPostId()`, `mergePostRecords()`, `pruneHistory()`, `csvCell()`, and `LinkerterError` codes.
- `pruneHistory(records, { enabled, retentionDays, now, maxRecords = 500, maxBytes = 3_000_000 })` returns `{ records, truncated, bytes }`.
- `mergePostRecords(previous, next)` preserves complete text/best metadata while refreshing observation/classification fields.
- Consumes no earlier task.

- [ ] **Step 1: Add failing shared-primitive tests and development-only test scaffolding**

Pin formula prefixes/leading controls, URL hostname confusion, canonical tracking URLs, hash-collision-safe fallback identity, complete-vs-partial merge, enabled/disabled retention, exact cutoffs, invalid/future timestamps, v1 settings migration, and UTF-8 byte caps. Add `node:test` scripts and pinned jsdom/axe/puppeteer development dependencies without runtime dependencies.

- [ ] **Step 2: Run the shared tests and verify RED**

Run: `npm test -- --test-name-pattern="shared|retention|CSV|canonical|merge"`
Expected: FAIL because `linkedin-shared.js` and its exported primitives do not exist.

- [ ] **Step 3: Implement the tested primitives**

Keep pure functions usable from Node, popup, content scripts, and a classic MV3 service worker through `globalThis.__LI_FEED_SHARED__`. `csvCell()` distinguishes trusted numbers from untrusted strings; URL helpers parse `URL.hostname`/`pathname`; fallback identity retains a canonical comparison key rather than only a 32-bit digest.

- [ ] **Step 4: Run shared tests and syntax verification**

Run: `npm test -- --test-name-pattern="shared|retention|CSV|canonical|merge" && node --check linkedin-shared.js`
Expected: all selected tests PASS and syntax exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json linkedin-shared.js tests .gitignore AGENTS.md CLAUDE.md
git commit -m "test: add shared remediation primitives"
```

**Audit coverage:** F-02, F-04, F-08, F-10, F-18, F-20, F-25; A-01, A-05, A-06.

---

### Task 2: Occurrence-aware calibrated classifier and labeled corpus

**Files:**
- Modify: `linkedin-hiring-classifier.js`, `linkedin-hiring-rules.js`, `manifest.json` to load shared primitives first
- Create: `tests/unit/classifier.test.js`, `tests/fixtures/classifier/*.json`, `scripts/evaluate-classifier.js`
- Test: `tests/unit/classifier.test.js`, `tests/integration/classifier-corpus.test.js`

**Interfaces:**
- Consumes shared category/error constants where useful.
- Produces `classify(text, { hrefs })` with existing category fields plus complete `signals`, occurrence-aware `evidence`, and no extraction-status overloading.
- Produces corpus report `{ total, correct, byCategory, confusion }` without network access.

- [ ] **Step 1: Write failing polarity/calibration/invariant tests**

Pin every F-01/F-11 audit example, including `We are not currently hiring for any roles.`, `No longer recruiting for this role.`, independent later positive clauses, `We are hiring!` → `open_role`, `Looking for candidates.` → `recruiter_search`, and credit-card CTA → `none`. Add EN/FR/AR accented/diacritic, repeated occurrence, email/title/regional-alone, and hashtag cases.

- [ ] **Step 2: Run classifier tests and corpus evaluation to verify RED**

Run: `node --test tests/unit/classifier.test.js tests/integration/classifier-corpus.test.js`
Expected: FAIL on negation, mixed clauses, and calibration cases.

- [ ] **Step 3: Implement precompiled occurrence matchers and polarity**

Compile normalized rules once; return all match offsets; evaluate negation per occurrence/clause; require unnegated positive signals in every positive branch; expand negative fixtures; export every contributing signal group. Do not add occupation-title keywords.

- [ ] **Step 4: Run classifier, corpus, and baseline invariants**

Run: `node --test tests/unit/classifier.test.js tests/integration/classifier-corpus.test.js && node scripts/evaluate-classifier.js`
Expected: tests PASS, report contains no regression fixture failures, and all three standalone-signal invariants remain `none`.

- [ ] **Step 5: Commit**

```bash
git add linkedin-hiring-classifier.js linkedin-hiring-rules.js manifest.json tests scripts/evaluate-classifier.js
git commit -m "fix: correct multilingual hiring polarity"
```

**Audit coverage:** F-01, F-11, F-19, F-25; A-01, A-07.

---

### Task 3: Single-writer session/persistent history coordinator

**Files:**
- Create: `background.js`, `tests/integration/history-coordinator.test.js`, `tests/unit/history-migration.test.js`
- Modify: `manifest.json`, `linkedin-shared.js`, `tests/helpers/chrome-mock.js`
- Test: `tests/integration/history-coordinator.test.js`

**Interfaces:**
- Handles `HISTORY_GET`, `HISTORY_APPEND { records }`, `HISTORY_CLEAR { scope }`, `HISTORY_STATUS`, and `LOCAL_DATA_CLEAR { scopes }`.
- Returns `{ ok, records?, store?, count?, bytes?, limitReached?, error? }`; errors use shared typed codes.
- Uses persistent key `hiringPostHistory`, session key `hiringSessionPostHistory`, and `hiringPreferences.historyMode`.
- Consumes Task 1 merge/retention primitives and Task 2-independent storage mocks.

- [ ] **Step 1: Write failing coordinator and v1 migration tests**

Use a Promise barrier to force two tabs to append A+B concurrently; pin no lost updates, same-ID complete merging, 500/3 MB limits, fake-clock retention, off/session/persistent behavior, combined-store reads with provenance, clear scopes, and queued append-after-clear rejection while mode is off. Verify old `keepHistory` migration is idempotent.

- [ ] **Step 2: Run coordinator tests to verify RED**

Run: `node --test tests/integration/history-coordinator.test.js tests/unit/history-migration.test.js`
Expected: FAIL because the coordinator/messages are absent and current writes are unsafe.

- [ ] **Step 3: Implement the MV3 single-writer queue and storage migration**

Serialize operations inside `background.js`; check mode before writes; prune before reads/exports and before persistence; never copy stores on mode changes; return accepted/error counts. Register the service worker and session storage without adding unnecessary permissions.

- [ ] **Step 4: Stress and verify coordinator behavior**

Run: `node --test tests/integration/history-coordinator.test.js tests/unit/history-migration.test.js`
Expected: all tests PASS, including repeated concurrent A+B and clear/mode-change interleavings.

- [ ] **Step 5: Commit**

```bash
git add background.js manifest.json linkedin-shared.js tests
git commit -m "fix: coordinate history across LinkedIn tabs"
```

**Audit coverage:** F-03, F-04, F-08, F-13, F-16, F-18; A-05, A-06, A-10.

---

### Task 4: Safe DOM extraction, identity, metrics, and scoped expansion

**Files:**
- Modify: `linkedin-hiring-monitor.js`
- Create: `tests/dom/monitor-extraction.test.js`, `tests/dom/expansion.test.js`, `tests/fixtures/dom/*.html`
- Test: `tests/dom/monitor-extraction.test.js`, `tests/dom/expansion.test.js`

**Interfaces:**
- Retains classifier input `{ text, hrefs }`; emits schema-v2 records with `extractionStatus`, canonical permalink/author, complete metadata, and compatible `contentComplete`.
- Produces pure/testable extraction helpers for body controls, age/metrics, identity, and expansion outcome.

- [ ] **Step 1: Add failing sanitized DOM fixtures**

Cover “See more comments,” localized body controls, collapsed/expanded text, nested reposts, external lookalike URLs, tracking permalinks, epoch seconds/ms, EN/FR/AR compact metrics, missing selectors, and stale hidden attributes.

- [ ] **Step 2: Run extraction/expansion tests to verify RED**

Run: `node --test tests/dom/monitor-extraction.test.js tests/dom/expansion.test.js`
Expected: FAIL on comment-control selection, external hosts, timestamps, and stale-state fixtures.

- [ ] **Step 3: Implement scoped extraction and bounded expansion**

Select the body first and controls only within it; reject unrelated labels; observe success and bound retries. Canonicalize identity, parse numeric epochs explicitly, keep unavailable metrics `null`, and reconcile extension-owned stale filter artifacts on initialization/stop.

- [ ] **Step 4: Run DOM and classifier regression suites**

Run: `node --test tests/dom/monitor-extraction.test.js tests/dom/expansion.test.js tests/unit/classifier.test.js`
Expected: all PASS with no classifier invariant regression.

- [ ] **Step 5: Commit**

```bash
git add linkedin-hiring-monitor.js tests/dom tests/fixtures/dom
git commit -m "fix: harden feed extraction and expansion"
```

**Audit coverage:** F-05, F-06, F-10, F-20, F-21, F-22; A-01, A-08.

---

### Task 5: Incremental monitor, queryable results, and schema-v2 status

**Files:**
- Modify: `linkedin-hiring-monitor.js`, `manifest.json`
- Create: `tests/dom/monitor-scan.test.js`, `tests/integration/monitor-contract.test.js`
- Test: `tests/dom/monitor-scan.test.js`, `tests/integration/monitor-contract.test.js`

**Interfaces:**
- `GET_HIRING_STATUS { query?: { filter, search, sort, page, pageSize } }` returns page metadata and `historyMode` (not the old mismatched property).
- `GET_HIRING_POST { id }` returns one full canonical record.
- Monitor-to-coordinator batches contain only pending delta records; per-tab filter/auto-expand state changes only through explicit messages.

- [ ] **Step 1: Write failing result, scheduling, and delta tests**

Use 30 older seekers + 50 newer openings, category/search-before-pagination, newest/oldest ordering, `total/page/hasMore`, unchanged-content cache hits, sustained mutation/scroll events with guaranteed trailing scans, dirty-root batching, per-tab preferences, and no partial-only archive.

- [ ] **Step 2: Run monitor tests to verify RED**

Run: `node --test tests/dom/monitor-scan.test.js tests/integration/monitor-contract.test.js`
Expected: FAIL on truncation, repeated classification, partial-only records, and status naming.

- [ ] **Step 3: Implement cached/batched scanning and the result contract**

Fingerprint content/hrefs, process dirty roots in bounded batches, yield between batches, use non-starving throttle/debounce behavior, query before pagination, and flush delta saves on stop. Keep foreground near-viewport and hidden-tab behavior explicit.

- [ ] **Step 4: Run monitor and coordinator integration tests**

Run: `node --test tests/dom/*.test.js tests/integration/monitor-contract.test.js tests/integration/history-coordinator.test.js`
Expected: all PASS; synthetic 1,000-root workload performs no unchanged reclassification and completes within the test’s operation-count budget.

- [ ] **Step 5: Commit**

```bash
git add linkedin-hiring-monitor.js manifest.json tests/dom tests/integration
git commit -m "fix: scale monitoring and paginate results"
```

**Audit coverage:** F-06, F-07, F-12, F-13, F-18, F-19; A-04, A-06, A-08.

---

### Task 6: Scroll safeguards, route scope, and reload-safe behavior

**Files:**
- Modify: `content.js`, `manifest.json`, `README.md`
- Create: `tests/dom/scroller.test.js`, `tests/integration/manifest-contract.test.js`
- Test: `tests/dom/scroller.test.js`, `tests/integration/manifest-contract.test.js`

**Interfaces:**
- Preserves `START`, `PAUSE`, `RESUME`, `STOP`, `GET_STATUS` responses and sanitized settings.
- Uses shared feed URL/settings helpers; expansion pause reason explicitly requires manual resume.

- [ ] **Step 1: Write failing scroller/manifest tests**

Use fake timers/frames for all modes, caps, pause accounting, hidden-tab fallback, no movement, disconnected targets, input events, expansion pause/manual resume, and root/feed query/hash route matching. Assert unsupported routes do not inject scripts and no auto-resume occurs after reload/restart.

- [ ] **Step 2: Run scroller tests to verify RED**

Run: `node --test tests/dom/scroller.test.js tests/integration/manifest-contract.test.js`
Expected: FAIL on new shared protocol/route expectations and any inaccurate expansion semantics.

- [ ] **Step 3: Implement minimal scroller and manifest changes**

Preserve adaptive timing algorithms unless a test identifies a defect; update comments/copy, use shared settings/URL logic, declare Chrome 110/version 2.0.0, and narrow content scripts to root/feed routes without breaking remembered-tab URL access.

- [ ] **Step 4: Run scroller and manifest verification**

Run: `node --test tests/dom/scroller.test.js tests/integration/manifest-contract.test.js && bash scripts/verify-superpowers.sh`
Expected: all PASS and manifest content order remains valid.

- [ ] **Step 5: Commit**

```bash
git add content.js manifest.json README.md tests scripts/verify-superpowers.sh
git commit -m "fix: align scrolling safeguards and route scope"
```

**Audit coverage:** F-17, F-23, F-24; A-01, A-10, A-12.

---

### Task 7: Safe exports, complete data controls, and diagnostics

**Files:**
- Create: `popup-export.js`, `tests/unit/popup-export.test.js`, `tests/integration/export-coordinator.test.js`
- Modify: `popup.js`, `popup.html`, `background.js`, `scripts/package-extension.sh`
- Test: `tests/unit/popup-export.test.js`, `tests/integration/export-coordinator.test.js`

**Interfaces:**
- Produces `projectPost()`, `buildJsonPayload()`, `buildCsv()`, `mergeExportSources()`, and `downloadDiagnostic()` through `__LI_FEED_EXPORT__`.
- Consumes shared CSV/merge primitives, coordinator reads, and schema-v2 current records.

- [ ] **Step 1: Write failing export/privacy/diagnostic tests**

Pin all formula variants, multiline Unicode CSV, JSON v1/v2 migration, complete-history preservation, retention before export, sensitive-field defaults, selected fields/categories, clear scopes, storage errors, and diagnostic absence of post text/emails/post/profile/tab URLs.

- [ ] **Step 2: Run export tests to verify RED**

Run: `node --test tests/unit/popup-export.test.js tests/integration/export-coordinator.test.js`
Expected: FAIL on current CSV and merge behavior and missing diagnostic/data-control APIs.

- [ ] **Step 3: Implement safe schema-v2 exports and explicit controls**

Use shared safe encoding, field-aware merges, minimal fresh-install defaults, confirmed clear scopes/all-data deletion, and sanitized diagnostic JSON. Keep downloads explicit and revoke object URLs after initiation.

- [ ] **Step 4: Run export/coordinator/security regression tests**

Run: `node --test tests/unit/popup-export.test.js tests/integration/export-coordinator.test.js tests/integration/history-coordinator.test.js`
Expected: all PASS; no tested formula remains unescaped and no forbidden diagnostic field appears.

- [ ] **Step 5: Commit**

```bash
git add popup-export.js popup.js popup.html background.js scripts/package-extension.sh tests
git commit -m "fix: secure exports and local data controls"
```

**Audit coverage:** F-02, F-04, F-08, F-16, F-19; A-05, A-10, A-11.

---

### Task 8: Stable popup state, target lifecycle, and actionable results

**Files:**
- Create: `popup-results.js`, `tests/dom/popup-results.test.js`, `tests/dom/popup-state.test.js`
- Modify: `popup.js`, `popup.html`, `scripts/package-extension.sh`
- Test: `tests/dom/popup-results.test.js`, `tests/dom/popup-state.test.js`

**Interfaces:**
- `__LI_FEED_RESULTS__` provides keyed `renderResults()` and detail-row creation without unsafe HTML.
- Popup scheduler exposes single-flight `refreshAll()` and target/request generations; monitor query contract comes from Task 5.

- [ ] **Step 1: Write failing asynchronous and focus tests**

Control deferred Promises to resolve old target/status after new commands; verify stale responses are ignored. Focus a review select/search/page control, render identical/changed statuses, and assert connected focused nodes survive. Add moved windows, closed tabs, root query/hash, search/sort/page, detail loading, original-post opening, and non-empty archive restart confirmation.

- [ ] **Step 2: Run popup tests to verify RED**

Run: `node --test tests/dom/popup-results.test.js tests/dom/popup-state.test.js`
Expected: FAIL on current replace-all rendering and stale response paths.

- [ ] **Step 3: Implement keyed rendering and guarded state ownership**

Patch only changed rows/fields, preserve focus/selection, announce meaningful transitions, validate tab/window/feed identity, add result actions/pagination/details, and make commands idempotent while pending. Do not auto-resume monitoring/scrolling after recovery.

- [ ] **Step 4: Run popup and monitor contract suites**

Run: `node --test tests/dom/popup-*.test.js tests/integration/monitor-contract.test.js`
Expected: all PASS, including out-of-order responses and repeated-status focus tests.

- [ ] **Step 5: Commit**

```bash
git add popup-results.js popup.js popup.html scripts/package-extension.sh tests
git commit -m "fix: stabilize popup state and results"
```

**Audit coverage:** F-07, F-09, F-14, F-16, F-18, F-23; A-04, A-06, A-10.

---

### Task 9: Accessible localized Adaptive UI and onboarding

**Files:**
- Create: `popup-i18n.js`, `tests/dom/accessibility.test.js`, `tests/dom/i18n.test.js`, `docs/store/screenshots/` (browser captures only)
- Modify: `popup.html`, `popup.css`, `popup.js`, `popup-results.js`, `README.md`, `manifest.json`, `scripts/package-extension.sh`
- Test: `tests/dom/accessibility.test.js`, `tests/dom/i18n.test.js`

**Interfaces:**
- `__LI_FEED_I18N__` provides `t(key, substitutions)`, `applyLocale()`, and `locale/direction`; EN is fallback and AR sets RTL.
- Consumes no network/font service and preserves all existing control IDs used by tests.

- [ ] **Step 1: Add failing accessibility/localization tests**

Pin contrast token ratios, readable type floors, roving tabindex/arrow/Home/End behavior, focus-visible controls, zoom/reflow smoke checks, reduced nonessential motion, EN/FR/AR key parity, fallback, RTL, Adaptive naming, and onboarding dismissal persistence.

- [ ] **Step 2: Run accessibility/i18n tests to verify RED**

Run: `node --test tests/dom/accessibility.test.js tests/dom/i18n.test.js`
Expected: FAIL on current contrast/type/tab behavior and missing dictionaries.

- [ ] **Step 3: Implement semantic localized UI and consolidate CSS**

Translate static and dynamic strings, add RTL/logical layout rules, remove duplicate/dead CSS layers, implement the tab keyboard pattern, limit live-region announcements, rename Human-like labels, and add concise responsible-use onboarding.

- [ ] **Step 4: Run DOM accessibility and axe/browser checks where available**

Run: `node --test tests/dom/accessibility.test.js tests/dom/i18n.test.js tests/dom/popup-*.test.js`
Expected: all executable tests PASS; browser-only screen-reader/live-store checks remain explicitly listed, not skipped as passes.

- [ ] **Step 5: Commit**

```bash
git add popup-i18n.js popup.html popup.css popup.js popup-results.js README.md manifest.json scripts tests docs/store
git commit -m "feat: add accessible multilingual popup"
```

**Audit coverage:** F-09, F-15, F-17, F-25; A-09, A-12.

---

### Task 10: Real MV3 browser integration and sanitized fixtures

**Files:**
- Create: `tests/browser/run.cjs`, `tests/browser/fixture-server.cjs`, `tests/browser/extension.test.cjs`, `tests/fixtures/README.md`, `scripts/test-browser.sh`
- Modify: `package.json`, `README.md`
- Test: `tests/browser/extension.test.cjs`

**Interfaces:**
- `CHROME_PATH` selects system Chrome; no credentials or live LinkedIn data are required.
- Local sanitized HTTPS feed fixtures exercise actual content-script matching; actual extension pages exercise service-worker storage and popup downloads.

- [ ] **Step 1: Add failing actual-extension smoke tests**

Specify extension load, worker activation, root/feed injection, popup initialization, two-tab concurrent history, real local/session storage, session reload recovery without auto-resume, download events, keyboard popup flow, and sanitized screenshot capture.

- [ ] **Step 2: Run browser harness to establish environment/RED**

Run: `bash scripts/test-browser.sh`
Expected: FAIL on unimplemented behavior; if Chrome is genuinely unavailable, report `NOT RUN — Chrome unavailable` and keep this as an open release gate rather than a pass.

- [ ] **Step 3: Implement only behavior proven broken by the browser run**

Use systematic root-cause tracing and Task-specific regression tests before changes. Do not tune waits to hide timing failures; wait on browser conditions.

- [ ] **Step 4: Repeat browser suite and capture evidence**

Run: `bash scripts/test-browser.sh`
Expected: PASS when Chrome is available; otherwise document the exact blocker and retain CI execution.

- [ ] **Step 5: Commit**

```bash
git add tests/browser tests/fixtures scripts/test-browser.sh package.json README.md docs/store/screenshots
# Include a production fix only when its regression evidence is in this task.
git commit -m "test: add MV3 browser integration coverage"
```

**Audit coverage:** A-01, A-08; live-browser verification for F-03, F-05, F-07, F-09, F-12, F-17, F-22, F-23.

---

### Task 11: Privacy, release assets, deterministic packages, CI, and final audit

**Files:**
- Create: `PRIVACY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`, `docs/store/*`, `icons/*`, `.github/workflows/ci.yml`, `tests/integration/package.test.js`
- Modify: `README.md`, `scripts/package-extension.sh`, `scripts/verify-superpowers.sh`, `.gitignore`, `docs/audits/2026-10-21-full-extension-audit.md` with remediation status appendix
- Test: `tests/integration/package.test.js`

**Interfaces:**
- `bash scripts/package-extension.sh --unpacked <path>` creates the documented directory-wrapped archive.
- `bash scripts/package-extension.sh --store <path>` creates a manifest-at-root archive.
- Both modes include every runtime/icon reference and use sorted entries, fixed timestamps/permissions, and no development files.

- [ ] **Step 1: Add failing package/release tests and truthful documentation checks**

Pin exact runtime allowlist, root vs. wrapped manifest layout, icon existence/dimensions, deterministic hashes across different source mtimes, no audit/test/superpowers content, version consistency, privacy/storage-mode claims, and CI commands.

- [ ] **Step 2: Run package/release tests to verify RED**

Run: `node --test tests/integration/package.test.js`
Expected: FAIL on missing assets/documents and nondeterministic/store-layout behavior.

- [ ] **Step 3: Implement release artifacts and documentation**

Generate simple branded PNG icons locally; add accurate privacy/support/security/contribution/changelog/store documents and captured browser screenshots where Task 10 produced them. Add CI and reproducible packagers. Record owner-only license/publisher/policy/live-site gates explicitly; do not invent a license or approval.

- [ ] **Step 4: Perform whole-branch verification and fresh-eyes review**

Run:

```bash
npm ci
npm test
bash scripts/verify-superpowers.sh
bash scripts/test-browser.sh
node --test tests/integration/package.test.js
bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked-a.zip
bash scripts/package-extension.sh --store /tmp/linkerter-store-a.zip
bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked-b.zip
bash scripts/package-extension.sh --store /tmp/linkerter-store-b.zip
cmp /tmp/linkerter-unpacked-a.zip /tmp/linkerter-unpacked-b.zip
cmp /tmp/linkerter-store-a.zip /tmp/linkerter-store-b.zip
git diff --check
```

Expected: every executable command exits 0 and archives match byte-for-byte. Any unavailable browser/live check is reported `NOT RUN`, never “passed.” Review all 26 F-items and 12 A-items against code/tests; resolve gaps before status claims.

- [ ] **Step 5: Commit**

```bash
git add README.md PRIVACY.md CHANGELOG.md CONTRIBUTING.md SUPPORT.md SECURITY.md docs icons scripts .github .gitignore tests package.json package-lock.json
git commit -m "chore: prepare verified v2 release candidate"
```

**Audit coverage:** F-24, F-25, F-26; A-01, A-02, A-03, A-08, A-11; final coverage check for every F/A item.

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–11 map all F-01–F-26 and A-01–A-12. Owner-only license/publisher/policy/authenticated-site approvals are intentionally external gates under the spec’s completion definition.
- **Step scan:** Every task begins with a failing test, requires RED evidence, implements a bounded deliverable, runs GREEN verification, and commits independently.
- **Type consistency:** `historyMode`, `extractionStatus`, schema `2.0`, coordinator message names, monitor query/page metadata, and shared globals are consistent across producer/consumer tasks.
- **Review focus:** All five high-risk input classes have owning tasks and concrete tests.
- **Proportion:** The plan fixes interfaces, files, exact regression cases, and commands while leaving ordinary function bodies to the implementer.
