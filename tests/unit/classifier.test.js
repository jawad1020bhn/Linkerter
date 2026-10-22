"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../../linkedin-hiring-rules.js");
require("../../linkedin-hiring-classifier.js");
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;

const category = (text, hrefs = []) => classifier.classify(text, { hrefs }).category;

test("negated openings never become positive hiring detections", () => {
  assert.equal(category("We are not currently hiring for any roles."), "closed");
  assert.equal(category("We are not actively hiring. Apply now."), "closed");
  assert.equal(category("No longer recruiting for this role."), "closed");
  assert.equal(category("Nous ne recrutons pas."), "closed");
  assert.equal(category("لا توجد وظائف شاغرة"), "closed");
});

test("a later independent positive clause survives an earlier closed clause", () => {
  const result = classifier.classify("No open roles here, but our partner has open roles in Paris.");
  assert.equal(result.category, "open_role");
  assert.equal(result.signals.closed, true);
  assert.equal(result.signals.activeOpening, true);
});

test("unambiguous opening and recruiter phrases receive their specific categories", () => {
  assert.equal(category("We are hiring!"), "open_role");
  assert.equal(category("Nous recrutons un développeur."), "open_role");
  assert.equal(category("نحن نوظف"), "open_role");
  assert.equal(category("Looking for candidates."), "recruiter_search");
});

test("generic application CTAs require independent hiring context", () => {
  assert.equal(category("Apply now for our new credit card."), "none");
  assert.equal(category("New job opportunity. Apply now."), "possible");
  assert.equal(category("We are hiring! Apply now."), "open_role");
});

test("job titles, contact details, and weak regional text alone stay unclassified", () => {
  assert.equal(category("Senior Software Engineer"), "none");
  assert.equal(category("Contact me at person@gmail.com"), "none");
  assert.equal(category("rana nlawjo 3la"), "none");
});

test("negated job-seeker and advice phrases do not create positive related categories", () => {
  assert.equal(category("I am not open to work."), "none");
  assert.equal(category("This is not hiring advice or hiring tips."), "none");
});

test("hashtags and job links retain their documented low-confidence behavior", () => {
  assert.equal(category("#hiring"), "possible");
  assert.equal(category("More information", ["https://example.com/jobs/123"]), "possible");
  assert.equal(category("More information", ["https://example.com/about"]), "none");
});

test("classification exports every contributing signal group and full evidence", () => {
  const result = classifier.classify("We are hiring! Apply now. Send your CV to jobs@example.com #hiring", {
    hrefs: ["mailto:jobs@example.com", "https://example.com/jobs/123"]
  });
  assert.equal(result.category, "open_role");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.applicationCta, true);
  assert.equal(result.signals.genericJobTerms, true);
  assert.equal(result.signals.recruiterTerms, false);
  assert.equal(result.signals.contactCues, true);
  assert.equal(result.signals.emailLink, true);
  assert.equal(result.signals.jobLink, true);
  assert.equal(result.signals.hashtag, true);
  assert.ok(result.evidence.length >= 5);
  assert.ok(result.evidence.some((item) => item.includes("Application cue")));
});

test("email extraction keeps ordinary and obfuscated addresses", () => {
  assert.deepEqual(classifier.extractEmails("Email person [at] example [dot] com"), ["person@example.com"]);
  assert.deepEqual(classifier.extractEmails("Email PERSON@example.com"), ["person@example.com"]);
});
