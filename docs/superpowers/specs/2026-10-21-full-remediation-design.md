# Linkerter Full Remediation Design

**Date:** 2026-10-21
**Source audit:** `docs/audits/2026-10-21-full-extension-audit.md`
**Requested scope:** Apply all audit fixes and additions that can be implemented and verified in the repository.

## 1. Intent

Turn Linkerter v1.9.0 into a tested, privacy-preserving, accessible, release-candidate Manifest V3 extension. Preserve the local explainable classifier and user-controlled adaptive scrolling while correcting the audited classifier, CSV, history, retention, monitor, export, popup, accessibility, packaging, and documentation failures.

The user approved the audit scope by saying “apply them all.” Choices marked **builder’s call** below are implementation decisions made under that approval; they are not claims that the user separately selected each option.

## 2. Goals

- Resolve F-01 through F-26 with regression coverage.
- Implement A-01 through A-12 wherever they produce repository artifacts or testable software.
- Keep all post processing on the user’s device and all runtime dependencies at zero.
- Make history deterministic across concurrent LinkedIn tabs and clear/disable operations.
- Make exports safe, lossless where selected, schema-versioned, and honest about completeness.
- Make the popup keyboard-accessible, readable, localized, and stable during background refreshes.
- Produce reproducible unpacked and store-layout archives plus privacy/store/release documentation.

## 3. Non-goals and anti-goals

- No external AI, analytics, telemetry, remote code, or required network service.
- No liking, posting comments, connecting, messaging, or other social-graph engagement.
- No semantic/LLM classifier and no weakening of the rule that job titles, contact details, or weak regional cues alone cannot create a hiring detection.
- No claim of stealth, platform evasion, legal compliance, Chrome Web Store approval, or LinkedIn policy approval.
- No fabricated authenticated-LinkedIn, screen-reader, spreadsheet-application, or store-review verification.
- No silent persistent-history opt-in or automatic scroll/monitor restoration after a browser restart.
- No runtime package manager, framework, bundled vendor code, or build step required to load the unpacked extension.

## 4. Global constraints

- Manifest V3; **minimum Chrome version 110** (**builder’s call**) to cover the Promise APIs, modern JavaScript, and `chrome.storage.session` used by the design.
- Plain JavaScript, HTML, CSS, JSON, Node’s built-in test runner, and development-only DOM/browser tooling.
- Runtime content-script order remains rules → classifier → monitor → scroll controller; shared primitives may load before the rules.
- All untrusted strings render through safe DOM APIs and all spreadsheet strings receive formula-safe encoding.
- Existing user settings, review labels, target mappings, and persistent history migrate without silently discarding readable data.
- Work remains on `arena/c284f01b-linkerter`; no additional branch or worktree is created in Arena.

## 5. Product decisions

### 5.1 Classifier and extraction

- Positive phrases are matched as occurrences with offsets. Negation applies per occurrence and clause; every positive category requires an unnegated positive signal.
- An unambiguous `activeOpening` phrase alone can produce `open_role`; an unambiguous `recruiterSearch` phrase alone can produce `recruiter_search`. A generic application CTA alone produces `none` (**builder’s call**, resolving F-11).
- Closed/negative phrases suppress only the relevant clause, not an independent later positive clause.
- Classifier confidence remains separate from extraction completeness. Schema v2 uses `extractionStatus: "complete" | "partial"` and retains `contentComplete` as a compatibility boolean.
- New `partial`-only records are not archived merely because text is truncated. A partial post is archived only when the classifier independently returns a non-`none` category. Legacy `partial` history remains readable.
- All classifier signal groups are exported; concise UI evidence may remain limited, but structured export evidence is complete.

### 5.2 Expansion and scrolling

- Only controls inside the selected post-body container are eligible for expansion. Comment, reply, reaction, and unrelated controls are rejected explicitly.
- Expansion success requires an observed body/control change; failed attempts receive bounded retry/backoff and never repeatedly click an unrelated control.
- Auto-expansion continues to pause a running scroller for safety, but the UI and comments state that scrolling remains paused until the user resumes (**builder’s call**, avoiding unsafe automatic resume races).
- “Human-like” labels become “Adaptive Standard/Fast/Super Fast.” Guardrails and timing behavior remain user-controlled and are not presented as stealth.

