# Chrome Web Store listing — draft

> This is release-copy preparation, not a submitted or approved listing. The release owner must complete `release-checklist.md` before publication.

## Name

Linkerter – Adaptive LinkedIn Feed

## Short description

Adaptive LinkedIn feed scrolling with local EN/FR/AR hiring detection, private history, and safe exports.

## Full description

Take control of LinkedIn feed reading with three local adaptive scrolling modes and an optional multilingual hiring-post monitor.

**Adaptive scrolling**
- Standard, Fast, and Super Fast pacing with reading pauses and feed-aware adjustments.
- Configurable session limits; Super Fast remains capped at 15 minutes and 120 steps with pause-on-input locked.
- Continue in the selected hidden feed tab, subject to Chrome throttling, and stop when the tab leaves the feed.

**Local hiring monitor**
- Detect active openings, recruiter searches, possible signals, referrals/job seeking, advice/news, and closed announcements in English, French, and Arabic.
- Review explainable local matches with search, sorting, pagination, full details, and personal review labels.
- Expand collapsed post text only when needed and see DOM compatibility feedback.
- Keep optional history off, for the browser session, or persistently on your device.

**Accessible and private**
- Local EN/FR/AR interface with Arabic RTL, keyboard tabs, visible focus, reduced-motion support, and responsive layouts.
- No analytics, external AI calls, extension-owned uploads, likes, comments, connections, or messages.
- User-triggered JSON/CSV downloads with selectable fields; full text and email exports are off by default on fresh installs.
- Clear saved history or all local data with separate confirmed controls.

Linkerter performs local keyword/context analysis, not semantic understanding. Review uncertain results before acting. LinkedIn DOM changes can require maintenance. Use responsibly and review applicable LinkedIn terms and policies.

## Metadata draft

- Category: Productivity
- UI languages: English, French, Arabic
- Minimum Chrome version: 110
- Version: 2.0.0
- Support/repository: https://github.com/jawad1020bhn/Linkerter
- Privacy policy source: `PRIVACY.md` (publish at an owner-controlled accessible URL before submission)

## Permission justification draft

- `activeTab`: identify and interact with the user-selected LinkedIn feed tab for scrolling, monitoring, and returning to that tab.
- `storage`: retain user preferences, selected-tab mappings, optional local/session history, review labels, and diagnostics on the user’s device.
- `https://www.linkedin.com/*`: attach the scrolling and optional hiring monitor only on the declared LinkedIn root/feed content-script routes. The extension does not transmit this host data to the developer.

## Visual assets

Branded PNG icons are in `icons/` at 16, 48, and 128 pixels. Store screenshots must come from real browser captures. No screenshot claim should be made when `docs/store/screenshots/` contains no captured PNGs; synthetic fixture captures are acceptable only when clearly labeled as synthetic in release evidence.
