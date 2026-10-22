# Security policy

## Supported code

Security fixes are considered for the current repository default branch and the latest release candidate. Version 2.0.0 is the current development candidate; owner publication and store approval are separate gates.

## Report privately

Do not disclose an unpatched vulnerability in a public issue. Use the repository’s GitHub private vulnerability reporting/Security Advisory flow when available. If that feature is not enabled, contact the repository owner through the contact method on their GitHub profile and ask for a private channel. Do not request or send credentials in a report.

Include the affected version/commit, impact, reproduction steps, and a sanitized proof of concept. Remove LinkedIn member data, cookies, tokens, private post exports, and personal information. Do not test against another user’s account or data.

## Security boundaries

Important review areas include:

- safe DOM rendering and LinkedIn-only permalink/author validation;
- CSV formula neutralization and export field minimization;
- retention, deletion, canonical identity, and concurrent storage writes;
- content-script route scope, message validation, and target-tab ownership;
- deterministic runtime-only packaging and the absence of remote code or network transmission; and
- avoidance of engagement automation or collection beyond the documented local workflows.

Development dependencies are not shipped in extension archives. Dependency audit output must be reviewed deliberately; do not apply breaking force-upgrades merely to silence a report.

A maintainer will assess reports when available. This document does not promise a response SLA, bounty, or confirmation timeline.
