#!/usr/bin/env bash
# Truncate Docker container JSON logs to control disk usage on the VM.
set -euo pipefail
echo "==> Rotating (truncating) container logs"
for cid in $(docker compose ps -q); do
  logpath="$(docker inspect --format='{{.LogPath}}' "$cid" 2>/dev/null || true)"
  if [ -n "$logpath" ] && [ -f "$logpath" ]; then
    : > "$logpath"
    echo "  truncated $logpath"
  fi
done
echo "==> Done"
