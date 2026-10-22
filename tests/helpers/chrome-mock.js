"use strict";

const clone = (value) => value === undefined ? undefined : structuredClone(value);

function createEvent() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    hasListener(listener) { return listeners.has(listener); },
    async dispatch(...args) {
      const results = [];
      for (const listener of [...listeners]) {
        let responded = false;
        let resolveResponse;
        const response = new Promise((resolve) => { resolveResponse = resolve; });
        const sendResponse = (value) => { responded = true; resolveResponse(value); };
        const returned = listener(...args, sendResponse);
        if (returned === true) results.push(await response);
        else if (returned && typeof returned.then === "function") results.push(await returned);
        else if (responded) results.push(await response);
      }
      return results;
    },
    get count() { return listeners.size; }
  };
}

function createStorageArea(initial = {}) {
  const data = clone(initial);
  const area = {
    _data: data,
    _writes: 0,
    beforeGet: null,
    beforeSet: null,
    async get(keys, callback) {
      if (area.beforeGet) await area.beforeGet(keys);
      const result = {};
      if (keys === null || keys === undefined) Object.assign(result, clone(data));
      else if (typeof keys === "string") { if (keys in data) result[keys] = clone(data[keys]); }
      else if (Array.isArray(keys)) for (const key of keys) { if (key in data) result[key] = clone(data[key]); }
      else for (const [key, fallback] of Object.entries(keys)) result[key] = key in data ? clone(data[key]) : clone(fallback);
      if (callback) { callback(result); return undefined; }
      return result;
    },
    async set(values, callback) {
      if (area.beforeSet) await area.beforeSet(values);
      Object.assign(data, clone(values));
      area._writes += 1;
      if (callback) { callback(); return undefined; }
    },
    async remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
      if (callback) { callback(); return undefined; }
    },
    async clear(callback) {
      for (const key of Object.keys(data)) delete data[key];
      if (callback) { callback(); return undefined; }
    },
    async getBytesInUse(keys, callback) {
      const selected = await area.get(keys || null);
      const bytes = Buffer.byteLength(JSON.stringify(selected), "utf8");
      if (callback) { callback(bytes); return undefined; }
      return bytes;
    }
  };
  return area;
}

function createChromeMock({ local = {}, session = {} } = {}) {
  const localArea = createStorageArea(local);
  const sessionArea = createStorageArea(session);
  const onChanged = createEvent();
  return {
    storage: { local: localArea, session: sessionArea, onChanged },
    runtime: { onMessage: createEvent(), lastError: null },
    action: { onClicked: createEvent() },
    alarms: { onAlarm: createEvent(), async create() {}, async clear() {} },
    tabs: { async query() { return []; }, async sendMessage() { return {}; } },
    downloads: { async download() { return 1; }, onChanged: createEvent() },
    _local: localArea,
    _session: sessionArea
  };
}

module.exports = { createChromeMock, createStorageArea, createEvent, clone };
