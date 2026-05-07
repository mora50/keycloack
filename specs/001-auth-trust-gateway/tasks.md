---

description: "Task list for Auth Trust Gateway POC"
---

# Tasks: Auth Trust Gateway

**Input**: Design documents from `/specs/001-auth-trust-gateway/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The spec mandates an automated suite covering CA-001..CA-009 (SC-009) and FR-017 (observability), and the plan ratifies JUnit 5 + Testcontainers (Java), busted + kong-pongo (Lua), Newman (E2E) and k6 (load).

**Organization**: Tasks are grouped by user story (US1..US5 from spec.md) so each story can be implemented, demoed and tested independently.

> **Note**: An earlier draft of this plan included a User Story 6 ("Cache de chaves compartilhado entre nós" via Redis), implemented in Phase 8 below. That story was deliberately dropped after the POC review to keep `cache.lua` and the Compose surface minimal: with a single Kong node, `kong.cache` (L1 LRU + L2 nginx shared dict) already satisfies SC-001/SC-004/SC-006/SC-007, and a Redis-backed shared cache only adds value in multi-node production deployments — out of scope for this POC. Tasks T078–T083 are marked CANCELLED for traceability; see `research.md` R7 for the rationale.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Story label (US1..US6) when the task belongs to a user-story phase
- All paths are relative to the repository root (`/Users/cesaraugusto/work/keycloack/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository skeleton and conventions shared by every component.

