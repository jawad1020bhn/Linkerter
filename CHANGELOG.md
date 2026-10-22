# Changelog

All notable changes to Linkerter are documented here. Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-22

### Added

- Shared canonical post identity, safe DOM/message/storage primitives, and a real Node/jsdom test harness.
- Multilingual English, French, and Arabic classifier corpus evaluation with polarity/negation handling and explainable evidence.
- Single-writer `off`, `session`, and `persistent` history modes, coordinated writes, retention, provenance, and safe record merging.
- Incremental feed monitoring, bounded extraction/expansion, keyed paginated results, search/sort/details, and local review labels.
- Schema-v2 JSON/CSV exports, field selection, sanitized diagnostic downloads, and distinct history/all-data deletion controls.
- Local EN/FR/AR popup dictionaries, Arabic RTL, responsible-use onboarding, keyboard tabs, reduced motion, and accessible reflow/focus styling.
- Real-Chrome MV3 integration harness with sanitized intercepted HTTPS fixtures, concurrent-tab/storage/reload/download/keyboard scenarios, and an explicit unavailable-browser gate.
- 65-case adversarial EN/FR/AR corpus (`tests/fixtures/classifier/adversarial.json`) covering real vacancy formats, opening-shaped lookalikes, negation, mixed clauses, recruiter searches, job seekers, advice, and closed posts.
- `npm run probe:classifier` reports per-category precision/recall and `open_role` false positives; `npm run probe:feed` proves one realistic card yields one post root, one archive record, and chrome-free text. Both gate with `--strict` and run strict in CI.
- Post age and an explicit “older than 60 days, may no longer be active” marker reach the result list, so a months-old reshared opening is visibly separated from a current one.
- Branded 16/48/128 PNG icons, privacy/support/security/contribution documentation, store drafts, deterministic unpacked/store packagers, and CI.

### Changed

- Consolidated adaptive scrolling into three modes while retaining Super Fast’s 15-minute/120-step caps and locked pause-on-input.
- Scoped content scripts to LinkedIn root/feed routes with Chrome 110 as the tested manifest floor.
- Prevented comment controls and uncertain/non-hiring partial cards from entering expansion or detected-history workflows.
- Canonicalized LinkedIn identity/URLs and retained complete text when merging newer partial observations.
- Preserved result focus/selection across identical refreshes and separated independent scroll/monitor command generations.
- Renamed user-facing modes to Adaptive naming and documented hidden-tab throttling and DOM-compatibility limitations.
- Result order now defaults to **Active openings first** (openings, then recruiter searches, possible matches, job seekers, advice, closed — freshest post first inside each category) while **Newest first** and **Oldest first** stay purely chronological. No category is hidden and no classifier signal changed.
- Removed the **Partial text** result filter. Partial-only records are deliberately never archived, so that option could only ever render an empty list; partial content is still flagged on the records that are archived.
- Post-root selection now treats only card-level elements as cards. `feed-shared-update-v2__description-wrapper`, `__content`, `__actor`, and `__social-actions` are parts of a card, not cards, and a nested card is a separate post only when it carries its own distinct post URN (a reshare).

### Fixed

- One real LinkedIn post no longer produces several archive records. Nested card children used to become independent post roots with `text:` identities while the card kept its `urn:` identity, so a single post could appear three times, inflate `counts.open_role` and the results total, burn the export-archive limit, and report contradictory complete/partial labels.
- Page chrome no longer enters post text: see-more/see-less and comment control labels, and — in card-level fallback — actor, timestamp, action row, and control-menu text are excluded from the text that is classified, deduplicated, displayed, and exported.
- Opening-shaped intake phrasing (`applications are open`, `join our team`, `our team is growing`, `come work with us`, `referrals welcome`, `candidatures ouvertes`, `التقديم مفتوح`, `فرصة عمل`) no longer reaches **Openings** on its own, which removed programme, webinar, grant, entrance-exam, volunteering, and employer-praise false positives. It needs independent employment wording or a job/careers link, and otherwise stays in **Possible matches**.
- Added structural vacancy frames instead of title families: `Hiring: <title>` / `Hiring - <title>` headlines and the Arabic `مطلوب … للعمل|للانضمام|في` frame, plus `je recrute` and `nous sommes à la recherche`. These recovered common EN/FR/AR vacancies that were previously reported as no signal at all.
- A phrase can no longer corroborate itself: employment wording counted as context must be independent of the matched opening phrase (`فرصة عمل` contains `عمل`).
- Negation is scoped to its own clause. Because commas normalize to spaces, a negation used to suppress any genuine cue within four words — “I am not hiring, but here are hiring tips …” was reported as no signal with empty evidence, and an Arabic “we are not hiring, but applications are open …” was reported as closed. Connectives and sentence boundaries now end the negation’s scope.
- Suppressed job-seeker, advice/news, intake, and vacancy-frame signals are now reported as `Negated …` evidence entries, so a “No hiring signal” result stays explainable instead of silently discarding what matched.
- `نبحث عن مرشحين` moved from active-opening to recruiter-search phrasing, so an Arabic candidate search is no longer reported as an opening by the same words.
- Negated and mixed-polarity hiring phrases no longer become positive openings without independent positive evidence.
- CSV exports neutralize spreadsheet-formula-leading untrusted cells.
- Concurrent history updates are serialized instead of overwriting another tab’s records.
- Enabled retention is enforced on initialization and every history/export read path.
- Feed/result refreshes no longer apply stale responses after target changes or cancel unrelated commands.
- Extension-owned hidden feed attributes/styles are removed on stop and lifecycle cleanup.

### Verification and release gates

The repository test, package, and integrity commands are the authoritative evidence for this candidate. Real Chrome, authenticated LinkedIn DOM behavior, store/policy review, licensing, and publisher approval remain subject to the explicit gates in `docs/store/release-checklist.md`; no approval is implied by this changelog.
