# Linkerter popup — clean-light dashboard redesign

Date: 2026-10-22
Status: approved by conversation (style: clean light minimal; layout: dashboard; scope: full overhaul)
Surface: `popup.html`, `popup.css`, four new i18n keys in `popup-i18n.js` (EN/FR/AR parity)

## Intent and why

The v2.0.0 popup grew organically: a top tab strip, a gear in the header, stacked
paragraph-heavy cards, and settings buried behind a full view swap. Users read it
top-to-bottom like a document instead of glancing at a control surface. This redesign
rebuilds the popup markup and stylesheet from scratch around one idea: **the popup is a
small dashboard, not a page** — persistent status up top, one obvious primary action per
task, configuration collapsed out of sight, and navigation pinned where thumbs expect it.

## Goals

- Glanceable session state: status dot, state label, mode chip, and step progress are
  always visible above whichever task panel is open.
- App-like shell: sticky app bar (brand + connection chip) and a sticky bottom
  navigation dock (Scroll tab, Hiring tab with live count badge, Settings).
- Clean light minimal visual language: airy white surfaces on a cool paper background,
  hairline borders, soft shadows, one teal accent inherited from the extension mark,
  navy ink, tabular numerals for metrics.
- Settings as scannable, collapsible groups (`<details>`) instead of one long scroll.
- Preserve every behavior: zero changes to `popup.js`, `popup-results.js`,
  `popup-export.js` logic; all element IDs, ARIA roles, i18n keys, and JS-toggled
  classes remain exactly where the controllers and the jsdom/axe test suite expect them.

## Non-goals

- No new features, permissions, network calls, or dependencies.
- No changes to content scripts, background coordinator, export schema, or classifier.
- No dark mode in this pass (tokens are centralized, so a theme pass is cheap later).

## Anti-goals (failure even if it "works")

- Any regression in the 151-test suite, especially the axe wcag2a/aa audit, the CSS
  readability/contrast/focus/RTL/reduced-motion contract, roving-tabindex keyboard
  tabs, and the "gear owns settings, not a third tab" semantics.
- Untranslated strings: every visible label routes through the EN/FR/AR dictionaries;
  Arabic keeps full RTL logical layout.
- Popup measurement breakage: Chrome caps popups at 800×600, so sizing stays in fixed
  px on `html`/`body` with inner scrolling — no viewport units, no % heights.

## Decided in conversation (partner's choices)

- Visual direction: clean light minimal (Notion/Linear-light feel).
- Layout paradigm: dashboard — hero status card, segmented controls, collapsible
  sections, bottom navigation.
- Scope: full overhaul of visuals, layout, and information hierarchy.

## Builder's calls (mine, flagged for review)

- Accent stays teal (`--teal: #0b7a63`, white-on-teal 5.3:1) to keep brand continuity
  with the navy/mint extension icon; navy doubles as the monitor-action color and
  turns danger-red while the monitor runs.
- Token names required by the accessibility contract (`--ink`, `--muted`, `--paper`,
  `--surface`, `--teal`, `--navy`, `--danger`) keep their names with new values.
- The gear moved from the header into the dock; it remains a plain button with
  `aria-expanded`/`aria-controls` (never `role=tab`), so the tablist still owns exactly
  two tabs and the keyboard contract is unchanged.
- The hero status card and target-feed card live outside the tab panels so status is
  persistent; they stay visible while Settings is open (settings replaces only the two
  tab panels, as before).
- Four new dictionary keys (`status.section`, `scroll.pauseStop`, `dock.section`,
  `settings.nav`) added with EN/FR/AR parity for new aria-labels/labels.
- Pause/Stop render as a segmented pair under a full-width hero Start button; result
  search/filter/sort collapse into a two-column toolbar with the search spanning.
- Metric counters become 2×2 stat tiles with tabular numerals.
- Sticky (not fixed) app bar and dock inside the body scroll container, so the popup
  keeps grow-to-content sizing between 480 and 580 px tall.

## Verification

- `npm test` — 151/151 pass (unit, integration, jsdom DOM suite incl. axe wcag2a/aa).
- `npm run preview:popup` (with `PREVIEW_REF=<base>`) renders the real popup at
  Chrome's 800×600 ceiling with a synthetic chrome.* stub and an A/B link to the
  previous stylesheet.