- [X] T001 Create monorepo directory skeleton: `kong/plugins/jwt-keycloak-validator/spec/`, `keycloak/realm-export/`, `services/ms-auth/src/{main,test}/java/com/poc/msauth/`, `services/ms-products/src/{main,test}/java/com/poc/msproducts/`, `services/ms-payments/src/{main,test}/java/com/poc/mspayments/`, `tests/newman/`, `tests/k6/`, `scripts/test/`
- [X] T002 [P] Create `.gitignore` at repo root covering Maven `target/`, IDE files (`.idea/`, `.vscode/`), local `.env`, `node_modules/`, k6 result artifacts, Lua `*.luac`
- [X] T003 [P] Create `.env.example` at repo root with all variables documented in `specs/001-auth-trust-gateway/quickstart.md` Apêndice A (`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KC_HOSTNAME_URL`, `MS_AUTH_KEYCLOAK_REALM`, `MS_AUTH_KEYCLOAK_CLIENT_ID`, `KONG_PLUGINS`, `KONG_LUA_PACKAGE_PATH`)
- [X] T004 [P] Create `README.md` at repo root summarizing the POC and pointing to `specs/001-auth-trust-gateway/quickstart.md` for the full walkthrough

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Skeletons of every component (Keycloak realm, Kong, three Spring Boot services, plugin module layout, Compose orchestration) so that **any** user story can be implemented on top.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Author `keycloak/realm-export/poc-realm.json`: realm `poc`, RS256 signing keys, public client `poc-client` (grant `password` + `refresh_token` enabled, `redirectUris` and `webOrigins` for compose-internal use), role `user`, user `alice` with credential `alice` and role `user`, protocol mappers exposing `preferred_username` and `email` in the access token (per data-model.md E1 + research.md R8)
- [X] T006 [P] Author `keycloak/Dockerfile` extending `quay.io/keycloak/keycloak:26.6.1`, copying realm export to `/opt/keycloak/data/import/`, default CMD `start-dev --import-realm` (per research.md R8)
- [X] T007 [P] Author `services/ms-auth/pom.xml` with Java 25 + Spring Boot 4.0.6 BOM and dependencies: `spring-boot-starter-web`, `spring-boot-starter-validation`, `spring-boot-starter-actuator`, `spring-boot-starter-cache`, `caffeine`, `micrometer-registry-prometheus`, `logstash-logback-encoder`, test deps `spring-boot-starter-test`, `org.testcontainers:keycloak`, `com.nimbusds:nimbus-jose-jwt` (test scope, used by integration tests to forge tokens)
- [X] T008 [P] Author `services/ms-products/pom.xml` with Java 25 + Spring Boot 4.0.6 + `web`, `validation`, `actuator`, `logstash-logback-encoder`, `micrometer-registry-prometheus`, `spring-boot-starter-test`
- [X] T009 [P] Author `services/ms-payments/pom.xml` mirroring `ms-products/pom.xml`
- [X] T010 [P] Author `services/ms-auth/Dockerfile` multi-stage build (`maven:3.9-eclipse-temurin-25` builder → `eclipse-temurin:25-jre-alpine` runtime, copy fat jar, expose 8080)
- [X] T011 [P] Author `services/ms-products/Dockerfile` (same template as T010)
- [X] T012 [P] Author `services/ms-payments/Dockerfile` (same template as T010)
- [X] T013 [P] Author `services/ms-auth/src/main/resources/application.yml` (`server.port=8080`, `spring.threads.virtual.enabled=true`, actuator endpoints `health,info,prometheus` exposed, Keycloak base/realm/client read from env, `RestClient` connect/read timeouts 1s/3s)
- [X] T014 [P] Author `services/ms-auth/src/main/resources/logback-spring.xml` using `LogstashEncoder` for stdout JSON logs (FR-017)
- [X] T015 [P] Author `services/ms-products/src/main/resources/{application.yml,logback-spring.xml}` with virtual threads, actuator and JSON logging
- [X] T016 [P] Author `services/ms-payments/src/main/resources/{application.yml,logback-spring.xml}` mirroring T015
- [X] T017 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/MsAuthApplication.java` (`@SpringBootApplication`, `main` bootstrapping)
- [X] T018 [P] Author `services/ms-products/src/main/java/com/poc/msproducts/MsProductsApplication.java`
- [X] T019 [P] Author `services/ms-payments/src/main/java/com/poc/mspayments/MsPaymentsApplication.java`
- [X] T020 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/config/KeycloakProperties.java` (`@ConfigurationProperties("keycloak")` record exposing `baseUrl`, `realm`, `clientId`)
- [X] T021 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/config/HttpClientConfig.java` declaring `RestClient` bean with timeouts (R3) and `HttpServiceProxyFactory` for `@HttpExchange` clients
- [X] T022 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/config/CacheConfig.java` configuring Caffeine cache `jwks` with TTL 60s (FR-013, R4)
- [X] T023 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/error/GlobalExceptionHandler.java` returning `ErrorResponse` shape from `contracts/ms-auth.openapi.yaml` (`invalid_request`, `invalid_credentials`, `invalid_refresh_token`, `idp_unavailable`)
- [X] T024 [P] Author `services/ms-auth/src/main/java/com/poc/msauth/auth/dto/{LoginRequest,RefreshRequest,TokenResponse,JwksResponse}.java` as Java records mirroring `contracts/ms-auth.openapi.yaml` schemas (with `@NotBlank` on required strings)
- [X] T025 [P] Author `kong/Dockerfile` extending `kong/kong:3.9.1`, installing `lua-resty-openssl` via `luarocks install`, copying `kong/plugins/` to `/opt/kong/plugins/`
- [X] T026 [P] Author `kong/plugins/jwt-keycloak-validator/schema.lua` with the full field set documented in `contracts/plugin-schema.md` (`jwks_url`, `issuer`, `audience`, `algorithm` one_of, `cache_ttl`, `negative_cache_ttl`, `user_id_claim`, `user_id_header`, `forward_claims`, `strip_client_headers` default `true`)
- [X] T027 [P] Author `kong/plugins/jwt-keycloak-validator/handler.lua` skeleton: returns plugin object with `PRIORITY=1005`, `VERSION="0.1.0"`, `access(conf)` placeholder that calls TODO modules
- [X] T028 [P] Author `kong/plugins/jwt-keycloak-validator/jwks.lua` skeleton with `M.fetch(url, timeout_ms)` and `M.find_pem(jwks, kid)` function stubs
- [X] T029 [P] Author `kong/plugins/jwt-keycloak-validator/cache.lua` skeleton with `M.get(key, conf, kid, loader)` stub returning `nil` (real logic added per story)
- [X] T030 Author `kong/kong.yml` base declarative config containing **only** the public `ms-auth` service + `auth-public` route on `/auth` (no plugin yet, protected routes added per story) — derived from `contracts/kong.yml`
- [X] T031 Author root `docker-compose.yml` skeleton: single internal network `poc`, `keycloak` service (image from T006, `expose: [8080]` only — never `ports:` per FR-015 / SC-010, healthcheck against `/realms/master`, env `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD`/`KC_HOSTNAME_URL=http://keycloak:8080`)
- [X] T032 Extend `docker-compose.yml` adding `ms-auth`, `ms-products`, `ms-payments` services using their per-service Dockerfiles, **`expose:` only** (no `ports:`), `depends_on: keycloak: { condition: service_healthy }`, healthchecks against `/actuator/health`, env vars for Keycloak base/realm/client
- [X] T033 Extend `docker-compose.yml` adding `kong` service (build `kong/`, env `KONG_DATABASE=off`, `KONG_DECLARATIVE_CONFIG=/usr/local/kong/declarative/kong.yml`, `KONG_PLUGINS=bundled,jwt-keycloak-validator`, `KONG_LUA_PACKAGE_PATH=/opt/kong/plugins/?.lua;/opt/kong/plugins/?/init.lua;;`, only port `8000:8000` exposed, healthcheck via `kong health`, mounts for `kong.yml` and plugin dir, `depends_on: ms-auth: { condition: service_healthy }`)

