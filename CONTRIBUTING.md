# Contributing to Linkerter

Contributions should preserve the extension’s local-only, read-only-social-graph, zero-runtime-dependency design.

## Development setup

Use Node.js 22 or newer and Python 3 for release packaging:

```sh
npm ci
npm test
npm run probe:classifier -- --strict
npm run probe:feed -- --strict
bash scripts/verify-superpowers.sh
node --test tests/integration/package.test.js
```

`npm run probe:classifier` reports per-category precision and recall over the labeled corpus in `tests/fixtures/classifier/`; `npm run probe:feed` proves that one realistic LinkedIn card yields one post root, one archive record, and no page chrome in the extracted text. Both are measurement tools by default and gates with `--strict`; CI runs them strict. When you change a rule, a threshold, or root selection, run both and read the mismatch list before tuning anything else.

The npm packages are development-only test tools. Do not add them to the extension runtime or manifest.

For actual Chrome integration:

```sh
CHROME_PATH=/path/to/chrome npm run test:browser
```

The browser suite uses synthetic intercepted HTTPS fixtures and requires no LinkedIn account. If no browser is installed it reports `NOT RUN`; never convert that result into a pass. CI sets `REQUIRE_CHROME=1` so a missing browser fails the required gate. Authenticated LinkedIn checks are a separate maintainer/release activity and must not use test credentials in the repository.

## Popup layout preview

jsdom performs no layout, so CSS changes are invisible to the test suite. To review them without loading the extension:

```sh
npm run preview:popup                        # http://localhost:4173
PREVIEW_REF=<commit> npm run preview:popup    # compare against another stylesheet
```

The preview serves the real `popup.html` and `popup.css` inside an 800×600 frame — Chrome's hard popup ceiling — driven by a synthetic `chrome.*` stub (`scripts/preview-stub.js`) with in-memory records. It never contacts LinkedIn and is not part of the packaged extension. The **Before this change** link renders the stylesheet at `PREVIEW_REF` (default `60ab86a`, the commit before the popup was enlarged) so a layout change can be A/B'd in one click.

Keep the popup within 800×600: Chrome clamps anything larger, so extra width or height silently becomes a scrollbar. `tests/dom/accessibility.test.js` still enforces the stylesheet's text-level invariants — no font below 12px, a single `html, body` rule, `:focus-visible`, `prefers-reduced-motion: reduce`, the `[dir="rtl"]` rules, and `overflow-wrap: anywhere` — and the contrast pairs come from the `:root` colour tokens.

## Making changes

1. Read the relevant audit item and remediation plan before changing behavior.
2. Add a focused regression test and capture its failure before the fix. Prefer real runtime scripts through the existing Chrome/jsdom harnesses over testing copied implementations.
3. Make the smallest coherent change. Preserve canonical IDs, schema-v2 export fields, history-mode semantics, safe link validation, and backward-compatible preferences unless a migration is included.
4. Test EN/FR/AR and RTL behavior when changing classifier or popup content. Keep dynamic text in local dictionaries and untrusted data in `textContent`/safe DOM properties.
5. Test concurrent tabs, stale responses, reload/stop cleanup, hidden tabs, and storage failures when touching those workflows.
6. Update documentation and the changelog when user-visible behavior or data practices change.

Do not add analytics, external AI/service requests, extension-owned uploads, engagement automation, remote code, or broad permissions without an explicit new design and privacy review. Do not use `innerHTML`, `eval`, or `new Function` for untrusted content.

## Tests and release artifacts

Run the full suite rather than only a focused test before submitting:

```sh
npm test
bash scripts/verify-superpowers.sh
node --test tests/integration/package.test.js
bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked.zip
bash scripts/package-extension.sh --store /tmp/linkerter-store.zip
git diff --check
```

Generated ZIPs and test evidence are ignored. Branded icons are deterministic; regenerate them only for an intentional design change with `node scripts/generate-icons.cjs`. Do not commit fabricated browser screenshots or live LinkedIn member data.

## Repository workflow

Use clear, scoped commits and explain any remaining `NOT RUN` or external gates in the pull request. This repository includes the obra/superpowers workflow and verifier; keep its canonical skill copies synchronized deliberately rather than overwriting local Arena-specific additions.

The vendored obra/superpowers installation is development tooling, is not included in the extension runtime archives, and retains its own MIT license in `.agents/superpowers/LICENSE`.

Linkerter’s root license and publisher decisions belong to the repository owner. Do not add a root license, claim store approval, or publish a release on the owner’s behalf.
