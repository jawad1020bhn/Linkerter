# LinkedIn Feed Scroller

**Version 1.9.0** is a Manifest V3 Chrome extension with a toolbar popup for adaptive LinkedIn feed scrolling and local English, French, and Arabic hiring/recruiting detection. It does not like, comment, connect, message, or perform other engagement actions.

## Scrolling

The popup provides exactly three modes, all explicitly Human-like:

- **Human-like Standard:** balanced movement and the most generous reading pauses.
- **Human-like Fast:** quicker movement with variable cadence and automatic slowdowns when the feed is dense or loading.
- **Human-like Super Fast:** the quickest adaptive preset, capped at **15 minutes and 120 steps**. Pause-on-input stays locked on.

Scroll distance, motion, wait time, and reading breaks are integrated into the local adaptive algorithm—there are no manual **Scroll chunk** or **Base wait** controls. It adjusts to visible post-text density, remaining distance, newly loaded content, and recent scroll progress, while varying smooth movement and inserting reading pauses. Session time and step limits remain configurable; Super Fast keeps its 15-minute / 120-step hard caps. All three modes keep scrolling in the selected LinkedIn tab when you switch away. The popup closes when focus moves elsewhere, but the content script attached to the selected feed continues the scroll loop; reopening the popup restores that per-window target. Chrome may throttle hidden tabs, so background pacing can slow or be delayed. Pacing is for readability and user control, not stealth or platform evasion. The extension stops when it leaves the feed or cannot detect feed movement.

## Local hiring and recruiting monitor

Start the monitor from the **Hiring filter** tab. The selected LinkedIn feed remains pinned per window even though the popup closes when you switch tabs: its content script keeps scrolling and the monitor scans newly loaded posts in the background. When you reopen the popup, use **Use active feed tab** to select a different feed, or **Return to feed** to bring the selected tab forward. The feed tab must remain open; closing it or navigating away stops live monitoring. Chrome may throttle background timers and animation frames, so scrolling and scans can slow or be delayed.

- Detects active openings, recruiter searches, possible hiring signals, job-seeker/referral posts, hiring advice/news, and closed or negative announcements.
- Uses English, French, and Arabic phrases plus generic employment wording, application cues, hashtags, career links, contact cues, and email patterns—including `@gmail.com` and common obfuscated addresses—as weighted corroborating evidence. Optional Algerian dialect/Arabizi variants are deliberately weak, noisy signals and cannot classify a post by themselves.
- **Professional role-title families are not classifier keywords.** A title by itself must not classify a post as hiring-related. Email/contact details alone are also insufficient.
- Duplicate cards with the same LinkedIn ID or permalink are merged in the result list and export archive. The monitor reports how many duplicate cards it merged.
- Results are local, explainable keyword/context matches—not semantic understanding. Review the post before acting on a low-confidence result. You can add a local label of **Useful**, **Irrelevant**, or **False positive**; these labels are notes only and do not affect classifier signals.
- The category selector filters the result list. The optional **Show selected matches in feed only** switch temporarily hides feed cards outside the selected category; incomplete or uncertain posts remain visible. Stop the monitor to restore the normal feed display.
- A **DOM compatibility check** reports matched post cards and post-text selectors, fallback use, and visible “See more” controls. Detection recognizes article/role markers, LinkedIn feed view names, post URNs, common feed-card classes, and structurally plausible `role=listitem` cards with text, controls, and links; if the current `<main>` wrapper has no cards, it checks the page body as a fallback. It warns if no feed post cards match after repeated checks; LinkedIn may change its page structure.

The monitor first reads complete post text already present in the page DOM. If full text is unavailable and a collapsed post’s “See more” control is visible, it can automatically activate that control while monitoring is on. It expands only when needed and retries the post text afterward; in the foreground it pauses an active scroller for safety. This is not a separate user-triggered expansion action. Auto-expansion can be disabled in the popup.

## Local export

**Export JSON** or **Export CSV** is an explicit, user-triggered download that stays on your device; no post data is uploaded. Choose whether to export all categories or only the currently selected category, and choose which fields to include: full text, email addresses, job-title candidates, age/metrics, and author/links/hashtags metadata. JSON retains structured data; CSV uses a UTF-8 BOM for spreadsheet compatibility.

Exports merge unique current-run records with any locally saved history. Available fields may include full post text and completeness, separated email addresses, heuristic job-title candidates, hashtags and links, post permalink/author, post age or publish time, reaction/comment/repost/view metrics, classifier category/confidence/score/evidence, and your review label. Unavailable age or engagement metrics are `null` in JSON and blank in CSV. Relative ages are approximate. Job-title candidates are export-only and are not classifier keywords.

Up to **1,000 unique detected records** are kept in memory per run. Stopping the monitor preserves that run for export; starting a new run or refreshing the page clears the in-memory run archive. Duplicate cards do not create repeat export rows.

## Optional local history

Local history is **off by default**. When enabled, detected post records (including text) are retained in Chrome local storage on this device, subject to the selected **7-, 30-, or 90-day** retention period and limits of **500 records / approximately 3 MB**. The default retention choice is 30 days when you turn it on. Turning history off stops new history saves but keeps already saved records until you choose **Clear saved history**; saved history remains exportable. Clearing history disables saving and removes the stored post-history records. Review labels are stored separately and are not removed by the history-clear control.

## Install (unpacked)

1. Extract `linkedin-feed-scroller.zip`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted `linkedin-feed-scroller` folder—the one containing `manifest.json`.
4. Open or refresh `https://www.linkedin.com/feed/` so the updated content scripts load.
5. Click the extension’s toolbar button to open the popup. When LinkedIn is already active, the feed is selected automatically; otherwise, switch to the feed and choose **Use active feed tab**.

## Permissions and privacy

- `activeTab`: allows interaction with the currently selected page when you open the popup.
- `storage`: save preferences, the per-window selected feed tab, optional local post history, and review labels in Chrome local storage.
- `https://www.linkedin.com/*`: run the scrolling controller and optional hiring monitor on LinkedIn.

The extension makes no analytics or external service requests. Hiring results and the current run’s export archive are held in page memory; persistent post history is only saved when you opt in. Select **Stop hiring monitor** to stop scanning and restore any temporarily hidden feed cards. Scrolling and scanning continue in the selected hidden LinkedIn tab while it remains open, subject to Chrome background throttling. Human-like Super Fast locks pause-on-input on.

Use responsibly and follow LinkedIn’s applicable terms and policies. LinkedIn may change its page structure or button labels, so DOM-dependent monitoring and expansion can require maintenance.

## Development workflow (Superpowers)

This repository includes a full in-repo installation of **[obra/superpowers](https://github.com/obra/superpowers)** (`v7.0.0`) configured across `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, `.agents/skills/`, `.claude/skills/`, and `.agents/superpowers/`.

- **Specs & plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (see [`docs/superpowers/README.md`](docs/superpowers/README.md) for full workflow documentation).
- **Verify Superpowers & extension integrity:** `bash scripts/verify-superpowers.sh`
- **Build clean extension archive (`linkedin-feed-scroller.zip`):** `bash scripts/package-extension.sh`
