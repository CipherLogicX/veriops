#!/usr/bin/env bash
set -euo pipefail

echo "========== 1) BACKEND DIR STRUCTURE =========="
find backend/app -type d | sort

echo
echo "========== 2) MODELS FILES =========="
ls -la backend/app/models/

echo
echo "========== 3) MODELS CONTENT =========="
for f in backend/app/models/*.py; do
  echo
  echo "----- $f -----"
  sed -n '1,220p' "$f"
done

echo
echo "========== 4) API STRUCTURE =========="
find backend/app/api -type f | sort

echo
echo "========== 5) API ROUTES QUICK VIEW =========="
grep -RniE "APIRouter|@router|include_router|prefix=|def " backend/app/api backend/app/main.py | head -300

echo
echo "========== 6) SERVICES =========="
find backend/app/services -type f 2>/dev/null | sort || true

echo
echo "========== 7) AI FILES =========="
find backend/app -type f | grep -Ei "ai|llm|openai|local|model" || true

echo
echo "========== 8) AI CONTENT =========="
for f in $(find backend/app -type f | grep -Ei "ai|llm|openai|local" || true); do
  echo
  echo "----- $f -----"
  sed -n '1,260p' "$f"
done

echo
echo "========== 9) ENV AI SETTINGS =========="
grep -nE "AI|LOCAL|MODEL|OPENAI|OLLAMA|LLM" .env .env.example 2>/dev/null || true

echo
echo "========== DONE =========="
