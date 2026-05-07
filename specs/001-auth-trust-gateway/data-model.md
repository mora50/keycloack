# Phase 1 Data Model: Auth Trust Gateway

**Date**: 2026-05-04
**Branch**: `001-auth-trust-gateway`
**Scope**: Modelagem **conceitual** — esta POC não persiste dados em banco próprio. Todas as entidades a seguir são **trafegadas** entre componentes (JWTs, headers, JWKS) ou **transitam apenas em memória / cache**.

---

## Visão geral

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Identity Provider (Keycloak)                    │
│                                                                        │
│  Realm: poc                                                            │
│  ├── Client: poc-client                                                │
│  ├── User: alice (role=user)                                           │
│  └── Signing keys: { kid_A (active), kid_B (rotated/grace) }           │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │ token endpoint, certs endpoint
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            ms-auth (Spring Boot)                       │
│  Caffeine cache: jwks (TTL 60s)                                        │
│  No persistent state.                                                  │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │ POST /auth/login,refresh
                                       │ GET  /auth/jwks
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           Kong Gateway + plugin                        │
│  Cache de PEMs por kid em-processo (kong.cache: L1 LRU + L2 shared)    │
│  Negative cache (TTL 30s) para falhas de fetch                         │
└────┬───────────────────────────────────┬───────────────────────────────┘
     │ X-User-Id, X-Claim-*              │ X-User-Id, X-Claim-*
     ▼                                   ▼
ms-products                         ms-payments
(Spring Boot, stateless)            (Spring Boot, stateless)
```

---

## Entidades

### E1 — `User` (no Keycloak)

| Atributo | Tipo | Descrição |
|----------|------|-----------|
| `id` (`sub` no JWT) | UUID | Identificador único do usuário no realm. |
| `username` | string | Login (ex.: `alice`). |
| `email` | string | E-mail do usuário. |
| `roles` | array of string | Ex.: `["user"]`. |
| `enabled` | boolean | Indica se o usuário pode autenticar. |

**Regras**:
- Fonte da verdade é o Keycloak; `ms-auth` jamais persiste dados de usuário.
- Para POC, um único usuário `alice / alice` é provisionado via realm import.

**Onde vive**: Keycloak (H2 embarcado em modo dev).

---

### E2 — `JsonWebToken (JWT)`

Forma serializada: `header.payload.signature` (base64url + RS256).

| Parte | Campo | Tipo | Notas |
|-------|-------|------|-------|
| Header | `alg` | string | Sempre `RS256` (configurável; ver R6 do `research.md`). |
| Header | `kid` | string | Identificador da chave de assinatura no JWKS. |
| Header | `typ` | string | `JWT`. |
| Payload | `iss` | string | URL do issuer (ex.: `http://keycloak:8080/realms/poc`). |
| Payload | `sub` | string | ID do usuário no Keycloak (UUID). |
| Payload | `exp` | number | Unix timestamp de expiração. |
| Payload | `nbf` | number | Unix timestamp not-before (opcional). |
| Payload | `aud` | string \| array | Audience (validada se `config.audience` setado no plugin). |
| Payload | `azp` | string | Authorized party (`poc-client`). |
| Payload | `preferred_username` | string | Encaminhado como `X-Claim-preferred_username`. |
| Payload | `email` | string | Encaminhado como `X-Claim-email`. |
| Payload | `realm_access.roles` | array of string | Não encaminhado por default. |
| Signature | binary | bytes | RS256 sobre `header.payload`. |

**Regras de validação aplicadas pelo plugin**:
- `alg` MUST corresponder ao `config.algorithm`.
- `kid` MUST estar presente.
- Assinatura MUST ser válida contra a chave pública correspondente ao `kid`.
- `iss` MUST igualar `config.issuer`.
- `exp` MUST estar no futuro.
- `nbf`, se presente, MUST estar no passado.
- `aud`, se `config.audience` configurada, MUST conter `config.audience`.

**Onde vive**: Trafega entre cliente, Kong, microsserviços. Nunca persistido.

---

### E3 — `RefreshToken`

Estruturalmente um JWT também (no Keycloak), mas tratado como **opaco** pelo `ms-auth` e pelo cliente.

