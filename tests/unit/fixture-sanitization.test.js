"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Fixtures built from real exported feed data. Any new fixture derived from a real LinkedIn
// session must be added here: the checks below are the sanitization policy in
// tests/fixtures/README.md made executable. Synthetic fixtures are not covered, because they
// deliberately contain lookalike hosts, tracking parameters and third-party applicant-tracking
// domains in order to exercise canonicalization and job-link detection.
const REAL_DERIVED_FIXTURES = [
  "tests/fixtures/classifier/real-world.json",
  "tests/fixtures/dom/feed-2026.html"
];

const RESERVED_HOST = /(?:^|\.)(?:example|invalid|test|localhost)$/i;
const RESERVED_EMAIL = /\.(?:example|test|invalid|localhost)$/i;
const PLACEHOLDER_SLUG = /^(?:auteur|entreprise|candidate|recruteur|acme|company|synthetic|member|linkerter-fixture)(?:-[A-Za-z0-9]+)?$/i;
// Member-level tracking identifiers. `origin=HASH_TAG_FROM_FEED` is LinkedIn's own navigation
// hint and carries no member data, so it is not in this list.
const TRACKING_PARAM = /[?&](?:trackingId|urlhash|li_fat_id|mcid|trk|utm_[A-Za-z_]+)=/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;
const HOST = /https?:\\?\/\\?\/([^/\s"'<>\\]+)/g;
const PROFILE_SLUG = /linkedin\.com\/(?:in|company)\/([^/?#\s"'<>\\]+)/g;
const SAFETY_REDIRECT = /linkedin\.com\/safety\/go\//;
const PHONE = /(?<!\d)(?:\+?213|0)[\s.-]?[5-7](?:[\s.-]?\d){8}(?!\d)|(?<!\d)\+\d{1,3}[\s.-]?\d{6,}(?!\d)/g;
// A real member URL ends in that member's numeric or hex id; a placeholder never does.
const REAL_MEMBER_SLUG = /linkedin\.com\/in\/[^/?#\s"'<>\\]*(?:-\d{6,}|[0-9a-f]{8,})(?![\dA-Za-z])/;

function collectFixtures(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFixtures(full));
    else out.push(full);
  }
  return out;
}

for (const file of REAL_DERIVED_FIXTURES) {
  test(`real-derived fixture is pseudonymized: ${file}`, () => {
    assert.ok(fs.existsSync(file), `${file} must exist; update REAL_DERIVED_FIXTURES if it was renamed`);
    const source = fs.readFileSync(file, "utf8");

    const emails = [...new Set([...source.matchAll(EMAIL)].map((match) => match[0]))];
    assert.deepEqual(emails.filter((email) => !RESERVED_EMAIL.test(email)), [],
      "an email address outside a reserved example domain identifies a real person or organization");

    const hosts = [...new Set([...source.matchAll(HOST)].map((match) => match[1].replace(/^www\./, "")))];
    assert.deepEqual(hosts.filter((host) => host !== "linkedin.com" && !RESERVED_HOST.test(host)), [],
      "a third-party host identifies a real campaign, shortlink or booking page");

    const slugs = [...new Set([...source.matchAll(PROFILE_SLUG)].map((match) => match[1]))];
    assert.deepEqual(slugs.filter((slug) => !PLACEHOLDER_SLUG.test(slug)), [],
      "a profile or company slug must be a placeholder, never a real member or organization");

    assert.ok(!SAFETY_REDIRECT.test(source),
      "a LinkedIn safety redirect embeds a real third-party destination plus a tracking hash");
    assert.ok(!TRACKING_PARAM.test(source), "member-level tracking identifiers must not be committed");
    assert.deepEqual([...new Set([...source.matchAll(PHONE)].map((match) => match[0]))], [],
      "a phone number is personal data");
  });
}

test("no fixture carries a real LinkedIn member id, declared or not", () => {
  const offenders = [];
  for (const file of [...collectFixtures("tests/fixtures"), ...collectFixtures("tests/browser")]) {
    const source = fs.readFileSync(file, "utf8");
    if (REAL_MEMBER_SLUG.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    "a profile URL ending in a numeric or hex member id came from a real account");
});

test("real-derived fixtures are documented with the sanitization policy", () => {
  const readme = fs.readFileSync("tests/fixtures/README.md", "utf8");
  for (const file of REAL_DERIVED_FIXTURES) {
    assert.ok(readme.includes(path.basename(file)), `${file} must be listed in tests/fixtures/README.md`);
  }
  assert.match(readme, /Sanitization policy for real-world material/,
    "the policy that governs real-derived fixtures must stay documented");
});
