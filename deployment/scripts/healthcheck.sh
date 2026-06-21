#!/usr/bin/env bash
# Quick health probe across all services. Exit non-zero if anything is down.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  [OK]   $1"; else echo "  [FAIL] $1"; FAIL=1; fi; }

echo "==> TrackQA health"
check "postgres"  "docker compose exec -T postgres pg_isready"
check "redis"     "docker compose exec -T redis redis-cli ping"
check "backend"   "docker compose exec -T backend curl -fsS http://localhost:8000/health"
check "frontend"  "docker compose exec -T frontend wget -qO- http://localhost/"
check "edge http" "curl -fsS http://localhost/health"

[ "$FAIL" -eq 0 ] && echo "==> All healthy" || echo "==> One or more checks FAILED"
exit "$FAIL"
