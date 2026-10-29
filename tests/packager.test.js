"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const { collectRuntimeFiles, buildArchiveBuffer, buildArchive } = require("../scripts/package-extension.cjs");

// Minimal central-directory reader: enough to prove which names the archive carries.
function listEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(eocd, -1, "end-of-central-directory record present");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

test("collectRuntimeFiles lists exactly the files the manifest and popup need", () => {
  const files = collectRuntimeFiles(ROOT);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const expected = [
    "manifest.json",
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];
  for (const file of expected) assert.ok(files.includes(file), `missing ${file}`);
  assert.deepEqual(files, [...new Set(files)], "no duplicate entries");
  assert.deepEqual(files, [...files].sort(), "sorted for a deterministic archive");
  assert.ok(files.includes("features/popup/popup.css"), "popup stylesheet is collected");
  assert.ok(files.includes("features/popup/popup.js"), "popup scripts are collected");
  assert.ok(files.includes("features/popup/popup-locales.js"), "extra locales are collected");
  assert.ok(files.includes("features/popup/popup-store.js"), "the popup store is collected");
  assert.ok(files.includes("core/linkedin-shared.js"), "the shared pipeline layer is collected");
  assert.equal(files.some((file) => file.startsWith("tests/")), false);
  assert.equal(files.some((file) => file.startsWith("scripts/")), false);
  // Store assets are marketing output, not runtime code: a screenshot must never bloat
  // the archive the browser installs.
  assert.equal(files.some((file) => file.startsWith("store/")), false);
});

test("collectRuntimeFiles rejects unsafe paths from the manifest", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "linkerter-pack-"));
  try {
    fs.writeFileSync(path.join(temp, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      background: { service_worker: "../escape.js" },
      action: { default_popup: "popup.html", default_icon: {} },
      content_scripts: [],
      icons: {}
    }));
    fs.writeFileSync(path.join(temp, "popup.html"), "<!doctype html>");
    assert.throws(() => collectRuntimeFiles(temp), /unsafe/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("the archive is deterministic and carries the requested prefix", () => {
  const files = collectRuntimeFiles(ROOT);
  const first = buildArchiveBuffer({ root: ROOT, files, prefix: "" });
  const second = buildArchiveBuffer({ root: ROOT, files, prefix: "" });
  assert.deepEqual(first, second, "two builds are byte-identical");

  const prefixed = buildArchiveBuffer({ root: ROOT, files, prefix: "linkedin-feed-scroller/" });
  const names = listEntries(prefixed);
  assert.deepEqual(names, files.map((file) => `linkedin-feed-scroller/${file}`));
  assert.deepEqual(listEntries(first), files);
});

test("buildArchive writes the archive to disk", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "linkerter-pack-"));
  try {
    const out = path.join(temp, "extension.zip");
    const result = buildArchive({ root: ROOT, out, mode: "store" });
    assert.equal(result.out, out);
    assert.ok(fs.statSync(out).size > 0);
    assert.equal(result.files, collectRuntimeFiles(ROOT).length);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("the CLI builds both variants and rejects bad usage", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "linkerter-cli-"));
  try {
    const storeZip = path.join(temp, "store.zip");
    const store = spawnSync(process.execPath, [path.join(ROOT, "scripts/package-extension.cjs"), "--store", storeZip], {
      cwd: ROOT, encoding: "utf8"
    });
    assert.equal(store.status, 0, store.stderr);
    assert.match(store.stdout, /store, deterministic/);
    assert.ok(listEntries(fs.readFileSync(storeZip)).includes("manifest.json"));

    const unpackedZip = path.join(temp, "unpacked.zip");
    const unpacked = spawnSync(process.execPath, [path.join(ROOT, "scripts/package-extension.cjs"), unpackedZip], {
      cwd: ROOT, encoding: "utf8"
    });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    assert.ok(listEntries(fs.readFileSync(unpackedZip)).includes("linkedin-feed-scroller/manifest.json"));

    const bad = spawnSync(process.execPath, [path.join(ROOT, "scripts/package-extension.cjs"), "--nope"], {
      cwd: ROOT, encoding: "utf8"
    });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Usage/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
