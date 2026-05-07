#!/usr/bin/env bash
# forge-expired-token.sh — login normally then back-date the token's `exp`.
# Real signature against the realm's active key would require kcadm + a custom
# signer; for the POC, we obtain a fresh token and wait the minimum TTL until
# it is naturally expired. To accelerate, we shrink the realm token lifespan
# temporarily to 1 second.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
USERNAME="${USERNAME:-alice}"
PASSWORD="${PASSWORD:-alice}"
REALM="${REALM:-poc}"

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${KEYCLOAK_ADMIN:-admin}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD:-admin}" >/dev/null

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh \
  update realms/"${REALM}" -s 'accessTokenLifespan=1' >/dev/null

TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" | jq -r .access_token)

# Wait for the token to expire (1s lifespan + 2s safety margin)
sleep 3

# Restore default lifespan (5m).
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh \
  update realms/"${REALM}" -s 'accessTokenLifespan=300' >/dev/null

echo "${TOKEN}"
