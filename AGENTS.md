# Linkerter — Agent Instructions & Superpowers Bootstrap

<EXTREMELY_IMPORTANT>
You have **Superpowers** (`obra/superpowers` v7.0.0) fully installed in this repository.

The `using-superpowers` bootstrap skill is included below and is **ALREADY LOADED** for this session — follow it immediately and do **not** re-load `using-superpowers` again.

If you think there is even a **1% chance** another skill might apply to what you are doing, you **ABSOLUTELY MUST** invoke that skill **BEFORE ANY response or action** (including clarifying questions, exploring the codebase, planning, or writing code).

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

## How to Invoke Skills in This Repository

- **Harnesses with a native skill tool** (Claude Code `Skill`, OpenCode `skill`, Gemini CLI `activate_skill`, Hermes `skill_view`, Kimi `Skill`): invoke the skill through your native tool (project skills are pre-installed in both `.claude/skills/` and `.agents/skills/`).
- **Harnesses without a native `Skill` tool** (including **Arena.ai Agent Mode**, Pi, Antigravity, or custom runners): **reading `.agents/skills/<skill-name>/SKILL.md` with `read_file` IS your platform's skill-invocation mechanism** — read the full `SKILL.md` before responding or acting, announce `"Using [skill] to [purpose]"`, and follow it strictly.

## Complete Installed Skills Index (`.agents/skills/<name>/SKILL.md`)

Check this table BEFORE every response or action:

| Skill | When You MUST Invoke It | Path |
|---|---|---|
| `brainstorming` | **BEFORE any creative or feature work** — creating features, building UI/components, adding functionality, modifying behavior, or planning anything new | `.agents/skills/brainstorming/SKILL.md` |
| `systematic-debugging` | **BEFORE proposing fixes** for any bug, regression, DOM selector breakage, test failure, or unexpected behavior | `.agents/skills/systematic-debugging/SKILL.md` |
| `writing-plans` | **BEFORE touching code** once requirements/spec exist for a multi-step task (saves plan to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`) | `.agents/skills/writing-plans/SKILL.md` |
| `executing-plans` | When executing an implementation plan inline in the current session (default on **Arena.ai Agent Mode** or whenever no child subagent tool exists) | `.agents/skills/executing-plans/SKILL.md` |
| `subagent-driven-development` | When executing implementation plans with fresh per-task implementer + reviewer subagents on harnesses with native subagent tools | `.agents/skills/subagent-driven-development/SKILL.md` |
| `dispatching-parallel-agents` | When facing 2+ independent tasks with no shared state or sequential dependencies | `.agents/skills/dispatching-parallel-agents/SKILL.md` |
| `test-driven-development` | **BEFORE writing implementation code** for any feature or bugfix (strict RED → GREEN → REFACTOR cycle) | `.agents/skills/test-driven-development/SKILL.md` |
| `verification-before-completion` | **BEFORE claiming work is done, fixed, or passing**, or before committing / opening PRs — run real verification commands and inspect output first | `.agents/skills/verification-before-completion/SKILL.md` |
| `requesting-code-review` | Between tasks, after completing features, or before merging to verify implementation against the spec/plan | `.agents/skills/requesting-code-review/SKILL.md` |
| `receiving-code-review` | When receiving code review feedback — verify technically before implementing suggestions | `.agents/skills/receiving-code-review/SKILL.md` |
| `using-git-worktrees` | Before executing plans or isolated feature work (see environment rules below) | `.agents/skills/using-git-worktrees/SKILL.md` |
| `finishing-a-development-branch` | When implementation is complete and all checks pass to decide merge / PR / branch handoff | `.agents/skills/finishing-a-development-branch/SKILL.md` |
| `writing-skills` | When creating, editing, or pressure-testing skills in `.agents/` / `.claude/` | `.agents/skills/writing-skills/SKILL.md` |
| `diagnosing-superpowers` | When your human partner asks why a Superpowers session misbehaved or wants a session diagnostic report | `.agents/skills/diagnosing-superpowers/SKILL.md` |
| `using-superpowers` | Core skill discipline & platform adaptation pointers (already loaded here) | `.agents/skills/using-superpowers/SKILL.md` |

## Skill Priority & Red Flags

1. **Process skills always come FIRST:**
   - Building/adding/changing behavior → invoke `brainstorming` first (then `writing-plans` → `executing-plans` / `subagent-driven-development` → `test-driven-development` → `verification-before-completion`).
   - Fixing a bug or broken behavior → invoke `systematic-debugging` first (then `test-driven-development` → `verification-before-completion`).
2. **Never rationalize skipping a skill:**
   - *"Let me explore the codebase first"* → **STOP.** Invoke the applicable process skill BEFORE exploring or asking questions.
   - *"This is a small change"* → **STOP.** Invoke `brainstorming` or `systematic-debugging` first; `brainstorming` itself sizes small tasks quickly.
   - *"I remember what the skill says"* → **STOP.** Always read the current `SKILL.md` file in `.agents/skills/<name>/SKILL.md`.

## Platform Adaptation & Tool Mapping References

- **Arena.ai Agent Mode:** Read `.agents/skills/using-superpowers/references/arena-tools.md` when using Visual Companion (`start_process`), workspace/branch workflows, or plan execution scripts:
  - **Visual Brainstorming Companion in Arena Live Preview:** launch via `start_process` (`name: "Brainstorm Companion"`):
    ```bash
    bash .agents/superpowers/skills/brainstorming/scripts/start-server.sh --project-dir /home/user/Linkerter --host 0.0.0.0 --hosted-preview --foreground
    ```
  - **Session Branch Rule on Arena:** When running inside Arena (`E2B_SANDBOX` set or branch matching `arena/*`), the container and active `arena/*` branch ARE already an isolated workspace. Do **not** switch branches, rename the branch, or create git worktrees on another branch; work directly on the active session branch and push only to `origin <current-branch>`.
  - **Local CLI / IDE Sessions:** Outside Arena sandboxes, `.worktrees/` and `.superpowers/` are pre-configured in `.gitignore` for full git worktree isolation and local visual companion sessions.
- **Other Harnesses:** See `.agents/skills/using-superpowers/references/` (`claude-code-tools.md`, `codex-tools.md`, `gemini-tools.md`, `pi-tools.md`, `antigravity-tools.md`, `hermes-tools.md`, `muse-tools.md`), `opencode.json`, and `GEMINI.md`.
</EXTREMELY_IMPORTANT>

---

## Linkerter Project Overview & Architecture

**Linkerter** (**LinkedIn Feed Scroller**, v1.9.0) is a zero-dependency **Manifest V3 Chrome Extension** for adaptive human-like LinkedIn feed scrolling and local multilingual (English, French, Arabic + optional weak Algerian dialect/Arabizi) hiring/recruiting post detection.

### Key Source Files

| File | Responsibility |
|---|---|
| `manifest.json` | Chrome Extension MV3 manifest defining permissions (`activeTab`, `storage`, `https://www.linkedin.com/*`), popup action, and ordered content scripts |
| `linkedin-hiring-rules.js` | Multilingual phrase, hashtag, contact-cue, and job-link signal dictionaries exposed on `globalThis.__LI_FEED_HIRING_RULES__` |
| `linkedin-hiring-classifier.js` | Unicode/Arabic text normalization, email extraction (including obfuscated patterns), and weighted explainable classification on `globalThis.__LI_FEED_HIRING_CLASSIFIER__` |
| `linkedin-hiring-monitor.js` | Live DOM mutation/scroll scanner, auto-"See more" expansion, category feed filter, local Chrome storage history, and JSON/CSV export archive |
| `content.js` | Per-tab adaptive human-like feed scroll controller (`standard`, `fast`, `super_fast`) coordinating with popup messages and monitor pauses |
| `popup.html` / `popup.css` / `popup.js` | Extension toolbar popup UI for scroll controls, per-window pinned tab selection, hiring filter/labels, DOM compatibility check, local history, and JSON/CSV exports |

### Non-Negotiable Domain Invariants

1. **Zero external network requests / full local privacy:** Never upload post content, telemetry, or analytics from the extension.
2. **Read-only on LinkedIn social graph:** Never like, comment, connect, message, or automate engagement actions.
3. **Explainable classifier constraints:** Job-title families alone and email/contact details alone must **never** classify a post as hiring-related without corroborating hiring signals; content scripts load strictly in the `manifest.json` sequence (`rules` → `classifier` → `monitor` → `content`).
4. **Superpowers Artifacts & Helpers:**
   - Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (committed)
   - Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (committed)
   - Runtime workspaces: `.superpowers/brainstorm/` & `.superpowers/sdd/` (git-ignored)
   - Verify Superpowers installation & extension integrity: `bash scripts/verify-superpowers.sh`
   - Package clean unpacked Chrome Extension zip (`linkedin-feed-scroller.zip`): `bash scripts/package-extension.sh`
