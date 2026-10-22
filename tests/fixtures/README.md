# Test fixtures

All fixtures are sanitized and contain no LinkedIn credentials, member data, tracking identifiers, or third-party resources. Every fixture except `classifier/real-world.json` is synthetic. That one corpus is derived from a real authenticated export and is pseudonymized under the policy at the bottom of this file: no real names, emails, phone numbers, profile URLs, company names or member IDs.

- `dom/collapsed.html` is a collapsed English card with a see-more control, a comment control, a hidden remainder span, a canonical permalink with tracking parameters, a lookalike external host, epoch-based age, and localized metric labels.
- `dom/expanded.html` is an expanded French card with `data-id` identity, millisecond epoch age, and French compact metrics.
- `dom/arabic.html` covers Arabic card extraction, including Arabic-Indic digits and Arabic compact metric labels.
- `dom/reposts.html` is a nested reshare used to prove body extraction stays scoped to each selected post and does not merge the outer and inner posts.
- `dom/feed-2026.html` is the card shape observed in the first authenticated export (2026-10-22), not an idealized card: no `data-urn` anywhere (the post URN survives only in the permalink anchor), `update-components-*` body and actor markup, an actor headline and absolute French timestamp, reaction counts and a comment thread inside the card, a reactor wrapper around a shared post, and a sponsored placement. `tests/dom/monitor-feed-2026.test.js` asserts identity, authorship, chrome-free text, completeness, publish date, reshare deduplication, engagement scoping and sponsored exclusion against it. Keep the observed markup: replacing it with the convenient shape is exactly how the 32/32 extraction failures went unnoticed.
- `classifier/core.json` is the original pinned regression corpus (22 cases).
- `classifier/adversarial.json` is the purpose-fit corpus (65 EN/FR/AR cases): real vacancy formats in all three languages, opening-shaped lookalikes for programmes, events, grants, volunteering, and employer praise, negation and mixed-clause cases, recruiter searches, job seekers, advice, and closed posts. Each case may carry a `note` explaining why its label is the contract.
- `classifier/real-world.json` is a 26-case corpus taken from that export (EN/FR/AR). Each case carries a `note` explaining why its label is the contract and an `observed` block recording what the shipped run reported, so the corpus doubles as the before/after measurement: the run was correct on 13 of the 26 and the current classifier is correct on all 26. Six export records are excluded because the run stored no usable post text for them.
- All three files are consumed by `scripts/evaluate-classifier.js` (via `npm run test:classifier`, asserted by `tests/integration/classifier-corpus.test.js`) and by `scripts/probe-classifier.js` (via `npm run probe:classifier`), which reports per-category precision and recall over the same labels. The gate and the measurement therefore cannot drift apart. A new case must be labeled before it is added, because any mismatch fails the build.
- `browser-feed.html` is the real-Chrome integration fixture. `tests/browser/fixture-server.cjs` substitutes a safe synthetic activity ID and serves it through Chrome request interception at `https://www.linkedin.com/` or `/feed/`. It is deliberately shaped like a current LinkedIn card — an `occludable-update` wrapper around the `article` card, with real `feed-shared-update-v2__actor|__content|__description-wrapper|__control-menu|__social-actions` children — so the browser gate covers post-root deduplication and chrome-free text extraction. Keep that nesting: flattened markup would let a root-selection regression pass, and this fixture is the only place the Chrome `innerText` text path runs (jsdom has no `innerText`).

The browser fixture server never starts a public listener and never contacts LinkedIn. It answers only sanitized `www.linkedin.com` document requests inside the controlled browser and blocks every other origin. An intercepted `/jobs/` document verifies that the extension does not inject outside its declared feed/root routes.

Run the real browser suite with:

```sh
npm run test:browser
```

Set `CHROME_PATH` if Chrome/Chromium is installed in a non-standard location. Set `REQUIRE_CHROME=1` in CI when a missing browser must fail the job. Without that opt-in, an unavailable browser produces an explicit `NOT RUN` result rather than a claimed pass.

## Sanitization policy for real-world material

Fixtures derived from a real feed are pseudonymized before they are committed, and the pseudonymization is part of the fixture, not a cleanup step:

- Author and member names are replaced with placeholders (`Auteur A`, `Auteur W`, `Page Partage`).
- Company and organization names are replaced with generic ones (`SARL Alpha`, `entreprise-eta`).
- Email addresses are rewritten to a reserved example domain (`recrutement@entreprise-alpha.example`) and phone numbers are removed.
- Profile URLs, member IDs, tracking parameters and activity URNs are replaced with synthetic values.
- Post text keeps the hiring phrasing under test and is truncated at the same `... plus` marker the export carried, so completeness behaviour is exercised as it was observed.

Nothing that identifies a real person or organization may be added to a fixture. A case that cannot be sanitized is dropped rather than committed.

The policy is executable. `tests/unit/fixture-sanitization.test.js` fails the build if a real-derived fixture contains an email outside a reserved example domain, a profile or company slug that is not a placeholder, a third-party host, a LinkedIn safety redirect (which embeds a real destination and a tracking hash), a member tracking parameter, or a phone number — and it fails for *any* fixture, declared or not, that carries a profile URL ending in a real numeric or hex member id. A new fixture derived from a real export must be added to that test's `REAL_DERIVED_FIXTURES` list.
