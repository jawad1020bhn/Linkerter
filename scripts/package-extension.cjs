#!/usr/bin/env node
/* Build a deterministic, runtime-only Chrome Extension MV3 archive.
 *
 *   node scripts/package-extension.cjs              -> linkedin-feed-scroller.zip
 *   node scripts/package-extension.cjs out.zip
 *
 * The archive contains only files the manifest (plus the popup's own script/style
 * references) needs at runtime; development files under scripts/ and tests/ never ship.
 * It is byte-identical across runs and machines: fixed timestamps, fixed permissions,
 * sorted entry names and a single deflate level. The extension is installed unpacked or
 * sideloaded locally, so there is no store-upload variant.
 *
 * This replaces the previous bash + python3 implementation, which needed a Python 3
 * interpreter that Windows does not ship by default.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const REPO_ROOT = path.resolve(__dirname, "..");
const PREFIX = "linkedin-feed-scroller/";
const DEFAULT_OUTPUT = "linkedin-feed-scroller.zip";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Reject anything that could write outside the archive (absolute paths, `..`, `\`). */
function assertSafePath(value) {
  const raw = String(value || "");
  if (!raw) throw new Error("Empty runtime archive path.");
  if (raw.includes("\\")) throw new Error(`Unsafe runtime archive path: ${raw}`);
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) throw new Error(`Unsafe runtime archive path: ${raw}`);
  const normalized = path.posix.normalize(raw);
  if (normalized === ".." || normalized.startsWith("../") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe runtime archive path: ${raw}`);
  }
  return normalized.replace(/^\.\//, "");
}

function readManifest(root) {
  const file = path.join(root, "manifest.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function popupReferences(root, popupPath) {
  const html = fs.readFileSync(path.join(root, popupPath), "utf8");
  const popupDir = path.posix.dirname(popupPath);
  const references = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) references.push(match[1]);
  for (const match of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)) {
    references.push(match[1]);
  }
  return references.map((reference) => assertSafePath(path.posix.join(popupDir, reference)));
}

/**
 * Every file the packaged extension needs at runtime, as sorted POSIX paths relative
 * to `root`. Throws when a referenced file is missing or a path escapes the archive.
 */
function collectRuntimeFiles(root = REPO_ROOT) {
  const manifest = readManifest(root);
  const files = new Set([
    "manifest.json",
    manifest.background.service_worker,
    manifest.action.default_popup
  ]);
  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) files.add(file);
    for (const file of contentScript.css || []) files.add(file);
  }
  for (const icon of Object.values(manifest.icons || {})) files.add(icon);
  for (const icon of Object.values((manifest.action || {}).default_icon || {})) files.add(icon);
  for (const reference of popupReferences(root, manifest.action.default_popup)) files.add(reference);

  const output = [...files].map(assertSafePath).sort();
  for (const relative of output) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`Missing required extension file: ${relative}`);
    }
  }
  return output;
}

function dosDateTime() {
  // 1980-01-01 00:00:00 — the earliest timestamp a ZIP entry can carry, so builds are
  // reproducible regardless of when they run.
  return { time: 0, date: 0x0021 };
}

/** Build the ZIP in memory. `prefix` is prepended to every entry name. */
function buildArchiveBuffer({ root = REPO_ROOT, files, prefix = PREFIX }) {
  const entries = (files || collectRuntimeFiles(root)).map((file) => {
    const safe = assertSafePath(file);
    const data = fs.readFileSync(path.join(root, safe));
    const name = `${prefix}${safe}`;
    return {
      name,
      nameBytes: Buffer.from(name, "utf8"),
      data,
      compressed: zlib.deflateRawSync(data, { level: 9 }),
      crc: crc32(data)
    };
  });

  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 file names
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entry.nameBytes.length, 26);
    local.writeUInt16LE(0, 28);          // extra field length
    localParts.push(local, entry.nameBytes, entry.compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);    // made by: Unix, version 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30);        // extra
    central.writeUInt16LE(0, 32);        // comment
    central.writeUInt16LE(0, 34);        // disk number
    central.writeUInt16LE(0, 36);        // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, entry.nameBytes);

    offset += local.length + entry.nameBytes.length + entry.compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildArchive({ root = REPO_ROOT, out } = {}) {
  const files = collectRuntimeFiles(root);
  const buffer = buildArchiveBuffer({ root, files });
  const target = path.resolve(out || path.join(root, DEFAULT_OUTPUT));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  return { out: target, files: files.length, bytes: buffer.length };
}

function usage() {
  return "Usage: node scripts/package-extension.cjs [output.zip]";
}

function main(argv = [], root = REPO_ROOT) {
  const args = [...argv];
  if ((args[0] && args[0].startsWith("--")) || args.length > 1) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    const result = buildArchive({ root, out: args[0] });
    process.stdout.write(`Wrote ${result.out} (${result.files} files, deterministic)\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

module.exports = { collectRuntimeFiles, buildArchiveBuffer, buildArchive, main, assertSafePath };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
