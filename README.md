# Linkerter – Adaptive LinkedIn Feed

**Version 2.0.0** is a Manifest V3 Chrome extension (Chrome 110+) with a toolbar popup for adaptive LinkedIn feed scrolling and local English, French, and Arabic hiring/recruiting detection. It does not like, comment, connect, message, or perform other engagement actions.

## Scrolling

The popup provides exactly three adaptive modes:

- **Adaptive Standard:** balanced movement and the most generous reading pauses.
- **Adaptive Fast:** quicker movement with variable cadence and automatic slowdowns when the feed is dense or loading.
- **Adaptive Super Fast:** the quickest adaptive preset, capped at **15 minutes and 120 steps**. Pause-on-input stays locked on.

Scroll distance, motion, wait time, and reading breaks are integrated into the local adaptive algorithm—there are no manual **Scroll chunk** or **Base wait** controls. It adjusts to visible post-text density, remaining distance, newly loaded content, and recent scroll progress, while varying smooth movement and inserting reading pauses. Session time and step limits remain configurable; Super Fast keeps its 15-minute / 120-step hard caps. All three modes keep scrolling in the selected LinkedIn tab when you switch away. The popup closes when focus moves elsewhere, but the content script attached to the selected feed continues the scroll loop; reopening the popup restores that per-window target. Chrome may throttle hidden tabs, so background pacing can slow or be delayed. Pacing is for readability and user control, not stealth or platform evasion. The extension stops when it leaves the feed or cannot detect feed movement.

## Local hiring and recruiting monitor

Start the monitor from the **Hiring filter** tab. The selected LinkedIn feed remains pinned per window even though the popup closes when you switch tabs: its content script keeps scrolling and the monitor scans newly loaded posts in the background. When you reopen the popup, use **Use active feed tab** to select a different feed, or **Return to feed** to bring the selected tab forward. The feed tab must remain open; closing it or navigating away stops live monitoring. Chrome may throttle background timers and animation frames, so scrolling and scans can slow or be delayed.

- Detects active openings, recruiter searches, possible hiring signals, job-seeker/referral posts, hiring advice/news, and closed or negative announcements.
- Uses English, French, and Arabic phrases plus generic employment wording, application cues, hashtags, career links, contact cues, and email patterns—including `@gmail.com` and common obfuscated addresses—as weighted corroborating evidence. Optional Algerian dialect/Arabizi variants are deliberately weak, noisy signals and cannot classify a post by themselves.
- **Professional role-title families are not classifier keywords.** A title by itself must not classify a post as hiring-related. Email/contact details alone are also insufficient.
- Unambiguous hiring predicates (`we are hiring`, `nous recrutons`, `je recrute`, `نحن نوظف`) and structural vacancy frames (`Hiring: <title>`, `مطلوب … للعمل`) are enough on their own. Opening-shaped phrasing that programmes, events, grants, volunteering, and employer praise also use (`applications are open`, `join our team`, `our team is growing`, `candidatures ouvertes`) reaches **Openings** only together with independent employment wording or a job/careers link, and otherwise stays in **Possible matches** for review.
- Negation is scoped to its own clause, so “we are not hiring, **but** …” no longer suppresses the positive clause that follows, and every suppressed signal is reported in the evidence list rather than disappearing silently.
- Duplicate cards with the same LinkedIn ID or permalink are merged in the result list and export archive, and the monitor reports how many duplicate cards it merged. Nested parts of a card (its text wrapper, actor, action row) are never treated as separate posts, so one post produces exactly one record and one count; a reshared post inside another post is still counted as the two distinct posts it is.
- Results are local, explainable keyword/context matches—not semantic understanding. Review the post before acting on a low-confidence result. You can add a local label of **Useful**, **Irrelevant**, or **False positive**; these labels are notes only and do not affect classifier signals.
- The category selector filters the result list, and **Active openings first** is the default result order: openings lead, followed by recruiter searches, possible matches, job seekers, advice, and closed posts, with every category still visible. Freshest post first inside a category, and openings the page reports as older than 60 days are marked as possibly no longer active. **Newest first** and **oldest first** remain available as purely chronological orders. Search and the selected order are applied before pagination (25 posts per page). Each result can open a full-detail view on demand and, when a validated LinkedIn permalink exists, the original post in a new tab. The optional **Show selected matches in feed only** switch temporarily hides feed cards outside the selected category; incomplete or uncertain posts remain visible. Stop the monitor to restore the normal feed display.
- A **DOM compatibility check** reports matched post cards and post-text selectors, fallback use, and visible “See more” controls. Detection recognizes article/role markers, LinkedIn feed view names, post URNs, common feed-card classes, and structurally plausible `role=listitem` cards with text, controls, and links; if the current `<main>` wrapper has no cards, it checks the page body as a fallback. It warns if no feed post cards match after repeated checks; LinkedIn may change its page structure.

