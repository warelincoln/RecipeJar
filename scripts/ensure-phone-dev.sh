#!/usr/bin/env bash
# Start or verify API (:3000) + Metro (:8081) for physical-device testing.
set -euo pipefail
# Cursor sets CI=1 which makes Metro skip file watching (no Fast Refresh).
unset CI
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

api_ok() { lsof -iTCP:3000 -sTCP:LISTEN -n -P >/dev/null 2>&1; }
metro_ok() { lsof -iTCP:8081 -sTCP:LISTEN -n -P >/dev/null 2>&1; }

if api_ok && metro_ok; then
  echo "RecipeJar: API (3000) and Metro (8081) already running."
  curl -s -m 2 http://127.0.0.1:3000/health || true
  echo ""
  exit 0
fi

if api_ok && ! metro_ok; then
  echo "RecipeJar: starting Metro only..."
  (cd "$ROOT" && nohup npm run start -w @recipejar/mobile >> /tmp/recipejar-metro.log 2>&1 &) 
elif ! api_ok && metro_ok; then
  echo "RecipeJar: starting API only..."
  (cd "$ROOT" && nohup npm run dev -w @recipejar/server >> /tmp/recipejar-api.log 2>&1 &)
else
  echo "RecipeJar: starting API + Metro (npm run dev:phone)..."
  (cd "$ROOT" && nohup npm run dev:phone >> /tmp/recipejar-dev-phone.log 2>&1 &)
fi

for _ in $(seq 1 45); do
  sleep 1
  if api_ok && metro_ok; then
    echo "RecipeJar: ready."
    curl -s -m 2 http://127.0.0.1:3000/health || true
    echo ""
    exit 0
  fi
done

echo "RecipeJar: timed out waiting for ports 3000/8081. Check logs in /tmp/recipejar-*.log"
exit 1
