#!/bin/bash
# Deploy landing/ directory to gh-pages branch
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
WORKTREE=$(mktemp -d)
trap 'rm -rf "$WORKTREE"; git -C "$ROOT" worktree prune' EXIT

git fetch origin gh-pages 2>/dev/null || true

if git rev-parse --verify gh-pages >/dev/null 2>&1; then
  git -C "$ROOT" worktree add "$WORKTREE" gh-pages
else
  git -C "$ROOT" worktree add --orphan "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan gh-pages
fi

# Sync landing content into worktree
rsync -a --delete --exclude=.git "$ROOT/landing/" "$WORKTREE"/

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "No changes to deploy."
  git -C "$ROOT" worktree remove "$WORKTREE"
  exit 0
fi
git -C "$WORKTREE" commit -m "deploy: update landing page"
git -C "$WORKTREE" push origin gh-pages
git -C "$ROOT" worktree remove "$WORKTREE"
echo "Deployed!"
