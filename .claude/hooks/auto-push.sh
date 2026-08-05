#!/usr/bin/env bash
# Stop hook: commit and push app changes to main after Claude finishes a turn.
#
# Deploy is deliberately NOT run here. Pushing to main triggers the CI
# workflow, and CI success triggers .github/workflows/deploy.yml, which SSHes
# to the VPS and runs deploy.sh. Keeping deploy in Actions means CI stays the
# gate in front of production rather than being bypassed from a dev machine.
#
# Scope is frontend/ and backend/ only -- the app itself. That keeps the
# untracked hrnavinos-erp/ duplicate and the root package-lock.json out of
# every commit, and leaves infra edits (deployment/, .github/, docs/) to be
# reviewed and pushed by hand.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 0

LOG_DIR="${TMPDIR:-/tmp}"

# Stop hooks talk to the user through a JSON systemMessage on stdout. Always
# exit 0: a nonzero exit or a "block" decision would feed back into the model
# and risk re-triggering this same hook.
emit() {
  local m=${1//\\/\\\\}
  m=${m//\"/\\\"}
  m=${m//$'\n'/\\n}
  printf '{"systemMessage":"%s"}\n' "$m"
  exit 0
}

# Nothing touched under the app -> stay completely silent.
[ -n "$(git status --porcelain -- frontend backend)" ] || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
[ "$branch" = "main" ] || emit "Auto-push skipped: on branch '$branch', not main."

# Same two checks CI runs, so a build that would fail CI never reaches main.
if ! (cd frontend && npm run lint) >"$LOG_DIR/hrn-lint.log" 2>&1; then
  emit "Auto-push SKIPPED: oxlint failed. Nothing committed. See $LOG_DIR/hrn-lint.log"
fi
if ! (cd frontend && npm run build) >"$LOG_DIR/hrn-build.log" 2>&1; then
  emit "Auto-push SKIPPED: frontend build failed. Nothing committed. See $LOG_DIR/hrn-build.log"
fi

# Everything above is read-only. Set HRN_AUTOPUSH_DRY_RUN=1 to exercise the
# branch check and the CI gates without writing a commit or pushing.
if [ "${HRN_AUTOPUSH_DRY_RUN:-}" = "1" ]; then
  pending=$(git status --porcelain -- frontend backend | wc -l | tr -d ' ')
  emit "DRY RUN: on main, lint+build passed; would commit and push $pending file(s)."
fi

git add -A -- frontend backend

# An empty index here means the turn's work was already committed by hand
# during the turn -- fall through to the push so that better-worded commit
# still ships instead of being stranded locally.
if ! git diff --cached --quiet; then
  files=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -q -m "Auto-commit: app changes ($files file(s))

Committed automatically by the Claude Code Stop hook after an in-session
edit. See the session transcript for what prompted the change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" \
    || emit "Auto-push SKIPPED: git commit failed. Changes are staged, not committed."
fi

ahead=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
[ "$ahead" -gt 0 ] || exit 0

if git push -q origin main >"$LOG_DIR/hrn-push.log" 2>&1; then
  emit "Auto-pushed $(git rev-parse --short HEAD) to main ($ahead commit(s)). CI is running; deploy follows if CI passes."
else
  emit "Committed locally but PUSH FAILED -- $ahead commit(s) still local. See $LOG_DIR/hrn-push.log"
fi
