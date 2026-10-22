"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMonitor, fixture } = require("../helpers/load-monitor.js");

test("expansion succeeds only after an observed body/control change", async () => {
  const { document, api } = loadMonitor(fixture("collapsed.html"));
  const root = document.querySelector("#post");
  const body = document.querySelector("#body");
  const control = document.querySelector("#expand");
  const details = api.getPostTextDetails(root);
  control.addEventListener("click", () => {
    body.querySelector(".feed-shared-text").textContent = "We are hiring a platform engineer. Full expanded text is now available.";
    control.setAttribute("aria-label", "See less");
    control.textContent = "See less";
  });
  const outcome = await api.expandPost(root, details, { maxAttempts: 1, waitMs: 0 });
  assert.equal(outcome.status, "expanded");
  assert.equal(outcome.attempts, 1);
  assert.equal(api.getPostTextDetails(root).partial, false);
});

test("failed expansion is bounded and never clicks an unrelated replacement", async () => {
  const { document, api } = loadMonitor(fixture("collapsed.html"));
  const root = document.querySelector("#post");
  const control = document.querySelector("#expand");
  let clicks = 0;
  control.addEventListener("click", () => { clicks += 1; });
  const outcome = await api.expandPost(root, api.getPostTextDetails(root), { maxAttempts: 2, waitMs: 0 });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.attempts, 2);
  assert.equal(clicks, 2);
  const after = await api.expandPost(root, api.getPostTextDetails(root), { maxAttempts: 2, waitMs: 0, state: outcome.state });
  assert.equal(after.status, "failed");
  assert.equal(clicks, 2);
});

test("stale extension-owned filter artifacts are reconciled on initialization", () => {
  const { document, api } = loadMonitor("<main><article data-li-feed-hiring-filter-hidden='true'>Visible</article></main><style data-li-feed-hiring-filter-style='true'></style>");
  api.reconcileFilterArtifacts(document);
  assert.equal(document.querySelector("article").hasAttribute("data-li-feed-hiring-filter-hidden"), false);
  assert.equal(document.querySelector("[data-li-feed-hiring-filter-style]"), null);
});