The monitor first reads complete post text already present in the page DOM. If full text is unavailable and a collapsed post’s “See more” control is visible, it can automatically activate that control while monitoring is on. It expands only when needed, bounds retries, and verifies an observed body/control change. In the foreground it pauses an active scroller for safety; scrolling remains paused until you explicitly choose **Resume**. This is not a separate user-triggered expansion action. Auto-expansion can be disabled in the popup.

## Accessible localized popup

The popup includes locally shipped English, French, and Arabic dictionaries. Choose a language explicitly or use the browser’s automatic language; Arabic applies a right-to-left logical layout. No web fonts or translation services are requested. The Scroll and Hiring tabs support Left/Right Arrow, Home, and End keys with roving focus, and result refreshes preserve keyed rows and focused controls. Text, contrast, focus indicators, reduced motion, and narrow/zoomed layouts are covered by DOM checks.

A short first-run panel explains local-only analysis, user controls, responsible use, and the absence of engagement actions or external AI calls. Dismissing it and changing language are saved locally; **Clear all local data** restores these fresh-install choices.

## Local export

**Export JSON** or **Export CSV** is an explicit, user-triggered download that stays on your device; no post data is uploaded. Choose whether to export all categories or only the currently selected category, and choose which fields to include: full text, email addresses, job-title candidates, age/metrics, and author/links/hashtags metadata. Full text and email fields are **off by default on fresh installs**; existing field preferences are preserved. JSON retains structured schema-v2 data; CSV uses a UTF-8 BOM, CRLF rows, and formula-neutralized cells for spreadsheet compatibility.

Exports merge unique current-run records with any locally saved history. Available fields may include full post text and completeness, separated email addresses, heuristic job-title candidates, hashtags and links, post permalink/author, post age or publish time, reaction/comment/repost/view metrics, classifier category/confidence/score/evidence, and your review label. Unavailable age or engagement metrics are `null` in JSON and blank in CSV. Relative ages are approximate. Job-title candidates are export-only and are not classifier keywords.

Up to **1,000 unique detected records** are kept in memory per run. Stopping the monitor preserves that run for export; starting a new run or refreshing the page clears the in-memory run archive. Duplicate cards do not create repeat export rows.

## Optional local history

Local history is **off by default**. Choose **Browser session only** for `chrome.storage.session` or **Persistent on this device** for `chrome.storage.local`. Changing modes never copies old records between stores. Active history follows the selected **7-, 30-, or 90-day** retention period and limits of **500 records / approximately 3 MB per store**. Exports combine both stores with provenance and preserve complete text during canonical-ID merges.

Turning history off stops new saves but keeps already saved records until you choose **Clear saved history**; saved history remains exportable. Clearing history disables saving and removes post-history records from both stores while preserving review labels. **Clear all local data** separately removes history, preferences, review labels, target mappings, and diagnostics after confirmation. The history status shows combined record bytes and the last successful save, or an honest storage-read error.

The optional sanitized diagnostic contains extension/browser/protocol versions, selector-health and operational counts, error categories, and scan timings. It excludes post text, emails, post/profile/tab URLs, and free-form selector/error messages; downloading it is explicit and local.

## Install (unpacked)

1. Extract `linkedin-feed-scroller.zip`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted `linkedin-feed-scroller` folder—the one containing `manifest.json`.
4. Open or refresh `https://www.linkedin.com/feed/` so the updated content scripts load.
5. Click the extension’s toolbar button to open the popup. When LinkedIn is already active, the feed is selected automatically; otherwise, switch to the feed and choose **Use active feed tab**.

