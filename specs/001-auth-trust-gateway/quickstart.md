# Quickstart: Auth Trust Gateway

**Date**: 2026-05-04
**Branch**: `001-auth-trust-gateway`
**Goal**: Subir todo o ambiente em um único comando e exercitar o caminho feliz e os principais cenários de aceitação.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Comando para verificar |
|-----------|---------------|------------------------|
| Docker Engine | 24+ | `docker version` |
| Docker Compose | v2.20+ | `docker compose version` |
| `curl` | qualquer | `curl --version` |
| `jq` | 1.6+ | `jq --version` |
| Node + npm (para rodar Newman) | Node 20+ | `node --version` |
| `k6` (opcional, para teste de carga) | 0.51+ | `k6 version` |

> **Observação**: nenhum SDK Java é necessário para subir o ambiente — tudo roda em containers. SDK Java só é necessário se for desenvolver os serviços localmente fora do Compose.

---

## 1. Clonar o repositório e entrar no diretório

```bash
git clone <repo-url>
cd keycloack
git checkout 001-auth-trust-gateway
```

---

## 2. Subir o ambiente completo

```bash
docker compose up -d --build
```

O Compose deve subir, em ≤ 60 segundos (SC-002):

| Serviço | Imagem | Porta exposta no host |
|---------|--------|------------------------|
| `keycloak` | `quay.io/keycloak/keycloak:26.6.1` | **nenhuma** (rede interna apenas — FR-015) |
| `ms-auth` | build local (Spring Boot 4.0.6) | nenhuma (atrás do Kong) |
| `ms-products` | build local (Spring Boot 4.0.6) | nenhuma (atrás do Kong) |
| `ms-payments` | build local (Spring Boot 4.0.6) | nenhuma (atrás do Kong) |
| `kong` | `kong/kong:3.9.1` (DB-less) | **8000** (proxy público) |

Demo opcional de horizontal scaling (sobe um segundo nó Kong em `localhost:8001`,
cada nó com seu próprio cache em-processo):

```bash
docker compose --profile multinode up -d --build
```

Acompanhar logs até todos ficarem `healthy`:

```bash
docker compose ps
```

---

## 3. Smoke test — User Story 1 (login + request autenticada)

### 3.1 Login

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

echo "$TOKEN" | cut -c1-40
```

**Esperado**: string começando com `eyJhbGciOiJSUzI1NiIs...`. (FR-001 ✓)

### 3.2 Request autenticada

```bash
curl -s http://localhost:8000/api/products \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Esperado**:

```json
{
  "user_id": "<UUID do alice no Keycloak>",
  "preferred_username": "alice",
  "email": "alice@example.com",
  "products": [ { "id": "P-001", "name": "Demo Product" } ]
}
```

(FR-008, FR-009, CA-002 ✓)

### 3.3 Confirmar zero round-trip externo (US2)

```bash
docker compose logs --tail=0 -f ms-auth &
LOG_PID=$!

for i in $(seq 1 100); do
  curl -s http://localhost:8000/api/products \
       -H "Authorization: Bearer $TOKEN" -o /dev/null
done

kill $LOG_PID
```

**Esperado**: nenhuma linha de log do `ms-auth` durante o loop (CA-003, SC-004 ✓).

---

## 4. Anti-spoofing — User Story 3

```bash
curl -sv http://localhost:8000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-User-Id: admin" \
  -H "X-Claim-email: attacker@evil.example" | jq
```

**Esperado**: `user_id` e `email` na resposta refletem **o JWT do alice**, nunca os valores enviados pelo cliente. (CA-006, FR-010 ✓)

---

## 5. Token expirado

```bash
EXPIRED=$(scripts/test/forge-expired-token.sh)
curl -s -i http://localhost:8000/api/products \
  -H "Authorization: Bearer $EXPIRED"
```

**Esperado**: `HTTP/1.1 401` com body `{"message":"token_verification_failed: 'exp' claim expired"}`. (CA-004 ✓)

> O script `scripts/test/forge-expired-token.sh` usa as chaves do realm para emitir um token com `exp` no passado, evitando esperar 5 min.

---

## 6. Header X-User-Id chega via Kong (verificação no upstream)

```bash
docker compose logs ms-products | grep "X-User-Id"
```

**Esperado**: cada request validada loga `X-User-Id=<uuid>` no upstream — nunca recebido como `admin` ou outro valor spoofado.

---

## 7. Resiliência — `ms-auth` fora com cache válido (US4)

```bash
# Garantir que o JWKS está em cache (faz pelo menos 1 request autenticada).
curl -s http://localhost:8000/api/products \
     -H "Authorization: Bearer $TOKEN" -o /dev/null

# Derruba o ms-auth.
docker compose stop ms-auth

# A request continua funcionando enquanto o TTL do cache não expirar.
curl -s -i http://localhost:8000/api/products \
     -H "Authorization: Bearer $TOKEN"
```

