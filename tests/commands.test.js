"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
const shared = require("../core/linkedin-shared.js");
const { createCommandRouter } = require("../infrastructure/background.js");

function createFakeChrome(options = {}) {
  const calls = [];
  const local = new Map(Object.entries(options.stored || {}));
  const tabs = options.tabs || [{ id: 7, url: "https://www.linkedin.com/feed/" }];
  return {
    calls,
    chromeApi: {
      storage: {
        local: {
          async get(defaults = {}) {
            const output = {};
            if (Array.isArray(defaults)) {
              for (const key of defaults) if (local.has(key)) output[key] = structuredClone(local.get(key));
              return output;
            }
            for (const [key, fallback] of Object.entries(defaults)) {
              output[key] = local.has(key) ? structuredClone(local.get(key)) : fallback;
            }
            return output;
          },
          async set(values) {
            for (const [key, value] of Object.entries(values)) local.set(key, structuredClone(value));
          }
        }
      },
      tabs: {
        async query() { return tabs; },
        async sendMessage(tabId, message) {
          calls.push({ tabId, message });
          if (message.type === "GET_HIRING_STATUS") return options.hiringStatus || { monitoring: false };
          if (message.type === "GET_STATUS") return options.scrollStatus || { state: "stopped" };
          return { ok: true, status: {} };
        }
      },
      commands: { onCommand: { addListener() {} } }
    }
  };
}

test("toggle-monitor starts with sanitized stored preferences when idle", async () => {
  const fake = createFakeChrome({
    stored: {
      hiringPreferences: {
        autoExpand: false, filter: "possible", matchesOnly: true,
        historyMode: "persistent", historyRetentionDays: 7, locale: "de"
      }
    },
    hiringStatus: { monitoring: false }
  });
  const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
  const result = await router.onCommand("toggle-monitor");
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls.map((call) => call.message.type), ["GET_HIRING_STATUS", "START_HIRING_MONITOR"]);
  const start = fake.calls[1].message;
  assert.equal(fake.calls[0].tabId, 7);
  assert.deepEqual(start.options, {
    autoExpand: false,
    filter: "possible",
    matchesOnly: true,
    historyMode: "persistent",
    keepHistory: true,
    historyRetentionDays: 7
  });
});

test("toggle-monitor stops a running monitor without reading preferences", async () => {
  const fake = createFakeChrome({ hiringStatus: { monitoring: true } });
  const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
  await router.onCommand("toggle-monitor");
  assert.deepEqual(fake.calls.map((call) => call.message.type), ["GET_HIRING_STATUS", "STOP_HIRING_MONITOR"]);
});

test("toggle-scroll pauses, resumes or starts based on the live state", async () => {
  for (const [state, expected] of [["running", "PAUSE"], ["paused", "RESUME"], ["stopped", "START"]]) {
    const fake = createFakeChrome({
      scrollStatus: { state },
      stored: { settings: { mode: "fast", maxMinutes: 5, maxSteps: 40, pauseOnInput: false } }
    });
    const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
    await router.onCommand("toggle-scroll");
    assert.deepEqual(fake.calls.map((call) => call.message.type), ["GET_STATUS", expected]);
    if (expected === "START") {
      assert.deepEqual(fake.calls[1].message.settings, {
        mode: "fast", maxMinutes: 5, maxSteps: 40, pauseOnInput: false
      });
    }
  }
});

test("commands refuse to act when the active tab is not a LinkedIn feed", async () => {
  const fake = createFakeChrome({ tabs: [{ id: 3, url: "https://example.com/" }] });
  const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
  for (const command of router.COMMANDS) {
    assert.deepEqual(await router.onCommand(command), { ok: false, error: "open_feed" });
  }
  assert.equal(fake.calls.length, 0);
});

test("unknown commands are rejected and the command list is stable", async () => {
  const fake = createFakeChrome();
  const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
  assert.deepEqual(router.COMMANDS, ["toggle-monitor", "toggle-scroll"]);
  assert.deepEqual(await router.onCommand("_execute_action"), { ok: false, error: "unknown_command" });
  assert.deepEqual(await router.onCommand("nonsense"), { ok: false, error: "unknown_command" });
  assert.equal(fake.calls.length, 0);
});

test("a closed or unresponsive tab does not throw", async () => {
  const fake = createFakeChrome();
  fake.chromeApi.tabs.sendMessage = async () => { throw new Error("Receiving end does not exist"); };
  const router = createCommandRouter({ chromeApi: fake.chromeApi, shared });
  assert.equal(await router.onCommand("toggle-monitor"), null);
});
