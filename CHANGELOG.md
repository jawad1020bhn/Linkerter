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
- Branded 16/48/128 PNG icons, privacy/support/security/contribution documentation, store drafts, deterministic unpacked/store packagers, and CI.

### Changed

- Consolidated adaptive scrolling into three modes while retaining Super Fast’s 15-minute/120-step caps and locked pause-on-input.
- Scoped content scripts to LinkedIn root/feed routes with Chrome 110 as the tested manifest floor.
- Prevented comment controls and uncertain/non-hiring partial cards from entering expansion or detected-history workflows.
- Canonicalized LinkedIn identity/URLs and retained complete text when merging newer partial observations.
- Preserved result focus/selection across identical refreshes and separated independent scroll/monitor command generations.
- Renamed user-facing modes to Adaptive naming and documented hidden-tab throttling and DOM-compatibility limitations.

### Fixed

- Negated and mixed-polarity hiring phrases no longer become positive openings without independent positive evidence.
- CSV exports neutralize spreadsheet-formula-leading untrusted cells.
- Concurrent history updates are serialized instead of overwriting another tab’s records.
- Enabled retention is enforced on initialization and every history/export read path.
- Feed/result refreshes no longer apply stale responses after target changes or cancel unrelated commands.
- Extension-owned hidden feed attributes/styles are removed on stop and lifecycle cleanup.

### Verification and release gates

The repository test, package, and integrity commands are the authoritative evidence for this candidate. Real Chrome, authenticated LinkedIn DOM behavior, store/policy review, licensing, and publisher approval remain subject to the explicit gates in `docs/store/release-checklist.md`; no approval is implied by this changelog.