### 5.3 History ownership and retention

- Add a small MV3 service worker as the **single history coordinator**. Content scripts request merges; they never directly rewrite the stored history array.
- The coordinator serializes read-merge-write operations, enforces retention and byte/record limits, and checks history mode before every save.
- History mode becomes `off | session | persistent`; the default is `off`. Existing `keepHistory: true` migrates to `persistent`, and false/missing migrates to `off` (**builder’s call**).
- `session` uses `chrome.storage.session`; `persistent` uses `chrome.storage.local`. Session data lasts only for the browser session and is never copied to persistent storage without an explicit mode change by the user.
- Changing mode moves no old data silently. The UI explains where records remain and offers explicit clear/copy-export actions. Reads/exports combine session and persistent records with a `historyStore` provenance field and canonical-ID merge; the mode controls only where **new** saves go. While session mode is active, old persistent records follow disabled-history retention semantics, and vice versa.
- “Clear saved history” clears the active store after confirmation; “Clear all local data” clears both stores and the other selected scopes.
- Monitors maintain a delta queue and send only new/changed records (plus bounded last-seen refreshes), not the full archive on every save. Each coordinator batch contains canonical records and returns accepted/error counts; stopping a monitor flushes its pending delta.
- Persistent retention applies when persistent history is enabled and before persistent history is displayed, merged, or exported. Disabled history retains old records until cleared, matching the current documented behavior. Session records are bounded by the selected age/count/byte rules during the active session.
- Clear history sets mode off through the coordinator before deleting the selected store, so queued writes cannot recreate cleared data while history remains off.
- Record merges preserve complete text and best-available metadata while independently updating last-seen, classification, and fresh metrics.

### 5.4 Preferences and target ownership

- Export preferences, locale, onboarding state, and history mode/retention are global.
- Filter, matches-only, and auto-expand values are global defaults for new runs but per-tab runtime state after an explicit command. Storage events do not unexpectedly rewrite another tab’s active feed filter.
- Target mappings remain per-window. Remembered targets are revalidated for tab ID, current window, and feed URL before use. One URL parser defines feed support everywhere.
- Popup refreshes are single-flight and generation-guarded; old responses cannot overwrite a newer target or command.

### 5.5 Results and exports

- Status filtering/search occurs before pagination. The default page size is 25, with `total`, `page`, `pageSize`, and `hasMore` metadata (**builder’s call**).
- Results expose validated permalinks and basic author metadata. A detail action retrieves one full record on demand rather than sending every full text on every poll.
- The popup supports category filter, text search, newest/oldest sorting, pagination, original-post opening, and a full-detail view.
- Rendering is keyed by canonical post ID. Unchanged rows and focused controls are not replaced.
- JSON schema becomes **2.0**. CSV remains a presentation export and uses safe string cells, UTF-8 BOM, CRLF, and the selected fields/category.
- Fresh installs default full-text and email export fields to **off**; other existing non-sensitive field defaults remain as documented. Existing stored field preferences are preserved (**builder’s call**).
- Canonical LinkedIn identity validates HTTPS hostname/path, removes fragments and known tracking parameters, and avoids relying solely on a 32-bit hash for fallback identity.

### 5.6 Accessibility and localization

- Normal text meets 4.5:1 contrast; default body/supporting text is readable without relying on 7–10 px type.
- Tabs implement roving tabindex, Left/Right/Home/End behavior, and correct selected/focused states.
- Result updates preserve focus and only meaningful transitions enter live regions.
- English, French, and Arabic UI dictionaries ship locally with English fallback. Arabic applies `dir="rtl"` and logical layout adjustments.
- Keyboard, zoom/reflow, reduced nonessential motion, and screen-reader smoke checks are included in release verification.

### 5.7 Diagnostics and recovery

- Starting a new run with a non-empty unexported current archive requires confirmation and offers export first.
- Optional session history survives a page reload through the session coordinator; no scrolling or monitoring auto-resumes after reload/restart.
- Users can clear post history, review labels, target mappings, settings, or all local data with explicit scopes.
- A user-initiated diagnostic JSON export includes versions, error categories, selector-health counts, and timing data, but excludes post text, emails, profile/post URLs, and tab URLs.

