"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

function loadContent({ url = "https://www.linkedin.com/feed/?trk=home#main", scrollHeight = 6000, clientHeight = 500 } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><main><article>Feed content</article></main></body></html>", {
    url, pretendToBeVisual: true, runScripts: "outside-only"
  });
  const { window } = dom;
  const { document } = window;
  const context = dom.getInternalVMContext();
  const listeners = new Set();
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();
  const stats = { timerCalls: 0, rafCalls: 0 };
  const ImmediateDate = Date;
  context.Date = class extends ImmediateDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  Object.defineProperty(context, "performance", { value: { now: () => now }, configurable: true });
  context.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId++;
    const numericDelay = Math.max(0, Number(delay) || 0);
    const timerDelay = numericDelay > 0 ? Math.max(1, Math.ceil(numericDelay)) : 0;
    timers.set(id, { callback, args, due: now + timerDelay });
    stats.timerCalls += 1;
    return id;
  };
  context.clearTimeout = (id) => timers.delete(id);
  context.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, { callback, due: now + 16 });
    stats.rafCalls += 1;
    return id;
  };
  context.cancelAnimationFrame = (id) => frames.delete(id);
  const root = document.scrollingElement || document.documentElement;
  for (const [key, value] of [["scrollHeight", scrollHeight], ["clientHeight", clientHeight]]) {
    Object.defineProperty(root, key, { value, writable: true, configurable: true });
  }
  Object.defineProperty(document.body, "scrollHeight", { value: scrollHeight, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: clientHeight, configurable: true });
  root.scrollTop = 0;
  context.scrollTo = (x, y) => { root.scrollTop = y; };
  context.chrome = { runtime: { onMessage: { addListener(listener) { listeners.add(listener); } } } };
  context.__LI_FEED_SHARED__ = require("../../linkedin-shared.js");
  context.module = { exports: {} };
  context.exports = context.module.exports;
  vm.runInContext(fs.readFileSync(path.resolve("content.js"), "utf8"), context, { filename: "content.js" });

  async function flush() { await new Promise((resolve) => setImmediate(resolve)); }
  async function tick(duration) {
    const end = now + duration;
    let iterations = 0;
    while (true) {
      if (++iterations > 10000) {
        const next = [...timers.values()].sort((a, b) => a.due - b.due)[0];
        throw new Error(`Fake clock did not settle at ${now}/${end}; timers=${timers.size}, frames=${frames.size}, nextDue=${next?.due}, callback=${String(next?.callback).slice(0, 120)}`);
      }
      const dueTimers = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due);
      const dueFrames = [...frames.entries()].filter(([, frame]) => frame.due <= end).sort((a, b) => a[1].due - b[1].due);
      const nextTimer = dueTimers[0];
      const nextFrame = dueFrames[0];
      if (!nextTimer && !nextFrame) break;
      if (nextFrame && (!nextTimer || nextFrame[1].due <= nextTimer[1].due)) {
        const [id, frame] = nextFrame;
        frames.delete(id);
        now = frame.due;
        frame.callback(now);
      } else {
        const [id, timer] = nextTimer;
        timers.delete(id);
        now = timer.due;
        timer.callback(...timer.args);
      }
      await flush();
    }
    now = end;
    await flush();
  }
  async function runUntil(predicate, timeoutMs = 600000) {
    for (let elapsed = 0; elapsed < timeoutMs; elapsed += 1000) {
      if (predicate()) return true;
      await tick(Math.min(1000, timeoutMs - elapsed));
    }
    return predicate();
  }
  function dispatchMessage(message) {
    for (const listener of listeners) {
      let value;
      const returned = listener(message, {}, (response) => { value = response; });
      if (returned === true) throw new Error("Async scroller response is not supported by this harness");
      return value;
    }
    return undefined;
  }
  return { dom, window, document, context, api: context.module.exports, clock: { tick, runUntil, stats, now: () => now }, dispatchMessage };
}

module.exports = { loadContent };
