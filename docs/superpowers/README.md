# Superpowers (`obra/superpowers` v7.0.0) in Linkerter

This repository ships a complete, self-contained installation of **[obra/superpowers](https://github.com/obra/superpowers)** (`v7.0.0`) pre-wired for every major coding agent and cloud sandbox — with zero per-session opt-in required.

## Directory Layout

| Path | Tracked in Git | Purpose |
|---|---|---|
| `AGENTS.md` | Yes | Automatic session-start Superpowers bootstrap + 15-skill index + Linkerter architecture |
| `CLAUDE.md` | Yes | Claude Code & Arena instructions (`@AGENTS.md` + `.claude/skills/` guidance) |
| `GEMINI.md` | Yes | Gemini CLI context bootstrap (`using-superpowers` + `gemini-tools.md` + `AGENTS.md`) |
| `opencode.json` | Yes | OpenCode V1/V2 plugin registration pointing to `.agents/superpowers/.opencode/plugins/superpowers.js` |
| `.agents/superpowers/` | Yes | Complete upstream `obra/superpowers` distribution: all 15 skills, scripts, hooks, harness plugins, docs, and test suites |
| `.agents/skills/` | Yes | Cross-runtime project skills directory scanned automatically by Codex, Copilot CLI, Gemini CLI, OpenCode, and Arena |
| `.claude/skills/` | Yes | Project skills directory scanned automatically by Claude Code, Cursor, Qwen Code, Factory Droid, and Kimi Code |
| `docs/superpowers/specs/` | Yes | Approved feature design specs written by `brainstorming` (`YYYY-MM-DD-<topic>-design.md`) |
| `docs/superpowers/plans/` | Yes | Implementation plans written by `writing-plans` (`YYYY-MM-DD-<feature>.md`) |
| `.superpowers/` | Ignored | Ephemeral runtime workspaces: `.superpowers/brainstorm/` (Visual Companion) & `.superpowers/sdd/` (plan ledgers/diffs) |
| `.worktrees/` | Ignored | Local isolated git worktrees managed by `using-git-worktrees` |
| `scripts/verify-superpowers.sh` | Yes | Verifies skill parity, hooks, helper scripts, brainstorm server, and `manifest.json` (`--sync` re-syncs skill copies) |
| `scripts/package-extension.sh` | Yes | Builds a clean `linkedin-feed-scroller.zip` containing only the Chrome Extension files |

## Installed Skills (All 15 Core Skills)

1. **`using-superpowers`** — Session bootstrap enforcing mandatory skill checks before every response or action.
2. **`brainstorming`** — Draws out intent, plays back specs in digestible chunks, offers the interactive **Visual Companion**, and produces approved specs in `docs/superpowers/specs/`.
3. **`using-git-worktrees`** — Ensures clean branch/worktree isolation and clean test baseline before implementation.
4. **`writing-plans`** — Produces step-by-step RED-GREEN-REFACTOR implementation plans in `docs/superpowers/plans/`.
5. **`executing-plans`** — Executes plans inline task-by-task (`scripts/task-start`, `scripts/task-done`) with a full branch review package.
6. **`subagent-driven-development`** — Dispatches fresh per-task implementer and spec/quality reviewer subagents using `scripts/sdd-workspace`, `scripts/task-brief`, and `scripts/review-package`.
7. **`dispatching-parallel-agents`** — Runs independent investigations or tasks concurrently.
8. **`test-driven-development`** — Enforces strict RED → GREEN → REFACTOR cycles (includes `writing-good-tests.md`).
9. **`systematic-debugging`** — 4-phase root-cause investigation (`root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`, `find-polluter.sh`).
10. **`verification-before-completion`** — Requires fresh command output proving every claim before completion, commit, or PR.
11. **`requesting-code-review`** — Structured spec-compliance & code-quality review workflow (`code-reviewer.md`).
12. **`receiving-code-review`** — Technical verification discipline before applying review suggestions.
13. **`finishing-a-development-branch`** — Verifies suite health and presents merge / PR / keep options.
14. **`writing-skills`** — Methodology, Graphviz conventions, and pressure-testing for creating/editing project skills.
15. **`diagnosing-superpowers`** — Session transcript analyzer for debugging agent behavior or token usage.

## Running Verification & Packaging Commands

```bash
# Verify the full Superpowers installation, skill tree sync, hooks, and extension manifest
bash scripts/verify-superpowers.sh

# Sync edits or new skills from .agents/superpowers/skills/ into .agents/skills/ and .claude/skills/
bash scripts/verify-superpowers.sh --sync

# Package ONLY the Chrome Extension files into linkedin-feed-scroller.zip
bash scripts/package-extension.sh
```

## Visual Brainstorming Companion

### In Arena.ai Agent Mode (Live Preview)
Start via `start_process` with `name: "Brainstorm Companion"`:
```bash
bash .agents/superpowers/skills/brainstorming/scripts/start-server.sh \
  --project-dir /home/user/Linkerter \
  --host 0.0.0.0 \
  --hosted-preview \
  --foreground
```

### On Local Desktop (macOS / Linux / Windows)
```bash
bash .agents/superpowers/skills/brainstorming/scripts/start-server.sh \
  --project-dir "$(pwd)" \
  --open
```