**Checkpoint**: Foundation ready — every container has a buildable image, Compose `up -d` brings the stack to `healthy` (Keycloak invisible to the host), and the plugin module layout exists. User story implementation can begin in parallel.

---

## Phase 3: User Story 1 - Cliente final autentica e acessa microsserviço protegido (Priority: P1) 🎯 MVP

**Goal**: End-to-end happy path. Client logs in via the gateway, receives JWTs, calls `/api/products`, downstream service receives the request with `X-User-Id` injected from the validated token.

**Independent Test**: `POST /auth/login` with `alice/alice` returns 200 with a JWT pair; `GET /api/products` with `Authorization: Bearer <token>` returns 200 and the response body's `user_id` equals the `sub` claim of the token.

### Tests for User Story 1 ⚠️

> Write these tests FIRST and confirm they FAIL before implementation.

- [X] T034 [P] [US1] Contract test for `POST /auth/login` in `services/ms-auth/src/test/java/com/poc/msauth/auth/AuthControllerLoginContractTest.java` (`@WebMvcTest`, mocks `AuthService`, asserts response shape matches `contracts/ms-auth.openapi.yaml` `TokenResponse`, asserts 400 on blank `username`, named `CA001_login_returns_token_pair`)
- [X] T035 [P] [US1] Contract test for `POST /auth/refresh` in `services/ms-auth/src/test/java/com/poc/msauth/auth/AuthControllerRefreshContractTest.java` (asserts 200 token pair / 401 `invalid_refresh_token`, named `CA002_refresh_returns_new_pair`)
- [X] T036 [P] [US1] Contract test for `GET /auth/jwks` in `services/ms-auth/src/test/java/com/poc/msauth/auth/AuthControllerJwksContractTest.java` (asserts 200 with `keys[*].kid/kty/alg/use/n/e` per `JwksResponse`)
- [X] T037 [P] [US1] Contract test for `GET /products` in `services/ms-products/src/test/java/com/poc/msproducts/api/ProductsControllerContractTest.java` (`@WebMvcTest`, asserts response echoes `X-User-Id` header into `user_id`, asserts 400 `missing_x_user_id` when header absent)
- [X] T038 [P] [US1] Contract test for `POST /payments` in `services/ms-payments/src/test/java/com/poc/mspayments/api/PaymentsControllerContractTest.java` (asserts response echoes `X-User-Id` into `user_id` and produces `payment_id`)
- [X] T039 [P] [US1] Integration test in `services/ms-auth/src/test/java/com/poc/msauth/integration/AuthFlowIT.java` using Testcontainers `KeycloakContainer` with `poc-realm.json` imported, exercising full login + refresh + JWKS retrieval (`@SpringBootTest`)
- [X] T040 [P] [US1] busted plugin spec `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` covering `CA001_happy_path_injects_xuserid` (mock `kong.cache` returning a PEM, sign a real RS256 token via `lua-resty-openssl`, assert `kong.service.request.set_header("X-User-Id", sub)` is called)
- [X] T041 [P] [US1] Newman folder `tests/newman/auth-trust-gateway.postman_collection.json` skeleton with requests `Login`, `GET /api/products` (saves access_token via test script, asserts 200 + `user_id` matches the JWT `sub` decoded in the script) — named `CA-001`/`CA-002`

### Implementation for User Story 1

