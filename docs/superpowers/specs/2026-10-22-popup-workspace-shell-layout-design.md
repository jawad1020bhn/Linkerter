# Popup workspace-shell layout — direction contract

Recorded per the impeccable skill's new-work flow (surface rebuild inside the
established clean-light world). Development-only contract; never copied into
implementation source.

## Direction contract

THESIS: The popup is a cockpit, not a card feed. One persistent instrument
masthead (state, mode, target, session progress) above a horizontal segmented
tab strip; below them a single scrolling workspace owned entirely by the active
task. Refuses the incumbent stacked-cards-plus-bottom-dock arrangement where
live status was buried between onboarding and transport controls.

OWN-WORLD: Unchanged clean-light system — paper #f5f7f8 ground, white surfaces,
navy ink, one teal accent, hairline #dfe5e9 borders, border-only elevation,
12/13/14/16/22 type ramp, 8/12/14 spacing rhythm, 12–16px card radii.

STORY: The visitor opens the popup, reads session state at a glance in the
masthead (dot, label, mode chip, target chip, progress hairline), picks a
destination on the tab strip (Scroll / Hiring filter / gear), and completes the
task in the workspace: target + transport on Scroll, monitor + metrics +
results on Hiring, grouped preferences on Settings.

FIRST VIEWPORT (400×580 fixed): masthead ~96px (brand row + instrument row +
status detail line), tab strip ~48px, then the Scroll workspace: target block,
one-row transport cluster (Start hero flex-1 + Pause|Stop segmented), settings
hint. Primary action (Start scrolling) sits above the fold on first open.

FORM: Rail-less app shell with top segmented navigation — the ranked lead of
five derived structures (top-nav shell, left icon rail, cockpit split,
feed-mirror list-first, bottom-dock canon). Left rail was declined: the JS tab
contract hard-codes ArrowLeft/ArrowRight keyboard navigation, which matches a
horizontal strip and fights a vertical rail. SEED REFERENCE: seed: none
(unavailable) — concept-seed engine could not run in this sandbox; the choice
was delegated by the user ("do what best, use skill") and proceeds unattended
per the new-work degraded protocol.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Constraints carried (product truth, not renegotiable)

- Chrome popup: fixed 400px wide, hard cap 800×600; body is a 580px flex
  column, workspace is the only scroll container. No viewport units, no %
  heights.
- popup.js contract untouched: 65 element IDs, `.view`/`.active`/`hidden`
  switching, `.progress-track` class hook, className rewrites on
  `#globalNotice`, `#connectionChip`, `#targetBadge`, `#stateDot`,
  `#monitorStatus`, `.is-running` on `#monitorBtn`, `[data-view-jump]`,
  role=tablist/tab with ArrowLeft/Right/Home/End keys.
- popup-results.js render contract: `.empty-state` (icon span, strong, span),
  `.match-item` internals, `.detail-*` internals.
- All data-i18n keys stay in use; RTL via logical properties; every font-size
  ≥ 12px; reduced-motion and browser-surface theming carried over.
- Per explicit user instruction for this pass, the test suite is not run or
  updated; tests that encode the previous layout will need reconciliation in a
  later pass.
