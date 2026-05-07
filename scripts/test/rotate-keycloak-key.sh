#!/usr/bin/env bash
# rotate-keycloak-key.sh — force a new RSA signing key in realm `poc`.
# Used by quickstart §8 and the CA-007 Newman scenario to force the gateway
# to refresh JWKS via ms-auth on the first token signed with the new kid.
set -euo pipefail

REALM="${REALM:-poc}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
KCADM=/opt/keycloak/bin/kcadm.sh

docker compose exec -T keycloak ${KCADM} \
  config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${ADMIN_USER}" \
  --password "${ADMIN_PASS}"

docker compose exec -T keycloak ${KCADM} \
  create components \
  -r "${REALM}" \
  -s "name=poc-rsa-rotated-$(date +%s)" \
  -s providerId=rsa-generated \
  -s providerType=org.keycloak.keys.KeyProvider \
  -s 'config.priority=["200"]' \
  -s 'config.enabled=["true"]' \
  -s 'config.active=["true"]' \
  -s 'config.algorithm=["RS256"]' \
  -s 'config.keySize=["2048"]'

echo "[rotate] new RSA key provisioned in realm ${REALM}."
