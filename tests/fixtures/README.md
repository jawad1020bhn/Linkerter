# Test fixtures

All fixtures are synthetic and sanitized. They contain no LinkedIn credentials, member data, tracking identifiers, or third-party resources.

- `dom/collapsed.html` is a collapsed English card with a see-more control, a comment control, a hidden remainder span, a canonical permalink with tracking parameters, a lookalike external host, epoch-based age, and localized metric labels.
- `dom/expanded.html` is an expanded French card with `data-id` identity, millisecond epoch age, and French compact metrics.
- `dom/arabic.html` covers Arabic card extraction, including Arabic-Indic digits and Arabic compact metric labels.
- `dom/reposts.html` is a nested reshare used to prove body extraction stays scoped to each selected post and does not merge the outer and inner posts.
- `classifier/core.json` is the original pinned regression corpus (22 cases).
- `classifier/adversarial.json` is the purpose-fit corpus (65 EN/FR/AR cases): real vacancy formats in all three languages, opening-shaped lookalikes for programmes, events, grants, volunteering, and employer praise, negation and mixed-clause cases, recruiter searches, job seekers, advice, and closed posts. Each case may carry a `note` explaining why its label is the contract.
- Both files are consumed by `scripts/evaluate-classifier.js` (via `npm run test:classifier`, asserted by `tests/integration/classifier-corpus.test.js`) and by `scripts/probe-classifier.js` (via `npm run probe:classifier`), which reports per-category precision and recall over the same labels. The gate and the measurement therefore cannot drift apart. A new case must be labeled before it is added, because any mismatch fails the build.
- `browser-feed.html` is the real-Chrome integration fixture. `tests/browser/fixture-server.cjs` substitutes a safe synthetic activity ID and serves it through Chrome request interception at `https://www.linkedin.com/` or `/feed/`. It is deliberately shaped like a current LinkedIn card — an `occludable-update` wrapper around the `article` card, with real `feed-shared-update-v2__actor|__content|__description-wrapper|__control-menu|__social-actions` children — so the browser gate covers post-root deduplication and chrome-free text extraction. Keep that nesting: flattened markup would let a root-selection regression pass, and this fixture is the only place the Chrome `innerText` text path runs (jsdom has no `innerText`).

The browser fixture server never starts a public listener and never contacts LinkedIn. It answers only sanitized `www.linkedin.com` document requests inside the controlled browser and blocks every other origin. An intercepted `/jobs/` document verifies that the extension does not inject outside its declared feed/root routes.

Run the real browser suite with:

```sh
npm run test:browser
```

Set `CHROME_PATH` if Chrome/Chromium is installed in a non-standard location. Set `REQUIRE_CHROME=1` in CI when a missing browser must fail the job. Without that opt-in, an unavailable browser produces an explicit `NOT RUN` result rather than a claimed pass.
