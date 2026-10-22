# Linkerter privacy policy

**Effective:** 2026-10-22
**Extension version:** 2.0.0

Linkerter – Adaptive LinkedIn Feed is a local-only Chrome extension for user-controlled feed scrolling, multilingual hiring-post classification, local result review, and user-triggered exports. This policy describes the extension’s checked-in behavior; it is not a legal determination about LinkedIn or Chrome Web Store policies.

## Data processed on your device

When you start the hiring monitor on a LinkedIn feed, the extension processes post data already present in that page’s DOM. Depending on availability and your selected export fields, this can include:

- post text, canonical post ID or permalink, author name/profile link, and hashtags;
- post age or publish time and reaction/comment/repost/view counts;
- email addresses and links found in post text, plus heuristic job-title candidates;
- local classifier category, confidence, score, evidence, and extraction completeness; and
- your optional Useful, Irrelevant, or False positive review label.

Classification is local keyword/context analysis. It is not semantic understanding and does not use an external AI service. A title, contact detail, or weak regional phrase alone is not sufficient to classify a post as hiring-related.

## No extension-owned transmission or engagement

The runtime contains no analytics, telemetry, advertising, remote-code loading, external AI calls, or extension-owned uploads. It does not send post data, history, preferences, diagnostics, or exports to the developer or a third-party service. It has no runtime dependencies or web-font/translation requests. Normal LinkedIn scrolling and post expansion can still cause LinkedIn itself to make network requests; that activity is governed by LinkedIn, not transmitted by Linkerter to a separate service.

The extension does not like, comment, connect, message, follow, or otherwise engage with LinkedIn’s social graph. It does not automate account creation or authentication.

## Memory, storage, and retention

The current run keeps at most **1,000** unique detected records in page memory. Starting a new run or reloading the page clears that in-memory archive. Stopping the monitor preserves the current run for export until one of those events occurs.

Post-history saving is **off by default**. You can choose:

- **Off:** no new history records are saved; existing records remain until explicitly cleared.
- **Browser session only:** records are stored in `chrome.storage.session` and are subject to the browser session’s lifetime.
- **Persistent on this device:** records are stored in `chrome.storage.local` until cleared.

Changing modes never copies existing records between session and persistent stores. Each store is limited to **500 records** and approximately **3 MB**. When history is enabled, the selected 7-, 30-, or 90-day retention period is applied during initialization, writes, and export reads. The default retention choice is 30 days when first enabled. A last-successful-save timestamp is stored alongside records in the same store, and the popup displays combined history-record byte usage; clearing history removes that metadata with the records.

Preferences, onboarding/language choices, export-field choices, per-window selected-tab mappings, diagnostics counters, and review labels use Chrome storage as needed. Review labels are separate from post history.

## Exports and diagnostics

JSON, CSV, and diagnostic downloads are explicit, **user-triggered** actions. Exports are written through Chrome’s normal download flow and remain on your device unless you choose to share them. No export is uploaded by the extension.

Exports can combine the current run with both history stores and identify record provenance. Full post text and email fields are off by default on fresh installations; you control the included fields and category scope. JSON unavailable metrics are `null`; CSV equivalents are blank. CSV cells are neutralized against spreadsheet-formula prefixes.

Diagnostic downloads contain sanitized operational counters and compatibility information, not post text.

## Your controls

- **Stop hiring monitor** stops scanning and restores temporarily hidden feed cards.
- **Clear saved history** removes post-history records from both storage areas and disables future history saving until you opt in again; review labels are retained.
- **Clear all local data** removes history, preferences, review labels, selected-tab mappings, and diagnostics after confirmation, and restores fresh-install onboarding/language choices.
- You can also remove the extension through Chrome. Chrome controls any remaining browser-managed storage cleanup.

## Permissions

- `activeTab` supports interaction with the selected LinkedIn tab when you use the popup.
- `storage` supports preferences, selected-tab mappings, optional history, review labels, and diagnostics.
- `https://www.linkedin.com/*` is the declared host scope; content scripts are matched only to the LinkedIn root and feed routes.

Scrolling and monitoring can continue in the selected hidden feed tab while it remains open. Chrome may throttle hidden-tab work. Closing the tab or leaving the feed stops live monitoring.

## Third parties and policy review

LinkedIn and Chrome have their own privacy practices and terms. You are responsible for your use of the extension and for reviewing applicable terms. Store approval, LinkedIn approval, and legal/policy compliance are not claimed by this document.

## Changes and support

Material changes to this policy should be recorded in `CHANGELOG.md`. For questions or a privacy concern, use the repository support path in `SUPPORT.md`. Do not post credentials, private post exports, or other sensitive data in a public issue.
