"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(root, "scripts", "dev-auto-update.mjs");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "linkerter-dev-update-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_TERMINAL_PROMPT: "0"
    }
  }).trim();
}

function commit(cwd, file, contents, message) {
  fs.writeFileSync(path.join(cwd, file), contents);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

/** Builds a bare "GitHub" remote plus a developer clone and a second author clone. */
function fixture(t) {
  const directory = temporaryDirectory(t);
  const remote = path.join(directory, "remote.git");
  git(directory, "init", "-q", "--bare", "-b", "main", remote);

  const seed = path.join(directory, "seed");
  git(directory, "clone", "-q", remote, seed);
  git(seed, "checkout", "-q", "-B", "main");
  const first = commit(seed, "file.txt", "one\n", "initial");
  git(seed, "push", "-q", "origin", "main");

  const dev = path.join(directory, "dev");
  git(directory, "clone", "-q", remote, dev);

  const author = path.join(directory, "author");
  git(directory, "clone", "-q", remote, author);

  return { directory, remote, seed, dev, author, first };
}

function loadModule() {
  return import(pathToFileURL(scriptPath).href);
}

function readStamp(repo) {
  return JSON.parse(fs.readFileSync(path.join(repo, "dev-autoreload.json"), "utf8"));
}

test("dev auto-update fast-forwards a clean checkout and stamps the new commit", async (t) => {
  const { dev, author, first } = fixture(t);
  const second = commit(author, "file.txt", "one\ntwo\n", "second");
  git(author, "push", "-q", "origin", "main");

  const { runOnce } = await loadModule();
  const result = await runOnce({ repo: dev, branch: "main" });

  assert.equal(result.state, "updated");
  assert.equal(result.previous, first);
  assert.equal(git(dev, "rev-parse", "HEAD"), second);
  assert.equal(fs.readFileSync(path.join(dev, "file.txt"), "utf8"), "one\ntwo\n");

  const stamp = readStamp(dev);
  assert.equal(stamp.commit, second);
  assert.equal(stamp.branch, "main");
  assert.equal(stamp.remote, "origin");
  assert.equal(stamp.reloadTabs, true);
  assert.ok(!Number.isNaN(Date.parse(stamp.updatedAt)));
});

test("dev auto-update never overwrites a dirty checkout", async (t) => {
  const { dev, author } = fixture(t);
  commit(author, "file.txt", "one\ntwo\n", "second");
  git(author, "push", "-q", "origin", "main");

  fs.writeFileSync(path.join(dev, "file.txt"), "local work in progress\n");
  const before = git(dev, "rev-parse", "HEAD");

  const { runOnce } = await loadModule();
  const result = await runOnce({ repo: dev, branch: "main" });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "tracked-changes");
  assert.equal(git(dev, "rev-parse", "HEAD"), before);
  assert.equal(fs.readFileSync(path.join(dev, "file.txt"), "utf8"), "local work in progress\n");
  assert.equal(fs.existsSync(path.join(dev, "dev-autoreload.json")), false);
});

test("dev auto-update stamps an unchanged checkout without creating new commits", async (t) => {
  const { dev } = fixture(t);
  const before = git(dev, "rev-parse", "HEAD");
  const count = git(dev, "rev-list", "--count", "HEAD");

  const { runOnce } = await loadModule();
  const result = await runOnce({ repo: dev, branch: "main" });

  assert.equal(result.state, "up-to-date");
  assert.equal(result.commit, before);
  assert.equal(git(dev, "rev-parse", "HEAD"), before);
  assert.equal(git(dev, "rev-list", "--count", "HEAD"), count);
  assert.equal(readStamp(dev).commit, before);
});

test("--no-pull only publishes the current HEAD", async (t) => {
  const { dev, author } = fixture(t);
  commit(author, "file.txt", "one\ntwo\n", "second");
  git(author, "push", "-q", "origin", "main");
  const before = git(dev, "rev-parse", "HEAD");

  const { runOnce } = await loadModule();
  const result = await runOnce({ repo: dev, branch: "main", pull: false });

  assert.equal(result.state, "up-to-date");
  assert.equal(git(dev, "rev-parse", "HEAD"), before);
  assert.equal(readStamp(dev).commit, before);
});

test("a missing remote and a diverged branch are reported, not forced", async (t) => {
  const { dev, directory } = fixture(t);

  const { runOnce } = await loadModule();
  const missing = await runOnce({ repo: dev, branch: "main", remote: "upstream" });
  assert.equal(missing.state, "missing-remote");

  const orphan = path.join(directory, "orphan");
  git(directory, "init", "-q", "-b", "main", orphan);
  const orphanCommit = commit(orphan, "other.txt", "other\n", "orphan");
  git(orphan, "remote", "add", "origin", path.join(directory, "remote.git"));
  const diverged = await runOnce({ repo: orphan, branch: "main" });
  assert.equal(diverged.state, "blocked");
  assert.equal(diverged.reason, "not-fast-forward");
  assert.equal(git(orphan, "rev-parse", "HEAD"), orphanCommit);
});

test("a checkout on another branch is never fast-forwarded", async (t) => {
  const { dev, author } = fixture(t);
  commit(author, "file.txt", "one\ntwo\n", "second");
  git(author, "push", "-q", "origin", "main");

  git(dev, "checkout", "-q", "-B", "feature");
  const before = git(dev, "rev-parse", "HEAD");

  const { runOnce } = await loadModule();
  const result = await runOnce({ repo: dev, branch: "main" });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "branch-mismatch");
  assert.equal(result.checkedOut, "feature");
  assert.equal(git(dev, "rev-parse", "HEAD"), before);
  assert.equal(git(dev, "rev-parse", "--abbrev-ref", "HEAD"), "feature");
  assert.equal(fs.existsSync(path.join(dev, "dev-autoreload.json")), false);
});

test("the stamp is written atomically and never leaves temporary files behind", async (t) => {
  const { dev } = fixture(t);
  const { writeStamp } = await loadModule();

  await writeStamp(dev, { commit: "a".repeat(40), branch: "main", remote: "origin", reloadTabs: false });
  const stamp = readStamp(dev);
  assert.equal(stamp.commit, "a".repeat(40));
  assert.equal(stamp.reloadTabs, false);
  assert.deepEqual(fs.readdirSync(dev).filter((entry) => entry.includes("dev-autoreload")), ["dev-autoreload.json"]);
});

test("the CLI is documented and wired into npm scripts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["dev:auto-update"], "node scripts/dev-auto-update.mjs");
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^dev-autoreload\.json$/m);
  const help = execFileSync("node", [scriptPath, "--help"], { encoding: "utf8" });
  assert.match(help, /autou?pdate|auto-update/i);
  assert.match(help, /--once/);
});