- [X] T042 [US1] Implement `services/ms-auth/src/main/java/com/poc/msauth/auth/KeycloakClient.java` as a `@HttpExchange` interface backed by the `RestClient` bean, exposing `tokenPassword(form)`, `tokenRefresh(form)`, `getCerts()` against the Keycloak realm endpoints
- [X] T043 [US1] Implement `services/ms-auth/src/main/java/com/poc/msauth/auth/AuthService.java` orchestrating login (grant `password`), refresh (grant `refresh_token`) and JWKS fetch (cached via Caffeine `jwks` with TTL 60s), translating Keycloak 4xx/5xx to the `ErrorResponse` enum (`invalid_credentials`, `invalid_refresh_token`, `idp_unavailable`); strip `id_token` from responses
- [X] T044 [US1] Implement `services/ms-auth/src/main/java/com/poc/msauth/auth/AuthController.java` exposing `POST /auth/login`, `POST /auth/refresh`, `GET /auth/jwks` per `contracts/ms-auth.openapi.yaml`, with `@Valid` on request bodies
- [X] T045 [US1] Implement `services/ms-products/src/main/java/com/poc/msproducts/api/ProductsController.java` exposing `GET /products` and `GET /products/health`; reads `X-User-Id` (returns 400 `missing_x_user_id` when absent — defense in depth per FR-014); echoes `email` and `preferred_username` from `X-Claim-*` headers; returns a static product list
- [X] T046 [US1] Implement `services/ms-payments/src/main/java/com/poc/mspayments/api/PaymentsController.java` exposing `POST /payments` echoing `X-User-Id`, generating `payment_id` UUID, returning `status: accepted`
- [X] T047 [US1] Implement `kong/plugins/jwt-keycloak-validator/jwks.lua` `fetch(url, timeout_ms)` (calls `resty.http`, returns parsed JWKS table, surfaces `nil, err` on non-200 / timeout / invalid body) and `find_pem(jwks, kid)` (filters `kty=="RSA"`, converts JWK → PEM via `resty.openssl.pkey.new({type="RSA", n=…, e=…})`)
- [X] T048 [US1] Implement `kong/plugins/jwt-keycloak-validator/handler.lua` `access(conf)` happy path: parse `Authorization: Bearer <token>`, decode unverified JWT to read `kid`, call `cache.get(...)` (T049), `verify_jwt_obj` against PEM with `iss=conf.issuer + exp + nbf` claim specs, inject `X-User-Id` from `payload[conf.user_id_claim]` and `X-Claim-{name}` for each `name in conf.forward_claims`. Error mapping per `contracts/plugin-schema.md` Error contract; log via `kong.log.warn/err` without token contents
- [X] T049 [US1] Implement `kong/plugins/jwt-keycloak-validator/cache.lua` `get(key, conf, kid, loader)` using `kong.cache:get(key, { ttl = conf.cache_ttl, neg_ttl = conf.negative_cache_ttl }, loader, conf, kid)` — single in-process backend, no external cache
- [X] T050 [US1] Wire protected routes in `kong/kong.yml`: add `ms-products` service + `products-protected` route (`/api/products`, `strip_path: true`) and `ms-payments` service + `payments-protected` route (`/api/payments`, `strip_path: true`), each with the `jwt-keycloak-validator` plugin configured with `jwks_url=http://ms-auth:8080/auth/jwks`, `issuer=http://keycloak:8080/realms/poc`, `algorithm=RS256`, `forward_claims=[preferred_username,email]` (mirror `contracts/kong.yml`)

**Checkpoint**: User Story 1 fully functional and demoable end-to-end. `docker compose up -d` → login → call `/api/products` → see correct `X-User-Id`. CA-001 and CA-002 from the spec are green.

---

## Phase 4: User Story 2 - Validação local sem custo por requisição (Priority: P1)

**Goal**: With JWKS already cached, the gateway validates locally without any extra round-trip to `ms-auth` or Keycloak (SC-001, SC-004).

**Independent Test**: After one warming request, fire 100 sequential authenticated requests and observe zero new outbound calls from Kong to `ms-auth` (verified by `ms-auth` access logs and by a counter in plugin logs).

### Tests for User Story 2 ⚠️

