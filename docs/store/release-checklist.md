# Linkerter 2.0.0 release checklist

**Status: release candidate preparation; not approved for publication.** A green local test run is not a store, legal, LinkedIn, or owner approval.

## Repository gates

Run from a clean checkout with Node 22+ and Python 3:

```sh
npm ci
npm test
bash scripts/verify-superpowers.sh
node --test tests/integration/package.test.js
bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked-a.zip
bash scripts/package-extension.sh --store /tmp/linkerter-store-a.zip
bash scripts/package-extension.sh --unpacked /tmp/linkerter-unpacked-b.zip
bash scripts/package-extension.sh --store /tmp/linkerter-store-b.zip
cmp /tmp/linkerter-unpacked-a.zip /tmp/linkerter-unpacked-b.zip
cmp /tmp/linkerter-store-a.zip /tmp/linkerter-store-b.zip
git diff --check
```

- [ ] All commands pass in the release environment.
- [ ] Both archives contain only the exact runtime allowlist; unpacked is directory-wrapped and store has `manifest.json` at ZIP root.
- [ ] CI passes, including `REQUIRE_CHROME=1 npm run test:browser`.
- [ ] The final audited commit and ZIP SHA-256 hashes are recorded by the release owner.

## Browser and live-site gates

- **NOT RUN in the original authoring sandbox — real Chrome MV3 integration:** no Chrome/Chromium executable was available on 2026-10-22. The harness exists and reports this condition explicitly; it must pass in CI or another controlled Chrome environment before release.
- **NOT RUN — authenticated LinkedIn validation:** no credentials or live member data were used. Validate current English, French, and Arabic DOMs; extraction/expansion; two concurrent feed tabs; scrolling in hidden tabs; stop/reload cleanup; and downloads without auto-resume.
- **NOT RUN — real screen-reader, zoom, focus, color-rendering, and popup-window review:** jsdom/axe and static CSS checks do not replace these checks.
- [ ] Sanitized real-browser evidence and screenshots are reviewed. Do not fabricate screenshots or use private member content.

## Owner-only and external gates

- [ ] **License:** the repository owner chooses and adds an appropriate license. No `LICENSE` is intentionally invented by this remediation.
- [ ] **Publisher:** the owner selects the publisher account, publication channel, pricing/distribution, and release timing.
- [ ] **Policy:** a current human review covers Chrome Web Store requirements, LinkedIn terms, responsible-use messaging, and any legal obligations. No policy compliance or LinkedIn endorsement is claimed.
- [ ] **Privacy URL:** publish the final `PRIVACY.md` at an owner-controlled accessible URL and reconcile the store privacy form with `privacy-practices.md`.
- [ ] **Store approval:** submit the exact reviewed store ZIP and await the actual store decision. A generated ZIP is not an approved release.
- [ ] **Support/security:** confirm the owner’s support contact and private vulnerability-reporting path.

## Release record

- Final commit: _owner to record_
- Unpacked ZIP SHA-256: _owner to record_
- Store ZIP SHA-256: _owner to record_
- Chrome/browser evidence location: _owner to record_
- Authenticated LinkedIn reviewer/date: _owner to record_
- Policy/privacy reviewer/date: _owner to record_
- Publisher approval/date: _owner to record_
