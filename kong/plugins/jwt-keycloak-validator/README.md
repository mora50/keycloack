# `jwt-keycloak-validator` — Kong custom plugin

**Priority**: `1005` · **Version**: `0.1.0` · **Phase**: `access` · **Runtime**: Lua 5.1 / LuaJIT (Kong OSS 3.9.x)

Local JWT validation against the JWKS proxied by `ms-auth`. Implements the contract documented in
[`specs/001-auth-trust-gateway/contracts/plugin-schema.md`](../../../specs/001-auth-trust-gateway/contracts/plugin-schema.md).

## Modules

| File | Responsibility |
|------|----------------|
| `schema.lua`  | Plugin config schema (defaults, one_of) |
| `handler.lua` | `access(conf)` — strip identity headers, parse Bearer, lookup PEM, verify, inject |
| `jwks.lua`    | `fetch(url, timeout_ms)` + `find_pem(jwks, kid)` (JWK→PEM via lua-resty-openssl) |
| `cache.lua`   | `get(key, conf, kid, loader)` — single in-process backend via `kong.cache` (L1 LRU + L2 nginx shared dict). No external dependency. |

## Behavior summary

```text
1. (FR-010) strip X-User-Id and X-Claim-* from the client request
2. parse Authorization: Bearer <token>           → 401 missing_or_invalid_authorization
3. decode unverified header to read `kid`        → 401 invalid_jwt_format
4. cache.get("jwks:<iss>:<kid>")                  → 401 key_not_available
5. verify signature + claims (iss, exp, nbf, opt aud)
                                                 → 401 token_verification_failed: <reason>
6. inject X-User-Id from payload[user_id_claim]
   inject X-Claim-{name} for each name ∈ forward_claims
```

## Error contract

See [`plugin-schema.md` — Error contract](../../../specs/001-auth-trust-gateway/contracts/plugin-schema.md#error-contract-response-body).

## Performance budget (cache hit)

| Step | Budget |
|------|--------|
| `kong.cache:get` (L1)        | < 50 µs |
| `cjson.decode` of payload    | < 200 µs |
| `verify_jwt_obj` (RS256 2048)| < 1 ms |
| `set_header` × N             | < 100 µs total |
| **Total p99**                | **≤ 5 ms** (SC-001) |

A miss costs one round-trip to `ms-auth` (~10–30 ms in Compose) but is amortized across the cache TTL.

## Running tests

```bash
docker compose exec kong /usr/local/bin/pongo run
```
