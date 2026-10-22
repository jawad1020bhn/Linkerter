#!/usr/bin/env node
/**
 * Dev-only auto-update loop for an unpacked Chrome extension.
 *
 * Chrome never updates an extension that was loaded with "Load unpacked", and it
 * never watches the folder for changes either. This script closes that gap for
 * development checkouts:
 *
 *   1. poll the GitHub branch for a new commit (cheap `git ls-remote`, no fetch),
 *   2. fast-forward the local checkout only when it is clean (`git merge --ff-only`),
 *   3. write `dev-autoreload.json` in the extension root.
 *
 * `background.js` watches that file (development installs only) and calls
 * `chrome.runtime.reload()` so Chrome re-reads the new files, then reloads the
 * LinkedIn tabs so the new content scripts are injected.
 *
 * Nothing here runs in a packaged extension: the stamp file is gitignored and is
 * never added to the release archives.
 *
 * Usage:
 *   node scripts/dev-auto-update.mjs [options]
 *
 * Options:
 *   --repo <path>        Checkout to watch (default: this repository).
 *   --remote <name>      Git remote to follow (default: origin).
 *   --branch <name>      Branch to follow (default: the checkout's current branch).
 *   --interval <seconds> Poll interval (default: 30).
 *   --once               Check once, then exit. Implies no polling.
 *   --no-pull            Only publish the current HEAD; never pull (for manual `git pull` workflows).
 *   --no-reload-tabs     Reload the extension only; leave open LinkedIn tabs alone.
 *   --quiet              Only log state changes.
 *   --help               Show this help.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

export const STAMP_FILE = "dev-autoreload.json";
const DEFAULT_INTERVAL_SECONDS = 30;

function log(message, { force = false, quiet = false } = {}) {
  if (quiet && !force) return;
  const stamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${stamp}] ${message}\n`);
}

async function git(repo, args, { allowFailure = false } = {}) {
  try {
    const { stdout } = await exec("git", args, {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    const detail = String(error.stderr || error.stdout || error.message || "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail.split("\n")[0]}` : ""}`);
  }
}

export async function resolveRepo(explicit, cwd = process.cwd()) {
  const start = explicit ? path.resolve(explicit) : cwd;
  return git(start, ["rev-parse", "--show-toplevel"]);
}

export async function localHead(repo) {
  return git(repo, ["rev-parse", "HEAD"]);
}

export async function remoteHead(repo, remote, branch) {
  const url = await git(repo, ["remote", "get-url", remote], { allowFailure: true });
  if (!url) return { ok: false, reason: "no-remote", sha: null };
  const output = await git(repo, ["ls-remote", "--heads", remote, branch], { allowFailure: true });
  if (output === null) return { ok: false, reason: "unreachable", sha: null };
  const line = output.split("\n").find((entry) => entry.endsWith(`refs/heads/${branch}`));
  if (!line) return { ok: true, sha: null };
  return { ok: true, sha: line.split(/\s+/)[0] || null };
}

export async function defaultBranch(repo, remote) {
  const reference = await git(repo, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], { allowFailure: true });
  if (reference && reference.startsWith(`${remote}/`)) return reference.slice(remote.length + 1);
  return "main";
}

export async function currentBranch(repo) {
  const name = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
  return name || "";
}

export async function hasTrackedChanges(repo) {
  const status = await git(repo, ["status", "--porcelain", "--untracked-files=no"]);
  return status.length > 0;
}

/** Fast-forward the checkout to the remote branch, refusing anything destructive. */
export async function fastForward(repo, remote, branch) {
  await git(repo, ["fetch", "--quiet", "--no-tags", remote, branch]);
  await git(repo, ["merge", "--ff-only", "--quiet", "FETCH_HEAD"]);
  return localHead(repo);
}

export async function writeStamp(repo, { commit, branch, remote, reloadTabs }) {
  const file = path.join(repo, STAMP_FILE);
  const temporary = `${file}.${process.pid}.tmp`;
  const payload = {
    commit,
    branch,
    remote,
    reloadTabs: reloadTabs !== false,
    updatedAt: new Date().toISOString()
  };
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporary, file);
  return payload;
}

export async function readStamp(repo) {
  try {
    return JSON.parse(await readFile(path.join(repo, STAMP_FILE), "utf8"));
  } catch (_error) {
    return null;
  }
}

/**
 * One check cycle.
 * @returns {Promise<{state: "updated"|"up-to-date"|"blocked"|"unreachable"|"missing-remote", commit: string|null}>}
 */