- [X] T051 [P] [US2] busted spec `kong/plugins/jwt-keycloak-validator/spec/02-jwks_spec.lua` covering `fetch()` success, timeout, non-200, malformed body and `find_pem()` for present/absent `kid` and `kty != RSA` (mock `resty.http`)
- [X] T052 [P] [US2] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA003_cache_hit_skips_fetch` asserting that on the second request with the same `kid` the loader callback is never invoked
- [X] T053 [P] [US2] Add Newman request `100x GET /api/products (cache hit)` to `tests/newman/auth-trust-gateway.postman_collection.json` named `CA-003` that loops 100 times in a Postman test script, then asserts that the `ms-auth` access log delta (read via `docker compose logs --since` in a `tests/newman/scripts/jwks-call-counter.sh` companion script) is zero
- [X] T054 [P] [US2] k6 script `tests/k6/load-authenticated-route.js` measuring p99 latency for `GET /api/products` (with token from `setup()` calling `/auth/login`) — thresholds `http_req_duration{type:auth}: ['p(99)<50']`, custom `gateway_validation_p99: ['<5']` to encode SC-001

### Implementation for User Story 2

- [X] T055 [US2] Implement the `load_public_key` loader callback inside `kong/plugins/jwt-keycloak-validator/cache.lua` so that `kong.cache:get` calls back into `jwks.fetch + find_pem` on miss only, and stores the PEM with TTL `conf.cache_ttl` (positive) — pure in-process cache, no remote backend yet
- [X] T056 [US2] In `kong/plugins/jwt-keycloak-validator/handler.lua`, wrap the cache lookup with a `kong.log.info` `event=cache_hit` / `event=cache_miss` line including `kid` and `iss` (FR-017) so the US2 independent test can be observed
- [X] T057 [US2] In `services/ms-auth/src/main/java/com/poc/msauth/auth/AuthController.java`, ensure `GET /auth/jwks` returns `Cache-Control: public, max-age=60` so the gateway's HTTP layer can also short-circuit if it ever bypasses `kong.cache` (defensive, supports the US2 invariant)

**Checkpoint**: 100 sequential authenticated requests produce zero `GET /auth/jwks` log lines on `ms-auth`. p99 of validation latency ≤ 5 ms (SC-001). User Story 1 still works.

---

## Phase 5: User Story 3 - Anti-spoofing de identidade (Priority: P1)

**Goal**: Headers `X-User-Id` and `X-Claim-*` sent by the client are stripped before claim extraction, so the upstream only ever sees identity headers derived from the validated JWT (FR-010 / SC-005). Keycloak is unreachable from outside the Compose network (FR-015 / SC-010).

**Independent Test**: Send `Authorization: Bearer <alice-token>` together with `X-User-Id: admin` and `X-Claim-email: attacker@evil`; the upstream response's `user_id`/`email` reflect Alice's `sub`/`email`, not the spoofed values. From the host, `curl http://localhost:8080/realms/poc` is unreachable.

### Tests for User Story 3 ⚠️

- [X] T058 [P] [US3] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA006_spoofed_xuserid_is_overwritten` asserting that when `kong.request.get_header("X-User-Id")` returns `"admin"` and a valid token is present, the plugin first calls `kong.service.request.clear_header("X-User-Id")` and then sets it from `payload.sub`
- [X] T059 [P] [US3] busted schema spec `kong/plugins/jwt-keycloak-validator/spec/01-schema_spec.lua` asserting `strip_client_headers` defaults to `true`, that `algorithm` is one_of `RS256|RS384|RS512`, and that `cache_ttl`/`negative_cache_ttl` defaults are `3600`/`30`
- [X] T060 [P] [US3] Add Newman request `Spoof X-User-Id` to `tests/newman/auth-trust-gateway.postman_collection.json` named `CA-006` that sends spoofed headers, asserts response `user_id == jwtSub` and `user_id != "admin"`
- [X] T061 [P] [US3] Add Newman request `Keycloak unreachable from host` named `CA-010` (smoke for SC-010) that targets `http://localhost:8080/realms/poc` with a 2s timeout and asserts a connection failure (using Postman's `pm.expect(pm.response.code).to.be.oneOf([0])` pattern via `pm.sendRequest` with error callback)

### Implementation for User Story 3

- [X] T062 [US3] In `kong/plugins/jwt-keycloak-validator/handler.lua`, at the very top of `access(conf)` (before bearer parsing), iterate `{conf.user_id_header}` ∪ `{ "X-Claim-" .. c for c in conf.forward_claims }` and call `kong.service.request.clear_header(name)` when `conf.strip_client_headers == true`. Log a `WARN` once per request when at least one client-supplied identity header was stripped (FR-017)
- [X] T063 [US3] Re-confirm in `docker-compose.yml` that the `keycloak` service uses `expose: [8080]` and **no** `ports:` mapping; document the invariant in a `# FR-015` comment immediately above the service block
- [X] T064 [US3] Verify `kong/kong.yml` `auth-public` route does **not** include `jwt-keycloak-validator` (login cannot require a token); add a `# FR-001/FR-002 — public, no auth plugin` comment

**Checkpoint**: Spoofing tests pass; Keycloak is unreachable from the host. User Stories 1 + 2 still pass.

