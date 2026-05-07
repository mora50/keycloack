#!/usr/bin/env bash
# Counts log lines from ms-auth that match a /auth/jwks access in the last N seconds.
# Used by the CA-003 Newman scenario to assert zero outbound JWKS fetches during
# a 100x cache-hit window.
set -euo pipefail

SECONDS_BACK="${1:-10s}"
SERVICE="${2:-ms-auth}"

count=$(docker compose logs --since "${SECONDS_BACK}" "${SERVICE}" 2>/dev/null \
        | grep -c "GET /auth/jwks" || true)

echo "${count}"
