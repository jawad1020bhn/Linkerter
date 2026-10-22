"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor } = require("../helpers/load-monitor.js");

const BASE = Date.parse("2026-10-22T10:00:00Z");

function mixedArchive() {
  // Observation order deliberately interleaves categories, as a real feed scan does.
  return [
    { id: "seeker", category: "job_seeker", fullText: "Open to work, seeking referrals", author: { name: "Seeker" }, lastSeenAt: new Date(BASE + 1000).toISOString(), postAge: { label: "1d", ageDaysApprox: 1 } },
    { id: "filled", category: "closed", fullText: "This role has been filled", author: { name: "Old" }, lastSeenAt: new Date(BASE + 2000).toISOString(), postAge: { label: "3w", ageDaysApprox: 21 } },
    { id: "advice", category: "hiring_discussion", fullText: "Hiring tips for managers", author: { name: "Coach" }, lastSeenAt: new Date(BASE + 3000).toISOString() },
    { id: "maybe", category: "possible", fullText: "#hiring", author: { name: "Tagger" }, lastSeenAt: new Date(BASE + 4000).toISOString() },
    { id: "opening-new", category: "open_role", fullText: "We are hiring a Senior Engineer. Apply now.", author: { name: "Employer" }, lastSeenAt: new Date(BASE + 5000).toISOString(), postAge: { label: "2h", ageDaysApprox: 0.08 } },
    { id: "recruiter", category: "recruiter_search", fullText: "Looking for candidates for a client role", author: { name: "Recruiter" }, lastSeenAt: new Date(BASE + 6000).toISOString() },
    { id: "opening-old", category: "open_role", fullText: "We are hiring a Support Engineer.", author: { name: "Other" }, lastSeenAt: new Date(BASE + 7000).toISOString(), postAge: { label: "11mo", ageDaysApprox: 335 } }
  ];
}

test("the default result order surfaces active openings first without hiding other categories", () => {
  const { api } = loadMonitor();
  const page = api.queryRecords(mixedArchive(), { filter: "all", sort: "relevance", page: 1, pageSize: 25 });
  assert.equal(page.total, 7, "every detected category stays visible in the default view");
  assert.deepEqual([...page.results.map((record) => record.category)].slice(0, 2), ["open_role", "open_role"]);
  assert.deepEqual(
    [...page.results.map((record) => record.id)],
    ["opening-new", "opening-old", "recruiter", "maybe", "seeker", "advice", "filled"]
  );
});

test("openings are ordered newest-observed within their group and chronological sorts stay chronological", () => {
  const { api } = loadMonitor();
  const newest = api.queryRecords(mixedArchive(), { sort: "newest", page: 1, pageSize: 25 });
  assert.deepEqual([...newest.results.map((record) => record.id)], ["opening-old", "recruiter", "opening-new", "maybe", "advice", "filled", "seeker"]);
  const oldest = api.queryRecords(mixedArchive(), { sort: "oldest", page: 1, pageSize: 25 });
  assert.deepEqual([...oldest.results.map((record) => record.id)], ["seeker", "filled", "advice", "maybe", "opening-new", "recruiter", "opening-old"]);
  const unknownSort = api.queryRecords(mixedArchive(), { sort: "nonsense", page: 1, pageSize: 25 });
  assert.equal(unknownSort.results[0].category, "open_role", "an unrecognized sort falls back to openings-first");
});

test("an explicit category filter still returns only that category", () => {
  const { api } = loadMonitor();
  const seekers = api.queryRecords(mixedArchive(), { filter: "job_seeker", sort: "relevance", page: 1, pageSize: 25 });
  assert.equal(seekers.total, 1);
  assert.equal(seekers.results[0].id, "seeker");
  const openings = api.queryRecords(mixedArchive(), { filter: "open_role", sort: "relevance", page: 1, pageSize: 25 });
  assert.equal(openings.total, 2);
});

test("post age reaches the result summary and flags stale openings", () => {
  const { api } = loadMonitor();
  const page = api.queryRecords(mixedArchive(), { sort: "relevance", page: 1, pageSize: 25 });
  const byId = Object.fromEntries(page.results.map((record) => [record.id, record]));
  assert.equal(byId["opening-new"].postAge.label, "2h");
  assert.equal(byId["opening-new"].stale, false);
  assert.equal(byId["opening-old"].postAge.ageDaysApprox, 335);
  assert.equal(byId["opening-old"].stale, true, "an opening posted 11 months ago must be flagged as possibly no longer active");
  assert.equal(byId["advice"].stale, false);
  assert.equal(byId["advice"].postAge, null, "records without a DOM-visible age report null rather than guessing");
});

test("relevance ordering paginates openings across page boundaries", () => {
  const { api } = loadMonitor();
  const first = api.queryRecords(mixedArchive(), { sort: "relevance", page: 1, pageSize: 2 });
  const second = api.queryRecords(mixedArchive(), { sort: "relevance", page: 2, pageSize: 2 });
  assert.deepEqual([...first.results.map((record) => record.id)], ["opening-new", "opening-old"]);
  assert.deepEqual([...second.results.map((record) => record.id)], ["recruiter", "maybe"]);
  assert.equal(first.hasMore, true);
  assert.equal(second.total, 7);
});
