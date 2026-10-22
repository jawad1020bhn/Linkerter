# Test fixtures

All fixtures are synthetic and sanitized. They contain no LinkedIn credentials, member data, tracking identifiers, or third-party resources.

- `collapsed-post.html` and `media-post.html` are DOM extraction fixtures.
- `dear-sir-polarity.html` covers multilingual sentiment/polarity cases.
- `browser-feed.html` is the real-Chrome integration fixture. `tests/browser/fixture-server.cjs` substitutes a safe synthetic activity ID and serves it through Chrome request interception at `https://www.linkedin.com/` or `/feed/`.

The browser fixture server never starts a public listener and never contacts LinkedIn. It answers only sanitized `www.linkedin.com` document requests inside the controlled browser and blocks every other origin. An intercepted `/jobs/` document verifies that the extension does not inject outside its declared feed/root routes.

Run the real browser suite with:

```sh
npm run test:browser
```

Set `CHROME_PATH` if Chrome/Chromium is installed in a non-standard location. Set `REQUIRE_CHROME=1` in CI when a missing browser must fail the job. Without that opt-in, an unavailable browser produces an explicit `NOT RUN` result rather than a claimed pass.
