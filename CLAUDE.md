# CLAUDE.md — Linkerter & Superpowers Project Guide

@AGENTS.md

## Claude Code & Arena Quick Notes

- **Skills location:** All 15 `obra/superpowers` v7.0.0 skills are installed directly in `.claude/skills/` (mirrored in `.agents/skills/` and `.agents/superpowers/skills/`).
- **Skill invocation:**
  - In **Claude Code**: invoke skills via the `Skill` tool (or slash commands such as `/brainstorming`, `/systematic-debugging`, `/writing-plans`, `/subagent-driven-development`, `/executing-plans`, `/test-driven-development`, `/verification-before-completion`).
  - In **Arena.ai Agent Mode**: invoke skills by reading `.claude/skills/<skill-name>/SKILL.md` with `read_file` before any response or action, and follow `.claude/skills/using-superpowers/references/arena-tools.md`.
- **Keep skill directories in sync:** After editing or adding any skill under `.agents/superpowers/skills/`, run `bash scripts/verify-superpowers.sh --sync` to sync `.agents/skills/` and `.claude/skills/` and verify all checks pass.
