"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

function loadMonitor(html = "<main></main>", options = {}) {
  const { url = "https://www.linkedin.com/feed/", classifier: classifierOverride, manualTimers = false, onSendMessage } = options;
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: "outside-only" });
  const listeners = new Set();
  const storageListeners = new Set();
  const messages = [];
  const timers = new Map();
  let timerId = 0;
  const context = dom.getInternalVMContext();
  if (manualTimers) {
    context.setTimeout = (callback, delay = 0, ...args) => {
      if (Number(delay) === 0) return setTimeout(callback, 0, ...args);
      const id = ++timerId;
      timers.set(id, { callback, delay, args });
      return id;
    };
    context.clearTimeout = (id) => timers.delete(id);
  }
  context.chrome = {
    runtime: {
      onMessage: { addListener(listener) { listeners.add(listener); } },
      async sendMessage(message) {
        messages.push(structuredClone(message));
        return onSendMessage ? onSendMessage(message) : { ok: true, accepted: message.records?.length || 0, count: message.records?.length || 0 };
      }
    },
    storage: { onChanged: { addListener(listener) { storageListeners.add(listener); } } }
  };
  require("../../linkedin-hiring-rules.js");
  require("../../linkedin-hiring-classifier.js");
  context.__LI_FEED_HIRING_CLASSIFIER__ = classifierOverride || globalThis.__LI_FEED_HIRING_CLASSIFIER__;
  context.__LI_FEED_SHARED__ = require("../../linkedin-shared.js");
  context.module = { exports: {} };
  context.exports = context.module.exports;
  const source = fs.readFileSync(path.resolve("linkedin-hiring-monitor.js"), "utf8");
  vm.runInContext(source, context, { filename: "linkedin-hiring-monitor.js" });

  async function dispatchMessage(message) {
    for (const listener of listeners) {
      let resolveResponse;
      let responded = false;
      let synchronousValue;
      const response = new Promise((resolve) => { resolveResponse = resolve; });
      const sendResponse = (value) => { responded = true; synchronousValue = value; resolveResponse(value); };
      const returned = listener(message, {}, sendResponse);
      if (returned === true) return response;
      if (returned && typeof returned.then === "function") return returned;
      if (responded) return synchronousValue;
      return undefined;
    }
    return undefined;
  }
  function dispatchStorageChanged(changes, areaName = "local") {
    for (const listener of storageListeners) listener(changes, areaName);
  }
  async function runTimer(id) {
    const timer = timers.get(id);
    if (!timer) return false;
    timers.delete(id);
    timer.callback(...timer.args);
    await new Promise((resolve) => setImmediate(resolve));
    return true;
  }
  return {
    dom, window: dom.window, document: dom.window.document, api: context.module.exports,
    listeners, messages, timers, dispatchMessage, dispatchStorageChanged, runTimer
  };
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", "dom", name), "utf8");
}

module.exports = { loadMonitor, fixture };
