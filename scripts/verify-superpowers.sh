#!/usr/bin/env bash
# Verify (and optionally sync) the full obra/superpowers installation + Linkerter extension integrity.
# Usage: bash scripts/verify-superpowers.sh [--sync]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANONICAL_SKILLS="$REPO_ROOT/.agents/superpowers/skills"
AGENTS_SKILLS="$REPO_ROOT/.agents/skills"
CLAUDE_SKILLS="$REPO_ROOT/.claude/skills"

# Documented third-party skills installed alongside superpowers (see CHANGELOG).
# They are excluded from the byte-for-byte canonical comparison but must exist.
EXTRA_SKILLS=(impeccable)

if [[ "${1:-}" == "--sync" ]]; then
  rm -rf "$AGENTS_SKILLS" "$CLAUDE_SKILLS"
  cp -a "$CANONICAL_SKILLS" "$AGENTS_SKILLS"
  cp -a "$CANONICAL_SKILLS" "$CLAUDE_SKILLS"
  echo "Synced $CANONICAL_SKILLS -> .agents/skills and .claude/skills"
fi

passed=0
pass() {
  echo "  PASS: $1"
  passed=$((passed + 1))
}
fail() {
  echo "  FAIL: $1" >&2
  exit 1
}

echo "=== Verifying obra/superpowers installation in Linkerter ==="

EXPECTED_SKILLS=(
  brainstorming
  diagnosing-superpowers
  dispatching-parallel-agents
  executing-plans
  finishing-a-development-branch
  receiving-code-review
  requesting-code-review
  subagent-driven-development
  systematic-debugging
  test-driven-development
  using-git-worktrees
  using-superpowers
  verification-before-completion
  writing-plans
  writing-skills
)

for skill in "${EXPECTED_SKILLS[@]}"; do
  [[ -f "$CANONICAL_SKILLS/$skill/SKILL.md" ]] || fail "Missing canonical skill: $skill"
done
pass "All ${#EXPECTED_SKILLS[@]} core skills present in .agents/superpowers/skills/"

diff_args=()
for extra in "${EXTRA_SKILLS[@]}"; do diff_args+=("--exclude=$extra"); done
for extra in "${EXTRA_SKILLS[@]}"; do
  [[ -f "$AGENTS_SKILLS/$extra/SKILL.md" ]] || fail "Declared extra skill missing from .agents/skills: $extra"
  [[ -f "$CLAUDE_SKILLS/$extra/SKILL.md" ]] || fail "Declared extra skill missing from .claude/skills: $extra"
done
diff -rq "${diff_args[@]}" "$CANONICAL_SKILLS" "$AGENTS_SKILLS" >/dev/null || fail ".agents/skills differs from canonical skills (run with --sync)"
pass ".agents/skills matches canonical skills byte-for-byte (plus declared extras: ${EXTRA_SKILLS[*]})"

diff -rq "${diff_args[@]}" "$CANONICAL_SKILLS" "$CLAUDE_SKILLS" >/dev/null || fail ".claude/skills differs from canonical skills (run with --sync)"
pass ".claude/skills matches canonical skills byte-for-byte (plus declared extras: ${EXTRA_SKILLS[*]})"

for f in AGENTS.md CLAUDE.md GEMINI.md opencode.json .gitignore .gitattributes docs/superpowers/README.md; do
  [[ -f "$REPO_ROOT/$f" ]] || fail "Missing root config/doc file: $f"
done
[[ -d "$REPO_ROOT/docs/superpowers/specs" ]] || fail "Missing docs/superpowers/specs directory"
[[ -d "$REPO_ROOT/docs/superpowers/plans" ]] || fail "Missing docs/superpowers/plans directory"
pass "Root agent bootstrap files & docs/superpowers/{specs,plans} present"

git -C "$REPO_ROOT" check-ignore -q .superpowers/brainstorm/test && \
git -C "$REPO_ROOT" check-ignore -q .worktrees/test \
  || fail ".superpowers/ and .worktrees/ must be git-ignored"
pass ".superpowers/ and .worktrees/ runtime workspaces are git-ignored"

hook_out="$(CLAUDE_PLUGIN_ROOT="$REPO_ROOT/.agents/superpowers" bash "$REPO_ROOT/.agents/superpowers/hooks/session-start")"
node -e '
const data = JSON.parse(process.argv[1]);
if (!data.hookSpecificOutput || !data.hookSpecificOutput.additionalContext.includes("<EXTREMELY_IMPORTANT>")) {
  process.exit(1);
}
' "$hook_out" || fail "hooks/session-start JSON validation failed"
pass "hooks/session-start emits valid bootstrap JSON"

echo "=== Verifying Linkerter Chrome Extension integrity ==="

for js in linkedin-shared.js background.js content.js popup-i18n.js popup-export.js popup-results.js popup.js linkedin-hiring-rules.js linkedin-hiring-classifier.js linkedin-hiring-monitor.js; do
  node --check "$REPO_ROOT/$js" || fail "Syntax error in $js"
done
pass "All 10 Chrome Extension JavaScript files pass node --check"

for script in scripts/generate-icons.cjs tests/browser/run.cjs tests/browser/fixture-server.cjs tests/browser/extension.test.cjs; do
  node --check "$REPO_ROOT/$script" || fail "Syntax error in $script"
done
for doc in PRIVACY.md CHANGELOG.md CONTRIBUTING.md SUPPORT.md SECURITY.md docs/store/listing.md docs/store/privacy-practices.md docs/store/release-checklist.md; do
  [[ -f "$REPO_ROOT/$doc" ]] || fail "Missing release document: $doc"
done
# Canonical CI workflow is .github/workflows/ci.yml; until the repo's GitHub
# App is granted `workflows` permission, the staged docs/ci/ci.yml is accepted
# (see docs/ci/README.md).
[[ -f "$REPO_ROOT/.github/workflows/ci.yml" || -f "$REPO_ROOT/docs/ci/ci.yml" ]] \
  || fail "Missing CI workflow: .github/workflows/ci.yml (or staged docs/ci/ci.yml)"
pass "Release tooling syntax and privacy/store/support documents pass verification"

node -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Expected MV3");
if (!fs.existsSync(path.join(root, manifest.action.default_popup))) throw new Error("Missing popup HTML");
for (const reference of [...Object.values(manifest.icons || {}), ...Object.values(manifest.action.default_icon || {})]) {
  if (!fs.existsSync(path.join(root, reference))) throw new Error("Missing icon: " + reference);
}
for (const cs of manifest.content_scripts) {
  for (const js of cs.js) {
    if (!fs.existsSync(path.join(root, js))) throw new Error("Missing content script: " + js);
  }
}
require(path.join(root, "linkedin-hiring-rules.js"));
require(path.join(root, "linkedin-hiring-classifier.js"));
const sample = globalThis.__LI_FEED_HIRING_CLASSIFIER__.classify(
  "We are actively hiring frontend engineers! Send your CV to jobs@acme.io #hiring"
);
if (!sample || !sample.category || sample.score <= 0) {
  throw new Error("Classifier smoke test failed: " + JSON.stringify(sample));
}
' "$REPO_ROOT" || fail "Manifest or hiring classifier smoke check failed"
pass "manifest.json and multilingual hiring classifier pass smoke verification"

echo ""
echo "All $passed checks passed."
