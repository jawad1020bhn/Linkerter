# Auto-update an unpacked Linkerter during development

Chrome never updates an extension that was installed with **Load unpacked**, and
it does not watch the folder for changes. After every `git pull` you normally
have to open `chrome://extensions`, press **Reload** on Linkerter, and refresh
the LinkedIn tab so the new content scripts are injected.

`scripts/dev-auto-update.mjs` plus a small development-only hook in
`background.js` remove those three manual steps:

```sh
npm run dev:auto-update
```

```
[14:32:07] up to date at f188a42
[14:32:07] watching origin/main every 30s — Ctrl+C to stop
[14:32:37] pulled main: f188a42 → 9c1de77 · Chrome reload requested
```

## What happens on a new commit

1. **Poll** — every 30 seconds the script runs `git ls-remote --heads origin <branch>`.
   That is a single small network request; nothing is fetched until the remote
   commit actually differs from `HEAD`.
2. **Fast-forward, never force** — the script checks
   `git status --porcelain --untracked-files=no` first, and it refuses to pull
   when the checkout is on a different branch than the one it watches — which,
   with the default above, only happens if you switch branches while the
   watcher runs, or pin `--branch` to another branch on purpose. If
   tracked files have uncommitted changes, or the branches have diverged, it logs
   `update paused` and leaves your work untouched. Only a clean,
   fast-forwardable checkout of the watched branch is updated
   (`git fetch` + `git merge --ff-only`).
3. **Stamp** — the new commit is written atomically to
   `dev-autoreload.json` in the repository root (gitignored, never packaged).
4. **Reload** — the extension service worker is running this checkout, so on
   its next check it sees a commit it has not applied yet and:
   - stores the applied commit in `chrome.storage.local`,
   - calls `chrome.runtime.reload()`, which re-reads `manifest.json` and every
     script from disk,
   - on the next worker start, reloads the open `https://www.linkedin.com/*`
     tabs so the new content scripts are injected.

## Options

```sh
npm run dev:auto-update -- [options]

  --repo <path>         checkout to watch (default: current directory)
  --remote <name>       git remote (default: origin)
  --branch <name>       branch to follow (default: the checkout's current branch,
                        or the remote's default branch when HEAD is detached)
  --interval <seconds>  poll interval, minimum 5 (default: 30)
  --once                check once and exit
  --no-pull             only publish the current HEAD; never pull
  --no-reload-tabs      reload the extension but leave LinkedIn tabs open
  --quiet               only report state changes
  --help                show usage
```

Typical variations:

```sh
# follow a feature branch instead of main
npm run dev:auto-update -- --branch arena/39df7a6e-linkerter --interval 15

# you prefer to run git pull yourself; still get the automatic Chrome reload
npm run dev:auto-update -- --no-pull

# do not touch the open LinkedIn tab (monitor state stays as it is)
npm run dev:auto-update -- --no-reload-tabs

# one check, e.g. from a git hook or a task runner
npm run dev:auto-update -- --once
```

`--once` exits `0` on success, `1` when the remote cannot be read, and leaves
the checkout untouched when it is dirty or diverged.

## Browser reload caveat

MV3 service workers are stopped when idle. While the worker is alive the stamp is
checked every five seconds; if Chrome has already stopped it, the update is
applied the next time the worker starts — opening the popup, navigating to a
LinkedIn feed, or any message from the content script. In practice the new code
is running by the time you look at the extension again.

## Safety and privacy

- **No new permissions.** The hook runs only when
  `chrome.management.getSelf()` reports `installType === "development"`, which is
  exactly an unpacked load. `getSelf()` needs no `management` permission, so
  `manifest.json` still declares only `activeTab` and `storage`.
- **Store installs are unaffected.** They never run the hook, never read the
  stamp file, and never reload themselves. Published users get updates from the
  Chrome Web Store as usual.
- **No new network traffic from the extension.** The only network request in the
  loop is the git remote check, made by your terminal.
- **No data loss.** The script refuses to touch a dirty checkout, never resets,
  never stashes, and never force-pushes.
- `dev-autoreload.json` is gitignored and is not part of
  `linkedin-feed-scroller.zip` or `linkedin-feed-scroller-store.zip`.

## Troubleshooting

| Symptom | Reason | Fix |
| --- | --- | --- |
| `update paused: … uncommitted changes` | Tracked files are modified | Commit, stash, or discard; the watcher retries every interval |
| `update paused: local … has diverged` | Local commits not on the remote | Rebase or reset manually once; the watcher never rewrites history |
| `update paused: this checkout is on "x" while watching "y"` | You switched branches while the watcher ran, or pinned `--branch y` on purpose | Restart the watcher (it follows the current branch by default), or check out `y` |
| `no git remote named "origin"` | Remote missing or renamed | `--remote <name>` or add the remote |
| `could not read … (offline?)` | Git could not reach GitHub | It keeps retrying; no state is changed |
| `the remote has no branch "x"` | The watched branch was never pushed (typical right after a new feature/session branch is created) | Nothing to fix: the watcher retries every interval and picks the branch up as soon as it exists on the remote |
| Chrome never reloads | The folder loaded in `chrome://extensions` is not this checkout, or the extension is not an unpacked load | Check the path on the extension card; Chrome must show **Developer mode** and “Loaded unpacked” |
| Reload happens, but the LinkedIn tab keeps old behaviour | `--no-reload-tabs` was used, or no LinkedIn tab was open | Refresh the feed once, then leave the tab open |

## Turning it off

Stop the watcher with `Ctrl+C`. Delete `dev-autoreload.json` and reload the
extension once: without a stamp the hook has nothing to apply. Nothing else in
the repository or the installed extension needs to change.
