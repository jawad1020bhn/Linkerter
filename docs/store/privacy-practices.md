# Store privacy-practices worksheet — draft

This worksheet maps checked-in behavior to topics commonly requested during store submission. It is not a submitted declaration. The publisher must compare it with the current store form and actual final package.

## Data handling

- LinkedIn post text and available metadata are processed locally only after the user starts the hiring monitor.
- Current-run records remain in page memory, capped at 1,000 unique records.
- Post-history storage is off by default. Session mode uses `chrome.storage.session`; persistent mode uses `chrome.storage.local`. Each history store is capped at 500 records / approximately 3 MB and follows the selected retention period while enabled.
- Review labels, preferences, onboarding/locale choices, selected-tab mappings, and diagnostics are stored locally as needed.
- The extension does not transmit collected page data to the developer or third parties, sell or transfer it, or use it for advertising, analytics, creditworthiness, or personalized content.
- JSON/CSV/diagnostic downloads occur only after user action. Full-text and email export fields are off by default on fresh installs.
- Users can clear saved history separately or clear all local data. Removing history preserves review labels; clearing all data removes them.

## Runtime declarations to verify against the final ZIP

- No remote code, external service calls, web fonts, analytics, telemetry, or extension-owned uploads.
- No authentication, cookies, identity, debugger, scripting, native messaging, or downloads permission.
- Host access is declared for `https://www.linkedin.com/*`; content scripts match only LinkedIn root/feed routes.
- No like, comment, connect, message, follow, or other social-graph engagement action.

## Publisher actions

1. Publish the final `PRIVACY.md` at an accessible owner-controlled URL and enter that exact URL in the store form.
2. Reconcile every data-type checkbox with the final package and the store’s current definition of “collection,” including local-only processing and user-initiated downloads.
3. Complete required permission and remote-code justifications without claiming approvals or certifications that have not occurred.
4. Confirm the single-purpose description and limited-use requirements against current store policy.
5. Preserve a copy of the submitted declarations with the release evidence.

Any ambiguity is an open publisher/policy-review gate, not permission to guess in the submission.
