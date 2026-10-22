# Support

Linkerter support is handled through the [GitHub repository](https://github.com/jawad1020bhn/Linkerter).

## Before requesting help

1. Confirm you are running version 2.0.0 and Chrome 110 or newer.
2. Refresh the LinkedIn feed after reloading the unpacked extension so current content scripts are attached.
3. Check that the selected tab remains on `https://www.linkedin.com/` or `/feed/`, then review the popup’s target and DOM compatibility messages.
4. Stop the monitor to restore any temporarily hidden feed cards. Export any local data you want to keep before clearing it.
5. Review `PRIVACY.md` and the responsible-use limitations in `README.md`.

## Report a problem

Open a GitHub issue and include, where possible:

- extension and Chrome versions, operating system, and whether the build is unpacked or packaged;
- the route type (root or feed), selected mode/history mode, and precise steps to reproduce;
- expected versus actual behavior and sanitized console/message errors;
- whether the problem occurs in a hidden tab, after reload, with two feed tabs, or with a particular language/RTL layout; and
- the relevant automated test result, if applicable.

Do **not** attach LinkedIn credentials, cookies, private member data, unredacted post exports, or authentication tokens. Use the synthetic browser fixture pattern for reproducible examples whenever possible. LinkedIn DOM changes may require a current maintainer reproduction; mocked/jsdom success alone does not prove live-site compatibility.

For a suspected vulnerability, follow `SECURITY.md` instead of posting sensitive details publicly. No response-time or live-support guarantee is implied.
