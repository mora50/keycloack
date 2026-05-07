# Plugin Contract: `jwt-keycloak-validator`

**Plugin name**: `jwt-keycloak-validator`
**Priority**: `1005`
**Version**: `0.1.0`
**Phase**: `access`
**Runtime**: Lua 5.1 (LuaJIT) — Kong OSS 3.9.x

---

## Configuration schema

| Field | Type | Required | Default | One-of / Constraint | Description |
|-------|------|----------|---------|---------------------|-------------|
| `jwks_url` | string (URL) | yes | — | valid URL | URL absoluta do endpoint JWKS exposto pelo `ms-auth`. |
| `issuer` | string | yes | — | non-empty | Valor esperado em `iss`. |
| `audience` | string | no | `null` | — | Se setado, `aud` MUST conter este valor. |
| `algorithm` | string | no | `RS256` | `RS256`\|`RS384`\|`RS512` | Algoritmo aceito. |
| `cache_ttl` | number (s) | no | `3600` | `> 0` | TTL de cache positivo (chave válida) em `kong.cache`. |
| `negative_cache_ttl` | number (s) | no | `30` | `> 0` | TTL de cache negativo (falha de fetch). |
| `user_id_claim` | string | no | `sub` | non-empty | Claim de origem do `X-User-Id`. |
| `user_id_header` | string | no | `X-User-Id` | non-empty | Nome do header injetado. |
| `forward_claims` | array of string | no | `["preferred_username","email"]` | — | Claims encaminhadas como `X-Claim-{name}`. |
| `strip_client_headers` | boolean | no | `true` | — | **Anti-spoofing (FR-010). NÃO desligar em produção.** |

---

## Behavior — `access` phase

```text
1. if conf.strip_client_headers:
     remove header(conf.user_id_header)
     for each claim in conf.forward_claims:
         remove header("X-Claim-" .. claim)

2. token = parse "Authorization: Bearer <token>"
   if missing or malformed → 401 missing_or_invalid_authorization

3. jwt_obj = decode_unverified(token)
   if invalid or no kid in header → 401 invalid_jwt_format

4. cache_key = "jwks:" .. conf.issuer .. ":" .. jwt_obj.header.kid
   pem = cache.get(cache_key, conf, kid)   -- handles fetch + negative TTL
   if not pem → 401 key_not_available

5. claim_specs = {
     iss = equals(conf.issuer),
     exp = is_not_expired(),
     nbf = opt_is_not_before(),
   }
   if conf.audience: claim_specs.aud = contains(conf.audience)

   verified = verify_jwt_obj(pem, jwt_obj, claim_specs)
   if not verified → 401 token_verification_failed: <reason>

6. sub = jwt_obj.payload[conf.user_id_claim]
   if sub: set_header(conf.user_id_header, tostring(sub))
   for each claim in conf.forward_claims:
     v = jwt_obj.payload[claim]
     if v != nil: set_header("X-Claim-" .. claim, tostring(v))
```

---

## Cache lookup contract (`cache.get(key, conf, kid)`)

```text
pem, err = kong.cache:get(
  key,
  { ttl = cache_ttl, neg_ttl = negative_cache_ttl },
  load_public_key,        -- loader, called once per key per TTL window
  conf, kid               -- forwarded to the loader
)

-- load_public_key (in cache.lua) does:
--   1. jwks.fetch(conf.jwks_url, 1000ms)        — single HTTP call to ms-auth
--   2. jwks.find_pem(jwks_doc, kid)             — JWK -> PEM via lua-resty-openssl
--   3. on success returns the PEM string        — cached as positive entry
--   4. on failure returns (nil, err)            — cached as NEGATIVE entry
```

`kong.cache` already provides:

- **L1 worker LRU + L2 nginx shared dict** — hit costs ~1–10 µs, no I/O.
- **Per-key mutex coalescing** — N concurrent misses on the same kid invoke the loader exactly once. This is the mechanism that satisfies FR-007 / SC-006 ("single JWKS refresh per burst") without any locking code in `cache.lua`.
- **Negative caching** — fetch failures are remembered for `negative_cache_ttl` seconds, preventing retry storms against `ms-auth`.

---

## Error contract (response body)

| HTTP | `message` no body | Disparado em |
|------|-------------------|--------------|
| 401 | `missing_or_invalid_authorization` | `Authorization` ausente ou sem `Bearer`. |
| 401 | `invalid_jwt_format` | Token mal formado, sem `header.kid` ou base64 inválido. |
| 401 | `key_not_available` | `kid` não está no JWKS após refresh OU fetch do JWKS falhou. |
| 401 | `token_verification_failed: signature mismatch` | Assinatura RS256 inválida. |
| 401 | `token_verification_failed: 'exp' claim expired` | `exp` no passado. |
| 401 | `token_verification_failed: 'nbf' claim not yet valid` | `nbf` no futuro. |
| 401 | `token_verification_failed: 'iss' claim mismatch` | `iss` ≠ `conf.issuer`. |
| 401 | `token_verification_failed: 'aud' claim mismatch` | `aud` não contém `conf.audience` (quando configurada). |

> **Observabilidade**: cada cenário acima é acompanhado de `kong.log.warn` ou `kong.log.err` com o `kid`, `iss` e contexto, sem expor o token em log.

---

## Headers contract — Kong → upstream

| Header | Origem | Quando é setado |
|--------|--------|-----------------|
| `<conf.user_id_header>` (default `X-User-Id`) | `payload[conf.user_id_claim]` (default `sub`) | Sempre que validação OK e claim presente. |
| `X-Claim-{name}` para cada `name ∈ conf.forward_claims` | `payload[name]` | Claim presente no token. Headers ausentes para claims ausentes. |

**Garantia**: nenhum desses headers vindos do cliente sobrevive à fase `access` quando `strip_client_headers=true`.

---

## Hot-path performance budget

| Operação | Budget | Observação |
|----------|--------|------------|
| `kong.cache:get` (cache hit, L1) | < 50 µs | Em-process LRU. |
| `cjson.decode` do payload | < 200 µs | Token típico < 2 KB. |
| `jwt:verify_jwt_obj` (RS256, 2048-bit) | < 1 ms | OpenSSL nativo via `lua-resty-openssl`. |
| `kong.service.request.set_header` × N | < 100 µs total | N pequeno (3–5 headers). |
| **Total p99 esperado** | **≤ 5 ms** | Atende SC-001. |

Cache miss adiciona 1 round-trip a `ms-auth` (~10–30 ms na rede do Compose) — fora do hot path porque acontece 1 vez por TTL.

---

## Test matrix (busted)

| Spec file | Cobertura |
|-----------|-----------|
| `01-schema_spec.lua` | Defaults (`strip_client_headers=true`, `forward_claims`, `cache_ttl`, `negative_cache_ttl`), required, one_of (`algorithm`). |
| `02-jwks_spec.lua` | `fetch()`: 200 OK; timeout; status 5xx; body inválido. `find_pem()`: kid presente; ausente; kty != RSA. |
| `03-handler_spec.lua` | Mapeia 1:1 os cenários CA-001..CA-009 do spec, com `kong.cache` e `resty.http` mockados. Inclui caso de spoofing (cliente envia `X-User-Id`). |