| Atributo | Tipo | Descrição |
|----------|------|-----------|
| `value` | string | Token serializado. |
| `exp` | number | Expiração (mais longa que `access_token.exp`). |

**Regras**:
- O `ms-auth` não decodifica nem valida — apenas reenvia ao Keycloak no `POST /auth/refresh`.
- O Kong **nunca** vê o refresh token (rota `/auth/refresh` faz proxy direto para `ms-auth` sem o plugin).

---

### E4 — `JsonWebKey (JWK)` e `JsonWebKeySet (JWKS)`

```json
{
  "keys": [
    {
      "kid": "a1b2c3...",
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "n": "<base64url modulus>",
      "e": "AQAB"
    }
  ]
}
```

**Regras**:
- O plugin Kong só aceita `kty == "RSA"`.
- A conversão JWK → PEM é feita por `lua-resty-openssl` em `jwks.lua::find_pem`.
- O `ms-auth` repassa o JWKS exatamente como recebido do Keycloak (sem reescrever campos).

**Onde vive**:
- Origem: Keycloak (`/realms/poc/protocol/openid-connect/certs`).
- Cache curto: Caffeine no `ms-auth` (TTL 60s).
- Cache longo: `kong.cache` em-processo (TTL 3600s default).

---

### E5 — `IdentityHeaders` (contrato Kong → microsserviço)

| Header | Origem (claim) | Sempre presente? | Notas |
|--------|----------------|------------------|-------|
| `X-User-Id` | `sub` (configurável via `config.user_id_claim`) | Sim, em request validado | Nome do header configurável via `config.user_id_header`. |
| `X-Claim-preferred_username` | `preferred_username` | Se claim presente no JWT | Listado em `forward_claims` (default). |
| `X-Claim-email` | `email` | Se claim presente no JWT | Listado em `forward_claims` (default). |
| `X-Claim-{custom}` | claim de mesmo nome | Se claim presente e listado em `forward_claims` | Lista configurável. |

**Invariante de segurança (FR-010)**:
> Antes de extrair claims do token, o plugin REMOVE todos esses headers se vierem do cliente. Sempre. Sem exceção operável em produção.

---

### E6 — `PluginConfig` (config do `jwt-keycloak-validator`)

Configuração por **rota** (declarada em `kong.yml`).

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `jwks_url` | string (URL) | — (required) | Ex.: `http://ms-auth:8080/auth/jwks`. |
| `issuer` | string | — (required) | Ex.: `http://keycloak:8080/realms/poc`. |
| `audience` | string | `null` | Se setado, valida `aud`. |
| `algorithm` | enum | `RS256` | `RS256` \| `RS384` \| `RS512`. |
| `cache_ttl` | number (s) | `3600` | TTL positivo do cache de chave (em-processo via `kong.cache`). |
| `negative_cache_ttl` | number (s) | `30` | TTL de cache negativo (falha de fetch). |
| `user_id_claim` | string | `sub` | Claim de origem do `X-User-Id`. |
| `user_id_header` | string | `X-User-Id` | Nome do header injetado. |
| `forward_claims` | array of string | `["preferred_username", "email"]` | Claims encaminhadas como `X-Claim-{name}`. |
| `strip_client_headers` | boolean | `true` | Anti-spoofing (FR-010). NÃO desligar em produção. |

---

### E7 — `CacheEntry` (cache de chave pública no Kong)

| Campo | Tipo | Notas |
|-------|------|-------|
| `key` | string | `jwks:{issuer}:{kid}`. |
| `value` | PEM string \| `null` | `null` indica cache negativo. |
| `expires_at` | timestamp | Calculado de `cache_ttl` ou `negative_cache_ttl`. |
| `tier` | enum | `L1` (worker LRU) \| `L2` (nginx shared dict) — observado em `kong.cache:probe`. |

**Regras de invalidação**:
- Recebimento de token com `kid` desconhecido ⇒ trigger de refresh imediato (apenas um por rajada do mesmo `kid`).
- Falha de fetch ⇒ entrada negativa com `negative_cache_ttl`.
- Sucesso ⇒ entrada positiva com `cache_ttl`.