export async function runOnce({
  repo,
  remote = "origin",
  branch,
  pull = true,
  reloadTabs = true
} = {}) {
  const root = await resolveRepo(repo);
  const checkedOut = await currentBranch(root);
  // Default to the branch the checkout is actually on: development checkouts
  // live on feature/session branches, and watching the remote default there
  // would pause forever on the branch-mismatch guard below. Detached HEAD
  // (no branch of its own) falls back to the remote's default branch.
  const targetBranch = branch || (checkedOut && checkedOut !== "HEAD" ? checkedOut : await defaultBranch(root, remote));
  const local = await localHead(root);

  if (!pull) {
    const stamp = await writeStamp(root, { commit: local, branch: targetBranch, remote, reloadTabs });
    return { state: "up-to-date", commit: stamp.commit, local, branch: targetBranch, remote };
  }

  if (checkedOut && checkedOut !== "HEAD" && checkedOut !== targetBranch) {
    return {
      state: "blocked",
      reason: "branch-mismatch",
      commit: local,
      local,
      branch: targetBranch,
      remote,
      checkedOut
    };
  }

  const head = await remoteHead(root, remote, targetBranch);
  if (!head.ok) {
    return {
      state: head.reason === "no-remote" ? "missing-remote" : "unreachable",
      commit: null, local, branch: targetBranch, remote
    };
  }
  if (!head.sha) {
    return { state: "unreachable", commit: null, local, branch: targetBranch, remote, reason: "missing-branch" };
  }

  if (head.sha === local) {
    await writeStamp(root, { commit: local, branch: targetBranch, remote, reloadTabs });
    return { state: "up-to-date", commit: local, local, branch: targetBranch, remote: head.sha };
  }

  if (await hasTrackedChanges(root)) {
    return { state: "blocked", reason: "tracked-changes", commit: local, local, branch: targetBranch, remote: head.sha };
  }

  let updated;
  try {
    updated = await fastForward(root, remote, targetBranch);
  } catch (error) {
    return {
      state: "blocked",
      reason: "not-fast-forward",
      message: error.message,
      commit: local,
      local,
      branch: targetBranch,
      remote: head.sha
    };
  }

  await writeStamp(root, { commit: updated, branch: targetBranch, remote, reloadTabs });
  return { state: "updated", commit: updated, local: updated, branch: targetBranch, remote: head.sha, previous: local };
}

function describe(result, { quiet } = {}) {
  switch (result.state) {
    case "updated":
      log(`pulled ${result.branch}: ${result.previous.slice(0, 7)} → ${result.commit.slice(0, 7)} · Chrome reload requested`, { force: true });
      break;
    case "up-to-date":
      log(`up to date at ${String(result.commit).slice(0, 7)}`, { quiet });
      break;
    case "blocked":
      if (result.reason === "tracked-changes") {
        log(
          `update paused: ${result.branch} has ${String(result.remote).slice(0, 7)} but this checkout has uncommitted changes. Commit or stash them; nothing was overwritten.`,
          { force: true, quiet }
        );
      } else if (result.reason === "branch-mismatch") {
        log(
          `update paused: this checkout is on "${result.checkedOut}" while watching "${result.branch}". Switch branch or pass --branch ${result.checkedOut}.`,
          { force: true }
        );
      } else {
        log(
          `update paused: local ${result.branch} has diverged from ${String(result.remote).slice(0, 7)} and cannot fast-forward. Resolve it manually once; nothing was overwritten.`,
          { force: true, quiet }
        );
      }
      break;
    case "missing-remote":
      log(`no git remote named "${result.remote || "origin"}" in this checkout`, { force: true });
      break;
    case "unreachable":
      log(
        result.reason === "missing-branch"
          ? `the remote has no branch "${result.branch}"`
          : `could not read ${result.branch} from the remote (offline?); retrying`,
        { force: result.reason === "missing-branch", quiet }
      );
      break;
    default:
      break;
  }
}

function parseOptions() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string" },
      remote: { type: "string", default: "origin" },
      branch: { type: "string" },
      interval: { type: "string", default: String(DEFAULT_INTERVAL_SECONDS) },
      once: { type: "boolean", default: false },
      "no-pull": { type: "boolean", default: false },
      "no-reload-tabs": { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    },
    allowPositionals: false
  });
  const interval = Number(values.interval);
  if (!Number.isFinite(interval) || interval < 5) {
    throw new Error("--interval must be a number of seconds (5 or more)");
  }
  return { ...values, interval };
}

function helpText() {
  return [
    "Chrome never auto-updates an unpacked extension. This watcher does it for you.",
    "",
    "Usage: node scripts/dev-auto-update.mjs [options]",
    "",
    "  --repo <path>         checkout to watch (default: this repository)",
    "  --remote <name>       git remote (default: origin)",
    "  --branch <name>       branch to follow (default: the checkout's current branch)",
    "  --interval <seconds>  poll interval (default: 30)",
    "  --once                check once and exit",
    "  --no-pull             publish the current HEAD only; never pull",
    "  --no-reload-tabs      reload the extension but leave LinkedIn tabs open",
    "  --quiet               only report state changes",
    "  --help                show this help",
    "",
    "Keep it running while you develop: npm run dev:auto-update",
    "Chrome must have the extension loaded unpacked from the same folder."
  ].join("\n");
}

async function main() {
  let options;
  try {
    options = parseOptions();
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${helpText()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }

  let repo;
  try {
    repo = await resolveRepo(options.repo);
  } catch (error) {
    process.stderr.write(`Not a git checkout: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const settings = {
    repo,
    remote: options.remote,
    branch: options.branch,
    pull: !options["no-pull"],
    reloadTabs: !options["no-reload-tabs"]
  };

  try {
    const first = await runOnce(settings);
    describe(first, { quiet: options.quiet });
    if (options.once || first.state === "missing-remote") {
      process.exitCode = first.state === "missing-remote" ? 1 : 0;
      return;
    }
    log(`watching ${settings.remote}/${first.branch} every ${options.interval}s — Ctrl+C to stop`, { force: true });
  } catch (error) {
    process.stderr.write(`Initial check failed: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runOnce(settings);
      describe(result, { quiet: options.quiet });
    } catch (error) {
      log(`check failed: ${error.message}`, { force: true });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, options.interval * 1000);
  const stop = () => {
    clearInterval(timer);
    log("stopped", { force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