## Auto-update while developing (unpacked)

Chrome never updates an extension loaded with **Load unpacked** and never watches
its folder, so each `git pull` used to mean: `chrome://extensions` → **Reload** →
refresh LinkedIn. Run the watcher once and that becomes automatic:

```sh
npm run dev:auto-update
```

It polls `origin` (every 30 s), fast-forwards the checkout **only when it is
clean and fast-forwardable**, and writes the new commit to the gitignored
`dev-autoreload.json`. The development build notices the stamp, reloads itself
through `chrome.runtime.reload()`, and refreshes the open LinkedIn tabs so the new
content scripts are injected. Options include `--branch`, `--interval`, `--once`,
`--no-pull`, and `--no-reload-tabs`.

It is development-only: the hook runs solely for `installType === "development"`,
adds no permission, sends no extension-side network request, refuses to overwrite
uncommitted work, and ships in neither release archive. See
[`docs/dev-auto-update.md`](docs/dev-auto-update.md) for options, the MV3
service-worker caveat, and troubleshooting.

## Permissions and privacy

- `activeTab`: allows interaction with the currently selected page when you open the popup.
- `storage`: save preferences, the per-window selected feed tab, optional local post history, and review labels in Chrome local storage.
- `https://www.linkedin.com/*`: run the scrolling controller and optional hiring monitor on LinkedIn.

The extension makes no analytics or external service requests. Hiring results and the current run’s export archive are held in page memory; persistent post history is only saved when you opt in. Select **Stop hiring monitor** to stop scanning and restore any temporarily hidden feed cards. Scrolling and scanning continue in the selected hidden LinkedIn tab while it remains open, subject to Chrome background throttling. Adaptive Super Fast locks pause-on-input on.

Use responsibly and follow LinkedIn’s applicable terms and policies. LinkedIn may change its page structure or button labels, so DOM-dependent monitoring and expansion can require maintenance. See [`PRIVACY.md`](PRIVACY.md) for storage, retention, export, and deletion details.

## Release status

Version 2.0.0 is a release candidate, not a claim of store or LinkedIn approval. The original authoring sandbox had no Chrome executable, so the real-browser suite is **NOT RUN** there; CI requires it. Authenticated LinkedIn, real screen-reader/zoom, licensing, publisher, privacy-URL, and policy-review gates remain with the release owner. See [`docs/store/release-checklist.md`](docs/store/release-checklist.md).

## Development workflow (Superpowers)

This repository includes a full in-repo installation of **[obra/superpowers](https://github.com/obra/superpowers)** (`v7.0.0`) configured across `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, `.agents/skills/`, `.claude/skills/`, and `.agents/superpowers/`.

- **Specs & plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (see [`docs/superpowers/README.md`](docs/superpowers/README.md) for full workflow documentation).
- **Install locked development tools:** `npm ci` (Node 22+)
- **Run unit/integration/DOM/release tests:** `npm test`
- **Measure classifier precision/recall per category:** `npm run probe:classifier` (add `-- --strict` to gate, `-- --json` for machine output)
- **Check one-post-one-record feed extraction:** `npm run probe:feed` (add `-- --strict` to gate)
- **Verify Superpowers & extension integrity:** `bash scripts/verify-superpowers.sh`
- **Run actual Chrome MV3 integration:** `npm run test:browser` (set `CHROME_PATH` when needed; unavailable Chrome is explicitly `NOT RUN`)
- **Build deterministic directory-wrapped unpacked archive:** `bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked.zip`
- **Build deterministic manifest-at-root store archive:** `bash scripts/package-extension.sh --store /tmp/linkerter-store.zip`
- The legacy `bash scripts/package-extension.sh /tmp/linkerter.zip` invocation still creates an unpacked archive. Both modes include only runtime files/icons and exclude tests, audits, documentation, and Superpowers tooling.

Contribution, support, security, and release history are documented in [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SUPPORT.md`](SUPPORT.md), [`SECURITY.md`](SECURITY.md), and [`CHANGELOG.md`](CHANGELOG.md).