---

## Phase 6: User Story 4 - Resiliência quando o serviço de autenticação está fora (Priority: P2)

**Goal**: With JWKS cached and `ms-auth` down, requests with known `kid` continue to be served until TTL expires; tokens with unknown `kid` are rejected with `key_not_available` and the failure is negative-cached for `negative_cache_ttl` (FR-006 / SC-007).

**Independent Test**: After warming, `docker compose stop ms-auth`; requests with the cached `kid` keep returning 200. A fabricated token with random `kid` returns 401 `key_not_available` and a second identical request shows zero retries to `ms-auth`.

### Tests for User Story 4 ⚠️

- [X] T065 [P] [US4] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA008_msauth_down_cached_kid_still_works` (loader callback is never invoked when cache holds the PEM, simulating `ms-auth` outage)
- [X] T066 [P] [US4] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA009_unknown_kid_with_msauth_down_returns_401_and_negative_caches` (mock loader to return `nil, "fetch_failed"`; assert response 401 with `key_not_available`; assert subsequent identical lookup hits `kong.cache` returning `nil` without invoking loader again within `negative_cache_ttl`)
- [X] T067 [P] [US4] Chaos shell script `tests/k6/chaos-msauth-down.sh` that starts a 500 RPS k6 run against `/api/products`, after 10s runs `docker compose stop ms-auth`, holds 30s, asserts `2xx` rate stays at 100% for cached-`kid` traffic, then restarts `ms-auth`

### Implementation for User Story 4

- [X] T068 [US4] In `kong/plugins/jwt-keycloak-validator/cache.lua` ensure the `loader` returns `nil` when the upstream fetch fails so that `kong.cache:get` stores the negative entry honoring `neg_ttl=conf.negative_cache_ttl`; surface error metadata via a second return value for logging
- [X] T069 [US4] In `kong/plugins/jwt-keycloak-validator/handler.lua`, when `cache.get` returns `nil`, respond `401 { message = "key_not_available" }` (per `contracts/plugin-schema.md` Error contract) and `kong.log.warn` with `event=key_not_available, kid=…, iss=…`
- [X] T070 [US4] In `services/ms-auth/src/main/java/com/poc/msauth/auth/AuthService.java`, when Keycloak's `/certs` endpoint times out / 5xx, return the previously cached JWKS from Caffeine if present; otherwise propagate `idp_unavailable` so `ms-auth` returns 503 (so the negative-cache window kicks in on the gateway side)

**Checkpoint**: With `ms-auth` stopped, cached-`kid` traffic keeps flowing; unknown-`kid` traffic is rejected without retry storms. User Stories 1–3 still pass.

---

## Phase 7: User Story 5 - Rotação de chave transparente (Priority: P2)

**Goal**: When the IdP rotates its signing key, the first token signed with the new `kid` triggers a single JWKS refresh and is validated successfully; concurrent unknown-`kid` requests coalesce on a single fetch (FR-007 / SC-006).

**Independent Test**: Force a key rotation in Keycloak (via `kcadm.sh create keys`), log in to receive a token signed with the new `kid`, send a single request that succeeds, and confirm `ms-auth` access logs show exactly one extra JWKS fetch.

### Tests for User Story 5 ⚠️

