#!/usr/bin/env bash
# One-command setup for TrackQA on an internal VM.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> VeriOps setup"

# 1. .env must exist — never auto-create
if [ ! -f .env ]; then
  echo "ERROR: Production .env missing"
  echo "Create .env manually using .env.example as a reference."
  exit 1
fi
echo "==> .env found"

# 2. Self-signed TLS cert (acceptable for first internal version)
SSL_DIR="deployment/nginx/ssl"
mkdir -p "$SSL_DIR"
if [ ! -f "$SSL_DIR/trackqa.crt" ]; then
  echo "==> Generating self-signed TLS certificate"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$SSL_DIR/trackqa.key" \
    -out "$SSL_DIR/trackqa.crt" \
    -subj "/C=US/ST=Internal/L=Internal/O=TrackQA/CN=trackqa.local"
else
  echo "==> TLS certificate already present"
fi

# 3. Build & start
echo "==> Building and starting containers"
docker compose up -d --build

# 4. Wait for backend health
echo "==> Waiting for backend health..."
for i in $(seq 1 30); do
  if docker compose exec -T backend curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "==> Backend healthy"
    break
  fi
  sleep 3
done

echo ""
echo "==================================================="
echo " VeriOps is up."
echo "   App:        https://localhost  (self-signed cert)"
echo "   API docs:   available only in development mode (ENVIRONMENT=development)"
echo "   Admin login: value of FIRST_ADMIN_EMAIL in .env"
echo "==================================================="
