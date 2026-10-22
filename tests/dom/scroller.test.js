"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadContent } = require("../helpers/load-content.js");

test("all adaptive modes use shared sanitization and hard preset caps", () => {
  const { api } = loadContent();
  for (const mode of ["standard", "fast", "super_fast"]) assert.equal(api.sanitizeSettings({ mode }).mode, mode);
  assert.equal(api.sanitizeSettings({ mode: "human" }).mode, "standard");
  assert.equal(api.sanitizeSettings({ mode: "super_safe" }).mode, "super_fast");
  assert.deepEqual({ ...api.sanitizeSettings({ mode: "super_fast", maxMinutes: 60, maxSteps: 500, pauseOnInput: false }) }, {
    mode: "super_fast", maxMinutes: 15, maxSteps: 120, pauseOnInput: true
  });
});

test("root and feed query/hash routes match while unsupported routes do not", () => {
  for (const url of [
    "https://www.linkedin.com/", "https://www.linkedin.com/?trk=home",
    "https://www.linkedin.com/feed", "https://www.linkedin.com/feed/?follow=true#main",
    "https://www.linkedin.com/feed/following/#main"
  ]) assert.equal(loadContent({ url }).api.isFeedPage(), true, url);
  for (const url of ["https://www.linkedin.com/jobs/", "https://www.linkedin.com/feedbad/", "http://www.linkedin.com/feed/"]) {
    assert.equal(loadContent({ url }).api.isFeedPage(), false, url);
  }
});

test("paused time is excluded and user input requires an explicit resume", async () => {
  const { api, window, clock } = loadContent();
  api.startSession({ mode: "standard", maxMinutes: 5, maxSteps: 40 });
  await clock.tick(0);
  api.pauseSession("Paused by you.");
  await clock.tick(5000);
  assert.equal(api.getStatus().elapsedMs, 0);
  assert.equal(api.resumeSession(), true);
  window.dispatchEvent(new window.Event("wheel"));
  assert.equal(api.getStatus().state, "paused");
  assert.match(api.getStatus().reason, /input/i);
  api.stopSession("done");
});

test("expansion pause clearly requires manual resume and never auto-resumes", async () => {
  const { api, window, clock, dispatchMessage } = loadContent();
  api.startSession({ mode: "standard" });
  await clock.tick(0);
  window.dispatchEvent(new window.Event("li-feed-auto-expand-start"));
  assert.equal(api.getStatus().state, "paused");
  assert.match(api.getStatus().reason, /manual resume/i);
  window.dispatchEvent(new window.Event("li-feed-auto-expand-end"));
  assert.equal(api.getStatus().state, "paused");
  const response = dispatchMessage({ type: "RESUME" });
  assert.equal(response.ok, true);
  assert.equal(response.status.state, "running");
  api.stopSession("done");
});

test("hidden tabs use timer frames and continue within caps", async () => {
  const { api, document, clock } = loadContent();
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startSession({ mode: "super_fast", maxMinutes: 5, maxSteps: 40 });
  await clock.tick(3000);
  assert.equal(clock.stats.rafCalls, 0);
  assert.ok(clock.stats.timerCalls > 0);
  assert.ok(api.getStatus().steps > 0);
  api.stopSession("done");
});

test("no movement stops with an actionable reason", async () => {
  const { api, clock } = loadContent({ scrollHeight: 500, clientHeight: 500 });
  api.startSession({ mode: "super_fast", maxMinutes: 5, maxSteps: 40 });
  const stopped = await clock.runUntil(() => api.getStatus().state === "stopped", 30000);
  assert.equal(stopped, true);
  assert.match(api.getStatus().reason, /no feed movement|no scrollable feed area/i);
});

test("step caps stop at the exact sanitized limit", async () => {
  const { api, clock } = loadContent({ scrollHeight: 1000000 });
  api.startSession({ mode: "super_fast", maxMinutes: 5, maxSteps: 40 });
  const stopped = await clock.runUntil(() => api.getStatus().state === "stopped", 600000);
  assert.equal(stopped, true);
  assert.equal(api.getStatus().steps, 40);
  assert.match(api.getStatus().reason, /scroll-step limit/i);
});

test("disconnected scroll targets cancel cleanly and fall back without hanging", async () => {
  const { api, document, clock } = loadContent({ scrollHeight: 500, clientHeight: 500 });
  const target = document.createElement("div");
  target.style.overflowY = "auto";
  Object.defineProperties(target, {
    scrollHeight: { value: 2000, configurable: true },
    clientHeight: { value: 400, configurable: true }
  });
  target.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400 });
  document.querySelector("main").appendChild(target);
  api.startSession({ mode: "super_fast", maxMinutes: 5, maxSteps: 40 });
  target.remove();
  const stopped = await clock.runUntil(() => api.getStatus().state === "stopped", 30000);
  assert.equal(stopped, true);
  assert.match(api.getStatus().reason, /no feed movement|no scrollable feed area/i);
});

test("a reloaded content script never restores a running session", async () => {
  const first = loadContent();
  first.api.startSession({ mode: "standard" });
  await first.clock.tick(0);
  assert.equal(first.api.getStatus().state, "running");
  const second = loadContent();
  assert.equal(second.api.getStatus().state, "stopped");
  assert.equal(second.api.getStatus().steps, 0);
  first.api.stopSession("done");
});
