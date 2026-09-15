#!/usr/bin/env bash
# One-way cowork replication: this machine edits the dir, the homelab only
# receives (see spec/deploy.md). Watches the workspace and, on every change,
# rsyncs it to the homelab over Tailscale SSH and pings Edu to re-scan.
#
# Usage:
#   COWORK_REMOTE=lkz@homelab:/srv/ufrj ./tools/cowork-push.sh          # watch (needs fswatch)
#   COWORK_REMOTE=lkz@homelab:/srv/ufrj ./tools/cowork-push.sh --once   # single push
#
# Env:
#   COWORK_SRC     dir to replicate            (default ~/Desktop/UFRJ)
#   COWORK_REMOTE  rsync target host:path      (required, e.g. lkz@homelab:/srv/ufrj)
#   EDU_URL        Edu api base to ping after  (default https://homelab:8443/api → skip if unreachable)
#   DEBOUNCE       seconds to coalesce bursts  (default 5)
set -euo pipefail

SRC="${COWORK_SRC:-$HOME/Desktop/UFRJ}"
REMOTE="${COWORK_REMOTE:?set COWORK_REMOTE=user@host:/path}"
EDU_URL="${EDU_URL:-}"
DEBOUNCE="${DEBOUNCE:-5}"

push() {
  # --delete keeps the replica exact; excludes keep noise out of the homelab.
  rsync -az --delete \
    --exclude ".DS_Store" --exclude ".git" --exclude "node_modules" \
    "$SRC/" "$REMOTE/"
  echo "$(date '+%H:%M:%S') pushed $SRC -> $REMOTE"
  if [[ -n "$EDU_URL" ]]; then
    curl -fsS -m 10 -X POST "$EDU_URL/connectors/cowork/sync" >/dev/null 2>&1 \
      && echo "$(date '+%H:%M:%S') edu re-scan triggered" \
      || echo "$(date '+%H:%M:%S') edu unreachable — hourly sync will pick it up"
  fi
}

push
[[ "${1:-}" == "--once" ]] && exit 0

command -v fswatch >/dev/null || {
  echo "fswatch not found — brew install fswatch (or run with --once from cron)"; exit 1;
}
echo "watching $SRC (debounce ${DEBOUNCE}s) — ctrl-c to stop"
fswatch -o --latency "$DEBOUNCE" "$SRC" | while read -r _; do
  push || echo "$(date '+%H:%M:%S') push failed — will retry on next change"
done