---

### E8 — `LoginRequest` / `RefreshRequest` / `TokenResponse` (DTOs do `ms-auth`)

```text
LoginRequest      { username: string, password: string }
RefreshRequest    { refresh_token: string }
TokenResponse     { access_token: string, refresh_token: string,
                    token_type: "Bearer", expires_in: number,
                    refresh_expires_in: number }
ErrorResponse     { error: string, error_description?: string }
```

**Regras**:
- `ms-auth` valida formato (`@NotBlank`) e devolve `400` em payload inválido.
- Em falha do Keycloak (4xx/5xx), `ms-auth` retorna `401 { error: "invalid_credentials" }` para login e `401 { error: "invalid_refresh_token" }` para refresh; logs detalhados ficam server-side.
- `ms-auth` pode sanitizar a resposta (ex.: remover `id_token` se vier).

---

### E9 — `ProductsResource` / `PaymentsResource` (downstream)

**Não há entidade de negócio real** — são apenas demos que ecoam o `X-User-Id`.

```text
GET  /products    → 200 { user_id: "<X-User-Id>", products: [ ...static ] }
POST /payments    → 200 { user_id: "<X-User-Id>", payment_id: "<uuid>", status: "accepted" }
```

**Regras**:
- Microsserviços downstream **NÃO** processam `Authorization`.
- Se `X-User-Id` ausente ⇒ `400 { error: "missing_x_user_id" }` (defesa em profundidade).

---

## Relacionamentos

| Origem | Relação | Destino | Cardinalidade |
|--------|---------|---------|---------------|
| `User` | gera | `JWT` (access) | 1 — N (um por sessão/refresh) |
| `User` | gera | `RefreshToken` | 1 — 1 por sessão |
| `JWT` | é assinado por | `JWK` (via `kid`) | N — 1 |
| `JWKS` | contém | `JWK` | 1 — N (geralmente 1–2) |
| `Route (Kong)` | aplica | `PluginConfig` | 1 — 0..1 |
| `Request` | carrega | `JWT` | 1 — 0..1 (rotas protegidas: 1; públicas: 0) |
| `Request validado` | gera | `IdentityHeaders` | 1 — 1 |
| `IdentityHeaders` | derivado de | `JWT.payload` | 1 — 1 |

---

## Estados / transições relevantes

### Cache de chave pública no Kong

```
[ABSENT] --(token com kid X chega)--> [FETCHING]
[FETCHING] --(JWKS retorna kid X)--> [CACHED+POSITIVE] (ttl=cache_ttl)
[FETCHING] --(falha de fetch)----> [CACHED+NEGATIVE] (ttl=negative_cache_ttl)
[CACHED+POSITIVE] --(TTL expira)--> [ABSENT]
[CACHED+POSITIVE] --(token novo com mesmo kid)--> [CACHED+POSITIVE] (refresh do TTL não acontece — Kong respeita TTL absoluto)
[CACHED+NEGATIVE] --(TTL expira)--> [ABSENT]
[ABSENT, kid Y desconhecido] --(token com kid Y chega)--> [FETCHING] (rotação detectada automaticamente)
```

### Sessão de usuário (visão `ms-auth`)

```
[ANONYMOUS] --(POST /auth/login OK)--> [AUTHENTICATED com (access, refresh)]
[AUTHENTICATED] --(access expira)--> [AUTHENTICATED com refresh válido]
[AUTHENTICATED] --(POST /auth/refresh OK)--> [AUTHENTICATED com novo par]
[AUTHENTICATED] --(refresh expira ou logout)--> [ANONYMOUS]
```

> O `ms-auth` é stateless: não armazena sessões. Toda transição é decidida pelo Keycloak; o `ms-auth` apenas faz proxy.

---

## Não-entidades (intencionalmente fora do modelo)

- **Sessão de banco** — POC é stateless.
- **Tabela de revogação** — fora de escopo (ver `Assumptions` no spec).
- **Audit log persistente** — apenas logs estruturados em stdout, agregação fica para evolução futura.
- **Tabela de usuários do `ms-auth`** — fonte da verdade é o Keycloak.
