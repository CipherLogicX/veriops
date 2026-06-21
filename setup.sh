#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "TrackQA — Production Setup Check"
echo "================================="

# HARD STOP: .env must exist, never auto-generate
if [[ ! -f ".env" ]]; then
    echo -e "${RED}ERROR: .env not found.${NC}"
    echo ""
    echo "Production requires a manually configured .env file."
    echo ""
    echo "To set up:"
    echo "  1. Create .env manually using .env.example as a reference"
    echo "  2. Fill in all values — DO NOT copy example values directly"
    echo "  3. Run: bash setup.sh"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ .env found${NC}"

# Validate required variables
required_vars=(
    "POSTGRES_USER"
    "POSTGRES_PASSWORD"
    "POSTGRES_DB"
    "JWT_SECRET_KEY"
    "REDIS_PASSWORD"
    "FIRST_ADMIN_EMAIL"
    "FIRST_ADMIN_PASSWORD"
    "CORS_ORIGINS"
)

missing=()
for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || [[ "$(grep "^${var}=" .env | cut -d= -f2-)" == "" ]]; then
        missing+=("$var")
    fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}ERROR: Missing required variables in .env:${NC}"
    for v in "${missing[@]}"; do echo "  - $v"; done
    exit 1
fi

# Reject known-weak/example values
weak_patterns=(
    "CHANGE_THIS"
    "change_this"
    "CHANGE_ME"
    "example.com"
    "trackqa.*trackqa"
)

for pat in "${weak_patterns[@]}"; do
    if grep -qiE "${pat}" .env; then
        echo -e "${RED}ERROR: .env contains placeholder/example values (matched: ${pat}).${NC}"
        echo "Replace all placeholder values with real production values."
        exit 1
    fi
done

echo -e "${GREEN}✓ .env validated${NC}"

# Check SSL certs exist
if [[ ! -f "deployment/nginx/ssl/trackqa.crt" ]] || [[ ! -f "deployment/nginx/ssl/trackqa.key" ]]; then
    echo -e "${YELLOW}WARNING: SSL certificates not found at deployment/nginx/ssl/trackqa.{crt,key}${NC}"
    echo ""
    echo "For testing only, generate self-signed:"
    echo "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    echo "    -keyout deployment/nginx/ssl/trackqa.key \\"
    echo "    -out deployment/nginx/ssl/trackqa.crt \\"
    echo "    -subj '/CN=trackqa.local'"
    echo "  chmod 600 deployment/nginx/ssl/trackqa.key"
    echo ""
    echo "For production use a real certificate from your CA or Let's Encrypt."
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Setup checks passed. Starting services...${NC}"
echo ""

docker compose pull --quiet 2>/dev/null || true
docker compose up -d --build

echo ""
echo "Waiting for backend to be ready..."
max_wait=60
elapsed=0
while [[ $elapsed -lt $max_wait ]]; do
    if curl -fsS http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend healthy${NC}"
        break
    fi
    sleep 3
    elapsed=$((elapsed + 3))
done

if [[ $elapsed -ge $max_wait ]]; then
    echo -e "${RED}Backend did not start within ${max_wait}s. Check logs: docker compose logs backend${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}TrackQA is running.${NC}"
echo ""
echo "Health endpoints:"
echo "  https://your-domain/health"
echo "  https://your-domain/api/health"
echo "  https://your-domain/api/ready"
echo ""
echo "Local AI runtime:"
echo "  systemctl status trackqa-ai --no-pager"
echo "  curl -s http://127.0.0.1:8080/v1/models"
