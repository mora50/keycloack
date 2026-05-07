#!/usr/bin/env bash
# chaos-msauth-down.sh — exercise CA-008/CA-009 under load.
# 1) start a 500 RPS k6 run against /api/products (cached kid path)
# 2) after 10s: docker compose stop ms-auth
# 3) hold 30s; assert 2xx rate stays at 100%
# 4) restart ms-auth; let TTL expire to demo recovery.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
USERNAME="${USERNAME:-alice}"
PASSWORD="${PASSWORD:-alice}"

echo "[chaos] warming JWKS cache via 1 request..."
TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" | jq -r .access_token)

curl -s -o /dev/null "${BASE_URL}/api/products" -H "Authorization: Bearer ${TOKEN}"

echo "[chaos] starting 500 RPS load (40s total)..."
TOKEN="${TOKEN}" BASE_URL="${BASE_URL}" \
  k6 run --vus 50 --duration 40s --env BASE_URL="${BASE_URL}" --env TOKEN="${TOKEN}" \
       "$(dirname "$0")/chaos-msauth-down.k6.js" &
K6_PID=$!

sleep 10
echo "[chaos] stopping ms-auth..."
docker compose stop ms-auth

sleep 30
echo "[chaos] restarting ms-auth..."
docker compose start ms-auth

wait "${K6_PID}"
echo "[chaos] done. Inspect k6 summary for error rate during the outage window."
