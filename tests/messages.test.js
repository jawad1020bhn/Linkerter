"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
require(path.join(ROOT, "core", "sha256.js"));
const shared = require(path.join(ROOT, "core", "linkedin-shared.js"));
const { HISTORY_MESSAGE_TYPES } = require(path.join(ROOT, "infrastructure", "background.js"));

const { MESSAGE_TYPES, ALL_MESSAGE_TYPES } = shared;

// The three processes that exchange these strings. Each handler module owns one group of
// the contract; background.js owns history and local-data.
const HANDLER_SOURCES = {
  "features/feed-monitor/content.js": "SCROLL",
  "features/feed-monitor/linkedin-hiring-monitor.js": "HIRING",
  "infrastructure/background.js": "HISTORY"
};
const RUNTIME_SOURCES = [
  ...Object.keys(HANDLER_SOURCES),
  "features/popup/popup.js"
];

function readSource(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

test("every message type is a distinct string", () => {
  assert.equal(ALL_MESSAGE_TYPES.length, new Set(ALL_MESSAGE_TYPES).size, "duplicate wire type");
  for (const [group, types] of Object.entries(MESSAGE_TYPES)) {
    for (const [key, value] of Object.entries(types)) {
      assert.equal(typeof value, "string", `${group}.${key} must be a string`);
      assert.match(value, /^[A-Z][A-Z_]*$/, `${group}.${key} is not SCREAMING_SNAKE_CASE`);
    }
  }
  assert.ok(ALL_MESSAGE_TYPES.length >= 20, "the table lost entries");
});

test("no runtime file sends or handles a raw message-type literal", () => {
  // A literal here is how a typo becomes a silently dropped message: the sender waits on a
  // response no handler will ever send. Everything must come from the shared table.
  const offenders = [];
  for (const relative of RUNTIME_SOURCES) {
    const source = readSource(relative);
    const patterns = [/type:\s*"[A-Z][A-Z_]*"/g, /type\s*===\s*"[A-Z][A-Z_]*"/g, /case\s+"[A-Z][A-Z_]*":/g];
    for (const pattern of patterns) {
      for (const match of source.match(pattern) || []) offenders.push(`${relative}: ${match}`);
    }
  }
  assert.deepEqual(offenders, [], "raw message-type literals must use shared.MESSAGE_TYPES");
});

test("each handler answers with types from its own group", () => {
  for (const [relative, group] of Object.entries(HANDLER_SOURCES)) {
    const source = readSource(relative);
    const handled = [...source.matchAll(/case\s+(?:shared\.MESSAGE_TYPES|SHARED_MESSAGE_TYPES)\.(\w+)\.(\w+):/g)]
      .map((match) => match[1]);
    assert.ok(handled.length > 0, `${relative} handles no shared message types`);
    const foreign = [...new Set(handled)].filter((name) => name !== group);
    // background.js legitimately answers both HISTORY and DATA messages.
    if (relative.endsWith("background.js")) {
      assert.deepEqual(foreign.filter((name) => name !== "DATA"), [], `${relative} handles a foreign group`);
      continue;
    }
    assert.deepEqual(foreign, [], `${relative} handles a foreign group: ${foreign}`);
  }
});

test("background accepts exactly the history and local-data messages", () => {
  const expected = [...Object.values(MESSAGE_TYPES.HISTORY),
    MESSAGE_TYPES.DATA.LOCAL_DATA_CLEAR, MESSAGE_TYPES.DATA.GET_DIAGNOSTICS].sort();
  assert.deepEqual([...HISTORY_MESSAGE_TYPES].sort(), expected);
  // A scroll or hiring message routed to the service worker must be ignored, not answered.
  for (const type of [...Object.values(MESSAGE_TYPES.SCROLL), ...Object.values(MESSAGE_TYPES.HIRING)]) {
    assert.equal(HISTORY_MESSAGE_TYPES.has(type), false, `${type} must not reach the background`);
  }
});

test("every table entry is referenced by runtime code", () => {
  // Guards both directions: a renamed handler key and a leftover entry that no longer exists.
  const source = RUNTIME_SOURCES.map(readSource).join("\n");
  const unreferenced = [];
  for (const [group, types] of Object.entries(MESSAGE_TYPES)) {
    for (const [key, value] of Object.entries(types)) {
      const reference = new RegExp(`(?:shared\\.MESSAGE_TYPES|SHARED_MESSAGE_TYPES)\\.${group}\\.${key}\\b`);
      if (!reference.test(source)) unreferenced.push(`${group}.${key} (${value})`);
    }
  }
  assert.deepEqual(unreferenced, []);
});

test("the history coordinator still answers its documented protocol", async () => {
  const { createHistoryCoordinator } = require(path.join(ROOT, "infrastructure", "background.js"));
  const calls = [];
  const chromeApi = {
    storage: {
      local: {
        get(keys, callback) { calls.push(keys); callback({}); },
        set(items, callback) { calls.push(items); callback(); },
        remove(keys, callback) { calls.push(keys); callback(); }
      },
      session: {
        get(keys, callback) { callback({}); },
        set(items, callback) { callback(); },
        remove(keys, callback) { callback(); }
      },
      onChanged: { addListener() {} }
    }
  };
  const coordinator = createHistoryCoordinator({ chromeApi });
  // Every history type is accepted; a scroll type is rejected rather than mis-answered.
  for (const type of Object.values(MESSAGE_TYPES.HISTORY)) {
    const response = await coordinator.handle({ type });
    assert.equal(typeof response, "object", `${type} produced no response object`);
  }
  assert.equal(HISTORY_MESSAGE_TYPES.has(MESSAGE_TYPES.SCROLL.GET_STATUS), false);
  assert.equal(HISTORY_MESSAGE_TYPES.has(MESSAGE_TYPES.HIRING.GET_STATUS), false);
});