## 6. Architecture and file boundaries

### Shared/runtime

- `linkedin-shared.js`: constants, category/status schemas, settings migration, URL parsing/canonical identity, record merge/retention primitives, CSV encoding, and error codes. Loaded where needed before other runtime files.
- `background.js`: MV3 coordinator for session/persistent history, retention, clear operations, storage usage, and sanitized diagnostics. It does not scroll or scan LinkedIn.
- `linkedin-hiring-rules.js`: multilingual signal dictionaries only.
- `linkedin-hiring-classifier.js`: precompiled occurrence matchers, polarity, scoring, and complete explainable signals.
- `linkedin-hiring-monitor.js`: DOM extraction, scoped expansion, incremental scanning, per-tab monitor state, result queries, and coordinator client calls.
- `content.js`: adaptive scrolling and explicit pause/resume behavior.

### Popup

- `popup-i18n.js`: local EN/FR/AR dictionaries, translation lookup, direction, and static text application.
- `popup-export.js`: schema v2 projection, safe JSON/CSV/diagnostic downloads, and field-aware current/history merge.
- `popup-results.js`: keyed result rows, details, search/sort/page controls, and focus-preserving updates.
- `popup.js`: settings, target ownership, single-flight messaging, commands, preferences, onboarding, and initialization.
- `popup.html` / `popup.css`: semantic controls, accessible tokens/layout, RTL rules, and no duplicate reset layers.

### Tests and release

- `package.json` / lockfile: development-only test commands and pinned DOM/browser tooling; no runtime dependencies.
- `tests/unit`, `tests/dom`, `tests/integration`, `tests/browser`, `tests/fixtures`: classifier, primitives, coordinator, extraction, popup, scrolling, packaging, and optional live-browser coverage.
- `.github/workflows/ci.yml`: locked install, syntax, unit/DOM/integration tests, verifier, and package reproducibility.
- `icons/`: generated local PNG application icons.
- `docs/store/`: listing, screenshot guidance/captured assets, permission justifications, and release checklist.
- `PRIVACY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`: actual behavior and support/security processes.
- `scripts/package-extension.sh`: deterministic, distinct unpacked and store-layout archives.

A root license grant is **not** a builder’s call. The repository’s unlicensed status is documented as an owner release gate; no license terms are invented. Publisher identity, live store submission, authenticated LinkedIn validation, and legal/policy approval also remain owner gates.

## 7. Data and compatibility

- Manifest/README version becomes **2.0.0** because history, exports, UI, and runtime coordination change materially (**builder’s call**).
- Storage migration is lazy, idempotent, and tested from v1.9.0 values.
- JSON v2 retains stable v1 fields where practical and adds provenance, extraction status, complete signals, and merge metadata. A migration reader accepts v1 history.
- Message responses share `{ ok, supported, isFeed, error? }` conventions and typed error codes; no property is known only by convention between two files.
- No existing readable persistent record is deleted except through enabled retention, an explicit clear action, or a tested migration that preserves an exportable backup first.

## 8. Verification strategy

- Every bug starts with a failing regression test derived from the audit.
- Unit tests cover pure classifier/shared primitives; DOM tests cover monitor/popup behavior; integration tests cover concurrent coordinator operations and migrations.
- Browser tests load the actual unpacked extension where the sandbox supports it. Any unavailable browser/live-site checks remain explicitly unexecuted release gates.
- CI verifies clean-checkout tests, syntax, package contents, and byte-for-byte reproducibility.
- Release documentation distinguishes automated evidence from human Chrome Web Store, LinkedIn policy, screen-reader, spreadsheet, and authenticated-feed checks.

## 9. Completion definition

“Applied” means all repository-actionable F/A items are implemented, mapped to tests, and covered by fresh verification. It does not mean owner-only legal/publisher choices, external policy approval, or live authenticated-LinkedIn certification. Those gates must remain visible in the final handoff rather than being silently marked complete.