- [X] T071 [P] [US5] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA007_unknown_kid_triggers_single_refresh` (mock `kong.cache:get` to invoke loader exactly once for N concurrent calls with the same unknown `kid`, asserting the coalescing contract)
- [X] T072 [P] [US5] Add to `kong/plugins/jwt-keycloak-validator/spec/03-handler_spec.lua` test `CA007_rotated_kid_then_validated` (loader returns PEM for the new `kid` on first call; subsequent verify_jwt_obj succeeds)
- [X] T073 [P] [US5] Newman request `Rotate key + new token` named `CA-007` in `tests/newman/auth-trust-gateway.postman_collection.json` that uses `pm.sendRequest` to call a helper script `scripts/test/rotate-keycloak-key.sh`, then re-logs in and asserts `GET /api/products` returns 200
- [X] T074 [P] [US5] Helper script `scripts/test/rotate-keycloak-key.sh` invoking `docker compose exec keycloak /opt/keycloak/bin/kcadm.sh` to authenticate as admin and create a new RSA signing key with priority 200 in realm `poc` (per quickstart §8)

### Implementation for User Story 5

- [X] T075 [US5] Confirm `kong/plugins/jwt-keycloak-validator/cache.lua` relies on `kong.cache:get` (which provides L1/L2 with built-in mutex coalescing) so that N concurrent misses on the same `kid` invoke the loader exactly once — add an explicit comment documenting the contract and reference to FR-007
- [X] T076 [US5] In `kong/plugins/jwt-keycloak-validator/handler.lua`, log `event=jwks_refresh, reason=unknown_kid, kid=<…>` at INFO level when the loader callback runs (FR-017, supports SC-006 verification)

### Token-forging helper (also reused by US1 polish)

- [X] T077 [P] [US5] Helper script `scripts/test/forge-expired-token.sh` (shell + `docker compose exec keycloak`) that signs a JWT with the realm's active key but `exp` in the past — referenced by quickstart §5 and reused by the CA-004 Newman case (created in Polish T086)

**Checkpoint**: Key rotation is transparent — the first request after rotation produces exactly one extra JWKS fetch, then `kong.cache` resumes serving from memory. User Stories 1–4 still pass.

---

## Phase 8: ~~User Story 6 — Cache compartilhado entre nós~~ — CANCELLED

> **Status**: All tasks below are **CANCELLED**. Rationale: see top-of-file note and `research.md` R7. The Redis layer was removed to keep `cache.lua` and the Compose surface minimal for a 1-node POC. `kong-b` is preserved (under `--profile multinode`) but each node keeps its own in-process `kong.cache` — no shared backend.

- [~] ~~T078 [P] [US6]~~ busted spec `04-cache_redis_spec.lua` — file deleted.
- [~] ~~T079 [P] [US6]~~ Newman folder `Multi-node Redis` — repurposed as `Multi-node` (independent caches, see polish phase).
- [~] ~~T080 [US6]~~ Redis branch in `cache.lua` — removed.
- [~] ~~T081 [US6]~~ `redis` service in `docker-compose.yml` — removed.
- [~] ~~T082 [US6]~~ `kong-b` `profiles: [redis,multinode]` — kept as `profiles: [multinode]` only, no Redis dependency.
- [~] ~~T083 [US6]~~ env-driven `cache_strategy`/`redis_*` placeholders in `kong.yml` — removed.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, full coverage of CA-001..CA-009, observability and documentation.

- [X] T084 [P] Add Newman request `CA-004 token expirado` in `tests/newman/auth-trust-gateway.postman_collection.json` calling `scripts/test/forge-expired-token.sh` (T077) and asserting 401 + body `token_verification_failed: 'exp' claim expired`
- [X] T085 [P] Add Newman request `CA-005 assinatura adulterada` in `tests/newman/auth-trust-gateway.postman_collection.json` (Postman test script tampers the payload base64 and re-encodes); assert 401 + `token_verification_failed: signature mismatch`
- [X] T086 [P] Add Newman environment file `tests/newman/env.poc.postman_environment.json` with variables `BASE_URL`, `USERNAME`, `PASSWORD`, `KC_REALM`
- [X] T087 [P] Add Newman folder `Public auth flow` covering `CA-001` (login), with `pm.test` assertions matching `contracts/ms-auth.openapi.yaml` `TokenResponse`
- [X] T088 [P] Document plugin module layout and contract in `kong/plugins/jwt-keycloak-validator/README.md` (priority, schema, error contract, performance budget — copy from `contracts/plugin-schema.md` with cross-link)
- [X] T089 [P] Document the `ms-auth` API in `services/ms-auth/README.md` linking to `contracts/ms-auth.openapi.yaml`
- [X] T090 [P] Add Prometheus scrape annotations comment to `docker-compose.yml` and a TODO snippet for enabling Kong's `prometheus` plugin globally (research.md R15: deferred from POC)
- [X] T091 [P] Add `tests/k6/README.md` documenting how to run the load test and interpret the SC-001/SC-003 thresholds
- [ ] T092 Run `quickstart.md` end-to-end against a fresh `docker compose down -v && docker compose up -d --build`; ensure all 13 sections pass; record any drift between quickstart and implementation as fix-up commits
- [X] T093 [P] Add CI workflow `.github/workflows/ci.yml` running `./mvnw -pl services/ms-auth,services/ms-products,services/ms-payments test` + `docker compose run --rm kong /usr/local/bin/pongo run` + `npx newman run …` against an ephemeral compose stack

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — can start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories** because every story needs the Compose stack, the plugin module layout and the Spring Boot skeletons to exist.
- **User Story 1 (Phase 3)**: depends only on Foundational. MVP.
- **User Story 2 (Phase 4)**: depends on US1 (handler + cache module already in place).
- **User Story 3 (Phase 5)**: depends on US1 (handler exists). Independently testable: spoofing scenarios layer cleanly on top of US1's happy path.
- **User Story 4 (Phase 6)**: depends on US2 (cache lookup wired). Negative caching is an extension of the same loader.
- **User Story 5 (Phase 7)**: depends on US2 (relies on `kong.cache`'s built-in mutex for the coalescing guarantee).
- **~~User Story 6 (Phase 8)~~**: CANCELLED — see top-of-file note.
- **Polish (Phase 9)**: depends on whichever user stories are in scope for the release.

### Within Each User Story

- Tests MUST be written first and confirmed FAILING before implementation (TDD per spec.md test directives).
- DTOs / models before services; services before controllers; controllers before route wiring in `kong.yml`.
- Plugin: `schema.lua` and `jwks.lua` before `handler.lua` consumes them; `cache.lua` before negative-cache (US4).

### Parallel Opportunities

- All Setup `[P]` tasks (T002–T004) can run in parallel.
- Foundational: T006–T029 are mostly `[P]` (each touches an isolated file/module). T030–T033 are sequential because they all extend `docker-compose.yml` / `kong.yml`.
- US1 tests (T034–T041) all `[P]` — different files.
- US1 implementation: T042 → T043 → T044 sequentially (same module). T045 and T046 are `[P]` (different services). T047 → T048 sequential (handler depends on `jwks.lua`). T049 separate module.
- US2 tests (T051–T054) all `[P]`. Implementation tasks (T055/T056/T057) can interleave because they touch different files.
- US3, US4, US5 tests within each phase all `[P]`.

---

## Parallel Example: User Story 1

```bash
# Tests first, all in parallel:
Task: "T034 Contract test for POST /auth/login"
Task: "T035 Contract test for POST /auth/refresh"
Task: "T036 Contract test for GET /auth/jwks"
Task: "T037 Contract test for GET /products"
Task: "T038 Contract test for POST /payments"
Task: "T039 Integration test AuthFlowIT (Testcontainers)"
Task: "T040 busted spec 03-handler_spec CA001_happy_path"
Task: "T041 Newman happy-path collection"

