"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const script = path.join(root, "scripts", "package-extension.sh");
const expectedRuntime = [
  "manifest.json", "background.js", "content.js",
  "linkedin-shared.js", "linkedin-hiring-rules.js", "linkedin-hiring-classifier.js", "linkedin-hiring-monitor.js",
  "popup.html", "popup.css", "popup.js", "popup-i18n.js", "popup-export.js", "popup-results.js",
  "icons/icon-16.png", "icons/icon-48.png", "icons/icon-128.png"
].sort();

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "linkerter-package-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function packageExtension(mode, output, source = root) {
  return execFileSync("bash", [path.join(source, "scripts", "package-extension.sh"), mode, output], {
    cwd: source, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  });
}

function inspectZip(filename) {
  const source = `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps([{
      "name": entry.filename,
      "date": entry.date_time,
      "permissions": (entry.external_attr >> 16) & 0o777,
      "system": entry.create_system,
      "compression": entry.compress_type
    } for entry in archive.infolist()]))
`;
  return JSON.parse(execFileSync("python3", ["-c", source, filename], { encoding: "utf8" }));
}

function stageSource(directory, mtime) {
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  fs.copyFileSync(script, path.join(directory, "scripts", "package-extension.sh"));
  for (const relative of expectedRuntime) {
    const destination = path.join(directory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
    fs.utimesSync(destination, mtime, mtime);
  }
  fs.utimesSync(path.join(directory, "manifest.json"), mtime, mtime);
}

test("unpacked and store archives have exact sorted allowlists and stable ZIP metadata", (t) => {
  const directory = temporaryDirectory(t);
  for (const mode of ["--unpacked", "--store"]) {
    const output = path.join(directory, `${mode.slice(2)}.zip`);
    packageExtension(mode, output);
    const entries = inspectZip(output);
    const names = entries.map((entry) => entry.name);
    const expected = mode === "--unpacked" ? expectedRuntime.map((name) => `linkedin-feed-scroller/${name}`) : expectedRuntime;
    assert.deepEqual(names, expected);
    assert.deepEqual(names, [...names].sort());
    assert.ok(entries.every((entry) => entry.date.join("-") === "1980-1-1-0-0-0"));
    assert.ok(entries.every((entry) => entry.permissions === 0o644));
    assert.ok(entries.every((entry) => entry.system === 3));
    assert.ok(entries.every((entry) => !/(^|\/)(tests?|docs|node_modules|\.git|\.agents|\.superpowers)(\/|$)/.test(entry.name)));
  }
});

test("different source mtimes produce byte-identical unpacked and store archives", (t) => {
  const directory = temporaryDirectory(t);
  const first = path.join(directory, "source-a");
  const second = path.join(directory, "source-b");
  stageSource(first, new Date("2020-01-01T00:00:00Z"));
  stageSource(second, new Date("2026-10-22T12:34:56Z"));
  for (const mode of ["--unpacked", "--store"]) {
    const a = path.join(directory, `a-${mode.slice(2)}.zip`);
    const b = path.join(directory, `b-${mode.slice(2)}.zip`);
    packageExtension(mode, a, first);
    packageExtension(mode, b, second);
    assert.deepEqual(fs.readFileSync(a), fs.readFileSync(b), `${mode} archives must be byte-identical`);
  }
});

test("manifest and action icons are real PNGs at 16, 48, and 128 pixels", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  for (const size of [16, 48, 128]) {
    const relative = `icons/icon-${size}.png`;
    assert.equal(manifest.icons?.[size], relative);
    assert.equal(manifest.action?.default_icon?.[size], relative);
    const data = fs.readFileSync(path.join(root, relative));
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});

test("release documents disclose local storage, exports, limitations, and owner-only gates", () => {
  const required = [
    "PRIVACY.md", "CHANGELOG.md", "CONTRIBUTING.md", "SUPPORT.md", "SECURITY.md",
    "docs/store/listing.md", "docs/store/privacy-practices.md", "docs/store/release-checklist.md"
  ];
  for (const relative of required) assert.ok(fs.existsSync(path.join(root, relative)), `${relative} must exist`);
  const privacy = fs.readFileSync(path.join(root, "PRIVACY.md"), "utf8");
  for (const claim of ["off by default", "chrome.storage.local", "chrome.storage.session", "500 records", "3 MB", "1,000", "no analytics", "user-triggered"]) {
    assert.ok(privacy.toLowerCase().includes(claim.toLowerCase()), `privacy disclosure must include ${claim}`);
  }
  const checklist = fs.readFileSync(path.join(root, "docs/store/release-checklist.md"), "utf8").toLowerCase();
  for (const gate of ["license", "publisher", "policy", "authenticated linkedin", "not run"]) {
    assert.ok(checklist.includes(gate), `release checklist must retain the ${gate} gate`);
  }
});

test("package, manifest, README, and changelog versions agree", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, manifest.version);
  assert.ok(fs.readFileSync(path.join(root, "README.md"), "utf8").includes(`**Version ${manifest.version}**`));
  assert.ok(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8").includes(`## [${manifest.version}]`));
});

test("CI executes unit, verifier, package, deterministic, and required real-browser gates", () => {
  // The canonical workflow lives at .github/workflows/ci.yml. Until the
  // repository's GitHub App is granted the `workflows` permission, the
  // byte-identical staged copy at docs/ci/ci.yml is accepted (see
  // docs/ci/README.md); the same content assertions apply either way.
  const canonical = path.join(root, ".github", "workflows", "ci.yml");
  const staged = path.join(root, "docs", "ci", "ci.yml");
  const workflow = fs.readFileSync(fs.existsSync(canonical) ? canonical : staged, "utf8");
  for (const command of ["npm ci", "npm test", "bash scripts/verify-superpowers.sh", "node --test tests/integration/package.test.js", "npm run test:browser", "cmp "]) {
    assert.ok(workflow.includes(command), `CI must execute ${command}`);
  }
  assert.match(workflow, /REQUIRE_CHROME:\s*["']?1/);
});
