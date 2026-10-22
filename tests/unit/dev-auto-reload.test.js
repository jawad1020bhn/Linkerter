"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDevAutoReload,
  DEV_STAMP_FILE,
  DEV_APPLIED_COMMIT_KEY,
  DEV_PENDING_TAB_RELOAD_KEY
} = require("../../background.js");

function storageArea(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) {
      if (key === null || key === undefined) return Object.fromEntries(data);
      if (typeof key === "string") return data.has(key) ? { [key]: data.get(key) } : {};
      const keys = Array.isArray(key) ? key : Object.keys(key);
      return Object.fromEntries(keys.filter((entry) => data.has(entry)).map((entry) => [entry, data.get(entry)]));
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    },
    async remove(key) {
      for (const entry of Array.isArray(key) ? key : [key]) data.delete(entry);
    }
  };
}

function harness({ installType = "development", stamp = null, storage = {}, tabs = [] } = {}) {
  const calls = { reload: 0, fetched: [], tabReloads: [], queries: [] };
  const localStorage = storageArea(storage);
  const chromeApi = {
    runtime: {
      id: "test-extension",
      getURL: (relative) => `chrome-extension://test-extension/${relative}`,
      reload() {
        calls.reload += 1;
      }
    },
    management: {
      async getSelf() {
        return { id: "test-extension", installType };
      }
    },
    storage: { local: localStorage },
    tabs: {
      async query(query) {
        calls.queries.push(query);
        return tabs;
      },
      async reload(tabId) {
        calls.tabReloads.push(tabId);
      }
    }
  };
  const fetchImpl = async (url) => {
    calls.fetched.push(url);
    if (!stamp) return { ok: false, status: 404, async json() { throw new Error("no body"); } };
    return { ok: true, status: 200, async json() { return stamp; } };
  };
  const reloader = createDevAutoReload({ chromeApi, fetch: fetchImpl, intervalMs: 10 });
  return { chromeApi, localStorage, calls, reloader };
}

test("auto-reload is inert outside an unpacked development install", async () => {
  const { calls, reloader } = harness({ installType: "normal", stamp: { commit: "abc" } });
  assert.equal(await reloader.start(), false);
  reloader.stop();
  assert.deepEqual(calls.fetched, []);
  assert.equal(calls.reload, 0);

  const broken = createDevAutoReload({ chromeApi: { runtime: {} }, fetch: async () => ({ ok: true, json: async () => ({ commit: "x" }) }) });
  assert.equal(await broken.start(), false);
  assert.equal(await broken.check(), "skipped");
});

test("a new stamp reloads the extension exactly once per commit", async () => {
  const stamp = { commit: "c".repeat(40), reloadTabs: true };
  const { calls, localStorage, reloader } = harness({ stamp });

  assert.equal(await reloader.check(), "reloaded");
  assert.equal(calls.reload, 1);
  assert.equal(localStorage.data.get(DEV_APPLIED_COMMIT_KEY), stamp.commit);
  assert.equal(localStorage.data.get(DEV_PENDING_TAB_RELOAD_KEY), true);
  assert.equal(calls.fetched[0], `chrome-extension://test-extension/${DEV_STAMP_FILE}`);

  assert.equal(await reloader.check(), "unchanged");
  assert.equal(calls.reload, 1);
});

test("a stale or absent stamp does nothing", async () => {
  const missing = harness({ stamp: null });
  assert.equal(await missing.reloader.check(), "no-stamp");
  assert.equal(missing.calls.reload, 0);

  const same = harness({ stamp: { commit: "d".repeat(40) }, storage: { [DEV_APPLIED_COMMIT_KEY]: "d".repeat(40) } });
  assert.equal(await same.reloader.check(), "unchanged");
  assert.equal(same.calls.reload, 0);
});

test("start reloads the LinkedIn tabs left open by the previous reload, then polls", async () => {
  const stamp = { commit: "e".repeat(40), reloadTabs: false };
  const { calls, localStorage, reloader } = harness({
    stamp,
    storage: { [DEV_PENDING_TAB_RELOAD_KEY]: true },
    tabs: [{ id: 7, url: "https://www.linkedin.com/feed/" }, { id: 8, url: "https://www.linkedin.com/feed/update/1" }]
  });

  assert.equal(await reloader.start(), true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  reloader.stop();

  assert.deepEqual(calls.queries, [{ url: ["https://www.linkedin.com/*"] }]);
  assert.deepEqual(calls.tabReloads, [7, 8]);
  assert.equal(localStorage.data.get(DEV_PENDING_TAB_RELOAD_KEY), false);
  assert.equal(localStorage.data.get(DEV_APPLIED_COMMIT_KEY), stamp.commit);
  assert.equal(calls.reload, 1);
});

test("tab reload is opt-out through the stamp", async () => {
  const { calls, localStorage, chromeApi } = harness({ stamp: { commit: "f".repeat(40), reloadTabs: false } });
  const reloader = createDevAutoReload({
    chromeApi,
    fetch: async () => ({ ok: true, json: async () => ({ commit: "f".repeat(40), reloadTabs: false }) })
  });
  await reloader.check();
  assert.equal(localStorage.data.get(DEV_PENDING_TAB_RELOAD_KEY), false);
  assert.equal(calls.reload, 1);
});
