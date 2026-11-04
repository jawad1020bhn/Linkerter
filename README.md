# Linkerter – Adaptive LinkedIn Feed

> Historical names: the archive and content-script globals still use
> `linkedin-feed-scroller` (the project's original name); the product has since
> been renamed to Linkerter. Both names refer to this extension.

A zero-dependency Chrome MV3 extension that scrolls LinkedIn at a
human-comfortable pace and, while it does, classifies posts locally for hiring
signals (openings, recruiter searches, job seekers, closed positions) in
English, French and Arabic. Everything is processed
and stored on-device: no remote code, no telemetry, no network calls beyond the
tab the user is viewing.

Supported pages:

- **The home feed and feed views** (`/`, `/feed`, `/feed/*`).
- **Search results** (`/search/results/*`): people, companies and content results carry the
  same post cards, so the monitor reads them too.
- **Not** `/jobs` or any other LinkedIn surface. Those are refused rather than half-working;
  the manifest, the URL parser and the popup all agree on the same list, and a test pins them
  to each other.

Detection scope is deliberately narrow:

- **Three post languages** (English, French, Arabic). Spanish, German and
  Portuguese vocabulary is not shipped, so those posts are ignored rather than
  half-matched through a shared token.
- **Sponsored and promoted placements are excluded entirely.** A promoted card
  is advertising inventory, not a post, so it never enters the review queue, the
  archive, the saved history, or an export — even when its text advertises a
  vacancy.
- **No Arabic month parsing.** Maghrebi and Mashriqi month names collide
  (`شباط` is February in the Levant, January in Morocco), so an Arabic date label
  is reported as unknown instead of being guessed into the wrong month. Post
  ages are parsed for English and French only.

## Files

| Path | Role |
| --- | --- |
| `manifest.json` | MV3 manifest (`activeTab`, `scripting`, `storage`) |
| `core/linkedin-shared.js` | Shared primitives: URL canonicalization, history pruning limits, sanitizers |
| `core/linkedin-hiring-rules.js` | Keyword/phrase tables for the classifier (en/fr/ar) |
| `core/linkedin-hiring-classifier.js` | Clause-aware hiring classifier (negation only suppresses its own clause) |
| `features/feed-monitor/linkedin-post-extract.js` | Pure-DOM post extraction: card boundaries, identity, text, age, metrics |
| `features/feed-monitor/linkedin-hiring-monitor.js` | Feed scanner orchestration: post roots, expansion, metrics, filtering, export archive |
| `features/feed-monitor/content.js` | Adaptive scroll session controller |
| `infrastructure/background.js` | Service worker: history coordination, SPA feed injection |
| `features/popup/` | Popup UI (English-only), export and diagnostics |
| `scripts/` | Packaging (Node, no Python) and the popup preview harness |
| `tests/` | Zero-dependency `node:test` suite |

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open `https://www.linkedin.com/feed/` and pin the popup.

The extension needs no build step; the sources are the runtime.

## Development

```powershell
npm run preview:popup      # render features/popup/popup.html at its real 800x600 size in a plain tab
npm test                   # zero-dependency node:test suite (Node >= 22)
```

### Programmatic feed injection

LinkedIn is a single-page application, so a client-side navigation to `/feed`
never reloads the document and the manifest-declared content scripts would never
run. `background.js` probes each feed tab (`GET_STATUS`) when its URL changes;
if no script answers, it injects the same file list with `chrome.scripting`.
Every content module has a re-entrancy guard, so double injection is harmless.

## Packaging

```bash
npm run package                              # linkedin-feed-scroller.zip
node scripts/package-extension.cjs out.zip   # explicit output path
```

The packager is Node-only (no bash or Python), so it runs unchanged on Windows.
The script writes only files referenced by `manifest.json` (plus the popup) into a
deterministic, runtime-only archive; dev working files under `scripts/` and `tests/`
never ship.

## Privacy

- Post scanning, classification, filtering and history happen locally.
- History is off by default; when enabled it is either session-scoped or stored
  on this machine only, with 7/30/90-day retention and hard local caps.
- Exports are built in the popup and saved by the browser's download pipeline.
- The diagnostic download contains counters and sanitized selector-health text
  only — never post text, emails, or URLs.
- Permissions: `storage` (local state), `scripting` (SPA feed injection fallback
  on linkedin.com), `activeTab` (explicit user gesture), plus a linkedin.com
  host permission for the content scripts.
- Sponsored cards are discarded before extraction, so their text is never
  classified, stored, or exported.
- Distribution is local: the extension is installed unpacked or sideloaded. It is
  **not** published to the Chrome Web Store, and the packager produces only the
  sideload layout.

## License

MIT — see `LICENSE`.
