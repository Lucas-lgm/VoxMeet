#!/bin/bash
# Deploy landing/ directory to gh-pages branch
set -euo pipefail

WORKTREE=$(mktemp -d)
trap 'rm -rf "$WORKTREE"; git worktree prune' EXIT

git fetch origin gh-pages 2>/dev/null || true
git worktree add "$WORKTREE" gh-pages 2>/dev/null ||
  git worktree add --orphan "$WORKTREE" gh-pages

# Sync landing content into worktree
rsync -a --delete landing/ "$WORKTREE"/

cd "$WORKTREE"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
  exit 0
fi
git commit -m "deploy: update landing page"
git push origin gh-pages
echo "Deployed!"
