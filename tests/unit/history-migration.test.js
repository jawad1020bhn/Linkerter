"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../../linkedin-shared.js");
const { createChromeMock } = require("../helpers/chrome-mock.js");
const { createHistoryCoordinator } = require("../../background.js");

test("legacy keepHistory=true migrates once to persistent mode", async () => {
  const chrome = createChromeMock({ local: { hiringSettings: { keepHistory: true } } });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome });
  const first = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(first.mode, "persistent");
  assert.equal(chrome._local._data.hiringPreferences.historyMode, "persistent");
  const migrated = structuredClone(chrome._local._data.hiringPreferences);
  const writes = chrome._local._writes;
  const second = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(second.mode, "persistent");
  assert.deepEqual(chrome._local._data.hiringPreferences, migrated);
  assert.equal(chrome._local._writes, writes);
});

test("legacy keepHistory=false migrates to off without deleting saved history", async () => {
  const record = { id: "old", text: "old", observedAt: "2020-01-01T00:00:00.000Z" };
  const chrome = createChromeMock({ local: {
    hiringSettings: { keepHistory: false }, hiringPostHistory: [record]
  } });
  const coordinator = createHistoryCoordinator({ chromeApi: chrome });
  const status = await coordinator.handle({ type: "HISTORY_STATUS" });
  assert.equal(status.mode, "off");
  assert.deepEqual(chrome._local._data.hiringPostHistory, [record]);
  const append = await coordinator.handle({ type: "HISTORY_APPEND", records: [record] });
  assert.equal(append.ok, false);
  assert.equal(append.error, "history_disabled");
});