# Then implementation:
Task: "T042 KeycloakClient @HttpExchange"
Task: "T045 ProductsController" + Task: "T046 PaymentsController"  # parallel, different services
Task: "T047 jwks.lua fetch + find_pem"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 — all P1)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3 (US1) → demo the happy path with `quickstart §3`.
4. Complete Phase 4 (US2) → validate the zero round-trip claim with `quickstart §3.3` and the k6 latency budget.
5. Complete Phase 5 (US3) → validate anti-spoofing with `quickstart §4` and the unreachable-Keycloak smoke (`§12`).

At this point the POC delivers its core value proposition and CA-001..CA-006 are green.

### Incremental Delivery

- **MVP demo**: After Phase 5 you can show login + protected access + cache hit + anti-spoofing + IdP isolation.
- **Add US4 (P2)**: Phase 6 → resilience demo (`quickstart §7` + `tests/k6/chaos-msauth-down.sh`).
- **Add US5 (P2)**: Phase 7 → rotation demo (`quickstart §8`).
- **Polish (Phase 9)**: full Newman suite covering CA-001..CA-009 + CI + READMEs.

### Parallel Team Strategy

After Foundational completes:

- Developer A: US1 → US2.
- Developer B: US3 (independent of US2 — only needs the handler skeleton from US1).
- Developer C: US4 then US5 (both extend the cache module from US2).

---

## Notes

- `[P]` tasks operate on different files and have no dependency on incomplete tasks.
- `[Story]` label maps each task to a user story for traceability — every spec acceptance ID (`CA-001`..`CA-009`) is referenced explicitly in test task names so traceability is greppable per the project rules.
- Anti-spoofing (FR-010) is defaulted ON in `schema.lua` (T026) and exercised by US3; never ship a route with `strip_client_headers=false` in production.
- The plugin must **never** call Keycloak directly — only `http://ms-auth:8080/auth/jwks` per FR-005 (validated indirectly by US1/US2 contract tests).
- Verify tests fail before implementing each story.
- Commit after each task or logical group (Spec Kit `after_*` git hooks are configured to assist).
- Stop at any checkpoint to validate the story independently; the architecture is intentionally sliced so each P1 story produces independently demoable behavior.