**Esperado**: `HTTP/1.1 200` (CA-008, SC-007 ✓).

```bash
# Restaurar.
docker compose start ms-auth
```

---

## 8. Rotação de chave (US5)

```bash
# Forçar rotação no Keycloak via Admin CLI dentro do container.
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 \
  --realm master --user admin --password admin

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh \
  create keys -r poc -s providerType=org.keycloak.keys.KeyProvider \
  -s name=poc-rsa-2 -s providerId=rsa-generated -s 'config.priority=["200"]'
```

```bash
# Logar de novo para receber um token assinado com o novo kid.
NEW_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

curl -s -i http://localhost:8000/api/products \
     -H "Authorization: Bearer $NEW_TOKEN"
```

**Esperado**: primeira chamada dispara refresh do JWKS (1 chamada extra ao `ms-auth`), valida e responde `200`. (CA-007, SC-006 ✓)

---

## 9. Rodar a suíte E2E (Newman)

```bash
npx newman run tests/newman/auth-trust-gateway.postman_collection.json \
  -e tests/newman/env.poc.postman_environment.json \
  --bail
```

**Esperado**: 9 cenários (CA-001..CA-009) passando, `failures: 0`. (SC-009 ✓)

---

## 10. Teste de carga (k6)

```bash
k6 run tests/k6/load-authenticated-route.js \
       --env BASE_URL=http://localhost:8000 \
       --env USERNAME=alice --env PASSWORD=alice
```

**Esperado**:

- `http_req_duration{type=auth}` p99 ≤ 50 ms (incluindo upstream simples).
- Latência de validação atribuída ao gateway: p99 ≤ 5 ms (SC-001).
- Throughput sustentado ≥ 1000 RPS por 60 s (SC-003).
- 0 erros HTTP de validação.

---

## 11. Caos — derrubar `ms-auth` durante carga (CA-008/CA-009 sob pressão)

```bash
bash tests/k6/chaos-msauth-down.sh
```

O script:

1. Inicia carga de 500 RPS contra `/api/products`.
2. Após 10s, executa `docker compose stop ms-auth`.
3. Mede latência e error rate por 30s.
4. Após mais 30s, executa `docker compose start ms-auth`.

**Esperado**:

- Durante a janela com `ms-auth` fora, 100% das requests com tokens cujo `kid` está em cache são atendidas com `200`.
- Tokens com `kid` desconhecido recebem `401 key_not_available`, e o erro fica cacheado por `negative_cache_ttl` (30s) — sem rajada de retries no `ms-auth` ao retornar.

---

## 12. Validar que o Keycloak não está exposto (SC-010)

```bash
# Direto no host: deve falhar.
curl -s -o /dev/null -w "%{http_code}\n" \
     --max-time 2 http://localhost:8080/realms/poc 2>&1 || echo "unreachable (expected)"
```

**Esperado**: `unreachable (expected)` ou erro de conexão (porta não exposta).

```bash
# De dentro da rede do Compose: alcançável (apenas para diagnóstico).
docker compose exec ms-auth curl -s -o /dev/null -w "%{http_code}\n" \
     http://keycloak:8080/realms/poc
# → 200
```

---

## 13. Tear down

```bash
docker compose down -v
```

`-v` remove os volumes — útil para reiniciar do zero (perde o realm; será re-importado no próximo `up`).

---

## Apêndice A — Variáveis de ambiente principais (`.env`)

| Variável | Default | Onde é usada |
|----------|---------|--------------|
| `KEYCLOAK_ADMIN` | `admin` | bootstrap do Keycloak. |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | bootstrap do Keycloak. **Trocar antes de qualquer uso fora de POC.** |
| `KC_HOSTNAME_URL` | `http://keycloak:8080` | base URL do Keycloak na rede interna; afeta o `iss` dos tokens. |
| `MS_AUTH_KEYCLOAK_REALM` | `poc` | realm consumido pelo `ms-auth`. |
| `MS_AUTH_KEYCLOAK_CLIENT_ID` | `poc-client` | client OAuth consumido pelo `ms-auth`. |
| `KONG_PLUGINS` | `bundled,jwt-keycloak-validator` | habilita o plugin custom. |
| `KONG_LUA_PACKAGE_PATH` | `/opt/kong/plugins/?.lua;/opt/kong/plugins/?/init.lua;;` | resolve o módulo do plugin no container. |

---

## Apêndice B — Mapa de portas

| Origem (host) | → | Destino (container) | Observação |
|---------------|---|---------------------|------------|
| `localhost:8000` | → | `kong:8000` | Único endpoint público. Tudo passa por aqui. |
| _(nenhuma)_ | → | `keycloak:8080` | Não exposto. Só visível na rede interna. |
| _(nenhuma)_ | → | `ms-auth:8080` | Não exposto. |
| _(nenhuma)_ | → | `ms-products:8080` / `ms-payments:8080` | Não exposto. |
| `localhost:8001` | → | `kong-b:8000` | Apenas com `--profile multinode`. |
