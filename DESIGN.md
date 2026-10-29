# Linkerter popup — design notes

Working notes for the extension popup, kept in the form the `frontend-design` skill asks for:
a token plan, a review of that plan against the brief, then the build. The stylesheet is the
implementation; this file records *why* it looks the way it does so the next change does not
re-derive it.

## Brief

**Subject.** A Chrome MV3 popup that scrolls the LinkedIn feed at a controlled pace while
classifying posts locally for hiring signals.

**Audience.** One person actively scanning the feed for hiring content — a job seeker working
through openings, a recruiter watching competitors, or someone tracking a role. They keep the
popup open in bursts, between glances at the feed itself.

**Primary job.** Start, pause and stop the pacing, and read what has been detected so far.

**Constraints that shape the design.**

- Fixed 400×580 shell inside Chrome's 800×600 popup cap. No viewport units.
- Zero dependencies and no network: no webfonts. The typeface decision is therefore a
  constraint, not a default — see Type below.
- English-only, light interface.
- Dense information in a small surface, read in short bursts.

## Direction

A **reading instrument**, not a dashboard. The feed moves under the reader at a measured rate;
the interface's job is to report rate and position calmly and get out of the way.

This rules out the card-feed shell the popup previously leaned on. Cards, uniform shadows and
gradient washes are surface decoration borrowed from marketing pages; here every element either
reports state or takes an action.

## Tokens

### Colour

Six core values; every other colour is a tint of one of them or a semantic state.

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#f4f6f7` | shell background, cool neutral (deliberately not warm cream) |
| `--surface` | `#ffffff` | panels and controls that sit on the paper |
| `--ink` | `#16222e` | primary text |
| `--ink-soft` | `#5a6a76` | secondary text, meta, labels |
| `--line` | `#dde4e8` | hairline separation |
| `--accent` | `#0b7a63` | teal, reserved for live state and the primary action |

Derived tints: `--accent-deep/-tint/-line`, `--amber*` (attention), `--danger*` (destructive),
`--green` (running), `--fill` (inert control wells), plus neutral steps `--ink-mid/-dim/-faint`
and `--line-strong` for the cases that need a value between ink and hairline.

One deliberate exception to the six-colour rule: **category encoding** (`--cat-recruiter`,
`--cat-seeker`, `--cat-discussion`). Six post categories are told apart by hue, and at a glance
the colour is the only thing separating them, so the hues are functional rather than decorative.
The three that would collide with the accent get their own hue; the rest reuse the accent.

The accent is a state colour first and a brand colour second. If teal appears, something is
running, selected, or is the one primary action on screen.

### Type

Platform UI stack (`ui-sans-serif, system-ui, …`). A popup cannot fetch a webfont and should not
ship one, so family choice is fixed by the brief; personality is carried by scale, weight and
figures instead.

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 11px | keycaps, micro-labels |
| `--text-sm` | 12px | meta, status detail, secondary rows |
| `--text-base` | 13px | body copy, buttons, list content |
| `--text-md` | 15px | panel headings |
| `--text-lg` | 19px | wordmark, view titles |

Line heights stay tight (1.2–1.45) because the surface is short. Every counter uses
`font-variant-numeric: tabular-nums` so digits do not jitter as they update.

Monospace is used for keyboard keycaps only — those strings are literal key names, so mono is
carrying meaning rather than decorating a small data label.

### Layout

Three fixed bands, one scrolling region:

```
┌──────────────────────────────────────────┐
│ Linkerter            ● Ready             │  masthead: identity + live state (paper)
│ Adaptive Standard          No feed       │  state line
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │  step rail (signature element)
│ Ready to scroll the LinkedIn feed.       │
├──────────────────────────────────────────┤
│  Scroll            Hiring filter    ⚙    │  tab strip
├──────────────────────────────────────────┤
│                                          │
│  ▸ workspace — the active task only      │  single scroll container
│                                          │
└──────────────────────────────────────────┘
```

Content is left-aligned with 14px gutters; nothing is centred, because every line is read as a
sequence (state → controls → results) rather than as a statement.

### Principles

1. **Accent means live.** Teal only for running, selected, or the primary action.
2. **Hairlines separate; shadows are not used for hierarchy.** The only shadow left is the
   switch knob's contact shadow, which is a physical affordance rather than decoration.
3. **Sentence case.** No tracked capitals standing in for hierarchy; weight and colour do that.
4. **Two radii.** Controls 6px, surfaces 10px. Pills only for status that must read as a tag.
5. **One signature.** The step rail is the memorable element; everything around it stays quiet.

## Review against the brief

Ran the plan back against the brief before building, and revised three parts that had drifted
into defaults:

- **Dark masthead → light hairline masthead.** The first pass kept the near-black header with a
  vertical gradient. That is the "tinted near-black surface plus gradient wash" default, and in a
  580px-tall popup it spent the top band on decoration rather than information. Revised to a
  paper masthead separated by one hairline; the wordmark and state dot carry identity instead.
- **"A · B · C" meta strings → sentences.** The inherited copy joined facts with middle dots
  (`Page 2 · 40 results`, `Off · no post history is being saved`). That is template chrome that
  appears regardless of subject. Revised to plain sentences and separate elements.
- **Tracked uppercase labels → sentence case.** `CHECKING`, `NO FEED SELECTED` and the pipeline
  label used caps plus letter-spacing. Caps now only survive where the underlying string really
  is an acronym (`NO AI` → kept as a badge, since it is a claim about the product, not a label).

Deliberately kept:

- **Mono keycaps.** Keyboard shortcuts are literal key names; mono is semantic here.
- **Pill radius on status chips.** These need to read as tags next to prose.

## Verification

This environment has no browser binaries and cannot reach the Playwright CDN, so screenshots are
not available for visual review. The build is verified instead by: parse/balance checks on the
stylesheet, an orphan-class and unused-token scan, the popup's live preview server, and the full
test suite (which pins the i18n key coverage and the inline HTML fallbacks these copy changes
touch).
