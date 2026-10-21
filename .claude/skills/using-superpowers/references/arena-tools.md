# Arena.ai Agent Mode Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Arena.ai Agent Mode these resolve to the exact native tools below.

| Action skills request | Arena.ai Agent Mode equivalent |
|----------------------|-------------------------------|
| Read a file | `read_file` (`path`, optional `offset`, `limit`) |
| Read multiple files at once | Parallel `read_file` calls in the same response |
| Create a new file | `write_file` (`path`, `content`) |
| Edit a file | `edit_file` (`path`, `old_text`, `new_text`) |
| Run a one-shot shell command | `bash` (`command`, optional `cwd`, `timeout`) |
| Run a long-lived background process / preview server | `start_process`, `get_process_output`, `stop_process` |
| Search file contents / find files by name | `bash` with `rg`, `grep`, `find`, or `git ls-files` |
| Fetch a URL | `fetch_page` (`url`, optional `chunkIndex`) |
| Search the web | `web_search` (`query`, `depth`) |
| Ask your human partner a structured question | `ask_user` (for structured 2–4 option questions) or plain text in your turn response (for open-ended `brainstorming` questions) |
| Show a finished spec, plan, or deliverable file | `present_file` (`path`) |
| Invoke a skill | Read `.claude/skills/<skill-name>/SKILL.md` (or `.agents/skills/<skill-name>/SKILL.md`) with `read_file` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | Execute inline in the current session (prefer `executing-plans` over `subagent-driven-development`; issue independent read/bash calls in parallel) |
| Task tracking ("create a todo", "mark complete") | Track checkboxes in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` and ledger entries via `executing-plans/scripts/task-start` & `task-done` |

## Instructions file

When a skill mentions "your instructions file", on Arena.ai Agent Mode this is **`AGENTS.md`** (mirrored in **`CLAUDE.md`**) at the repository root.

## Invoking a skill

Arena.ai Agent Mode does not expose a separate `Skill` tool; reading the relevant `SKILL.md` via `read_file` IS the platform's sanctioned skill-loading mechanism:

- `.agents/skills/<skill-name>/SKILL.md` (also mirrored at `.claude/skills/<skill-name>/SKILL.md` and `.agents/superpowers/skills/<skill-name>/SKILL.md`)

Always invoke the relevant `SKILL.md` via `read_file` BEFORE responding or taking action whenever even a 1% chance exists that a skill applies. Do not re-load `using-superpowers` when it is already present in `AGENTS.md` / `CLAUDE.md`.

## Visual Brainstorming Companion in Arena Live Preview

Arena.ai proxies any server listening on `0.0.0.0` into an embedded HTTPS browser preview pane (`https://{port}-{sandboxId}.e2b.app`).

When your human partner accepts the visual companion offer during `brainstorming`:

1. Start the companion with **`start_process`** using `--hosted-preview` and `--foreground` so the process stays alive across turns, binds to `0.0.0.0`, omits iframe-blocking headers (`X-Frame-Options` / `frame-ancestors 'none'`), upgrades WebSockets over `wss://`, and accepts HTTPS proxy origins:

   ```bash
   bash .agents/superpowers/skills/brainstorming/scripts/start-server.sh \
     --project-dir /home/user/Linkerter \
     --host 0.0.0.0 \
     --hosted-preview \
     --foreground
   ```

   Pass `name: "Brainstorm Companion"` to `start_process`.
2. Read `$STATE_DIR/server-info` (under `/home/user/Linkerter/.superpowers/brainstorm/<session>/state/server-info`) to get `screen_dir` and `state_dir`.
3. Write screen fragments (`.html`) into `screen_dir` using `write_file`. The Live Preview updates automatically via WebSocket reload, and user clicks are written to `$STATE_DIR/events`.
4. Stop the server with `stop_process` when visual brainstorming finishes.

## Subagents & Parallel Execution

Arena.ai Agent Mode runs in a single top-level session without a separate child `Task` subagent tool:

- Never fabricate `Task` tool calls.
- When `writing-plans` hands off execution, recommend **Native (`superpowers:executing-plans`)**, using:
  - `bash .agents/superpowers/skills/executing-plans/scripts/task-start <PLAN_FILE> <N>`
  - `bash .agents/superpowers/skills/executing-plans/scripts/task-done <PLAN_FILE> <N> <BASE> -- <test command>`
  - `bash .agents/superpowers/skills/subagent-driven-development/scripts/review-package <PLAN_FILE> <MERGE_BASE> HEAD`
- For `brainstorming`'s builder check or final code review without a subagent tool, perform the review pass carefully with fresh eyes against `builder-check-prompt.md` / `code-reviewer.md`.
- Issue independent `read_file`, `bash`, `write_file`, and `edit_file` calls in parallel within a single turn whenever there are no data dependencies between them.

## Environment Detection: Session Branches & Git Worktrees

Arena.ai sessions run inside an isolated container bound to a dedicated session branch (`arena/...`):

- **During `using-git-worktrees`:** When `E2B_SANDBOX` / `E2B_SANDBOX_ID` is set or the current branch matches `arena/*`, the entire container and branch ARE already an isolated workspace. Do **not** switch branches, rename the branch, or create git worktrees on another branch — work directly at the repository root on the active `arena/*` session branch and proceed straight to project setup & baseline verification.
- **During `finishing-a-development-branch`:** Keep all commits on the active `arena/*` session branch. Never switch to or push to another branch; push with `git push origin <active-session-branch>` and open PRs from `<active-session-branch>` via `gh pr create` when requested.
