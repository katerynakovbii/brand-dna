#!/usr/bin/env bash
# Usage: commit-report.sh <file> <commit message>
# Commits one report file and pushes, rebasing and retrying when parallel runs race.
set -euo pipefail

file="$1"
msg="$2"

if [[ ! -f "$file" ]]; then
  echo "No report file to commit."
  exit 0
fi

git config user.name >/dev/null || git config user.name "github-actions[bot]"
git config user.email >/dev/null || git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "$file"
git commit -q -m "$msg"
branch="$(git rev-parse --abbrev-ref HEAD)"

for attempt in 1 2 3 4 5; do
  if git push -q origin "HEAD:$branch" 2>/dev/null; then
    echo "Pushed on attempt $attempt."
    exit 0
  fi
  sleep "${RETRY_SLEEP:-$(( (RANDOM % 11) + 2 ))}"
  git pull -q --rebase origin "$branch"
done

echo "Push failed after 5 attempts." >&2
exit 1
