#!/usr/bin/env bash
#
# plan-open — open PRs for planning/ branches pushed by the research agent.
#
# Usage: ./scripts/plan-open.sh
#
# The Unusonic Research Agent (scheduled remote Claude session) writes
# thinking docs to planning/ and pushes branches named planning/YYYY-MM-DD-<slug>.
# It tries to open PRs itself, but the cloud environment's GitHub token has
# only push scope, not pull_requests:write, so the PR never actually gets
# created and the branch sits idle on origin.
#
# This script is the local workaround. It finds any planning/* branch on
# origin that doesn't have a PR yet and opens one, using the thinking doc
# as the PR body and the doc's first-line heading as the PR title.
#
# Idempotent — safe to run repeatedly. Branches with existing PRs (open,
# closed, or merged) are skipped.
#
# Requirements:
#   - gh CLI authenticated (`gh auth login`)
#   - jq installed
#   - Run from anywhere; works off the REPO constant below.

set -euo pipefail

REPO="danarthur/unusonic"

# ── Preflight ───────────────────────────────────────────────────────────────

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found. Install: brew install gh" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq not found. Install: brew install jq" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

# ── Discover planning branches on origin ───────────────────────────────────

branches=$(gh api "repos/$REPO/branches?per_page=100" \
  --jq '.[] | select(.name | startswith("planning/")) | .name' 2>/dev/null || true)

if [ -z "$branches" ]; then
  echo "No planning/* branches on origin. Nothing to do."
  exit 0
fi

tmp_body=$(mktemp)
trap 'rm -f "$tmp_body"' EXIT

opened=0
skipped=0
failed=0

# ── Process each branch ────────────────────────────────────────────────────

while IFS= read -r branch; do
  # Skip if ANY PR (open, closed, or merged) already exists for this branch.
  existing=$(gh pr list --repo "$REPO" --state all --head "$branch" \
    --json number,state --jq '.[0] // empty' 2>/dev/null || true)

  if [ -n "$existing" ]; then
    num=$(echo "$existing" | jq -r '.number')
    state=$(echo "$existing" | jq -r '.state')
    printf "  skip   %s (PR #%s %s)\n" "$branch" "$num" "$state"
    skipped=$((skipped + 1))
    continue
  fi

  # The thinking doc lives at planning/<slug>.md when the branch is planning/<slug>.
  doc_path="${branch}.md"

  if ! gh api "repos/$REPO/contents/$doc_path?ref=$branch" --jq '.content' 2>/dev/null \
       | base64 -d > "$tmp_body" 2>/dev/null \
     || [ ! -s "$tmp_body" ]; then
    printf "  skip   %s (no %s on branch)\n" "$branch" "$doc_path"
    skipped=$((skipped + 1))
    continue
  fi

  # Use the doc's first '# ' heading as the PR title; fall back to the branch name.
  title=$(grep -m1 '^# ' "$tmp_body" | sed 's/^# //')
  [ -z "$title" ] && title="plan: $(basename "$branch")"

  # Open the PR.
  if pr_url=$(gh pr create --repo "$REPO" \
              --base main --head "$branch" \
              --title "$title" --body-file "$tmp_body" 2>&1); then
    printf "  open   %s\n         %s\n" "$branch" "$pr_url"
    opened=$((opened + 1))
  else
    printf "  FAIL   %s\n         %s\n" "$branch" "$pr_url"
    failed=$((failed + 1))
  fi
done <<< "$branches"

# ── Summary ─────────────────────────────────────────────────────────────────

echo
printf "Done. Opened: %d  Skipped: %d  Failed: %d\n" "$opened" "$skipped" "$failed"

[ "$failed" -eq 0 ] || exit 1
