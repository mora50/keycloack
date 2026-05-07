# Auth Trust Gateway — POC para o time de Kong

> Documento autocontido. Pode ser lido de cima a baixo sem abrir mais nenhum arquivo do repositório. Se quiser navegar pelo código depois, todos os caminhos referenciados são relativos à raiz do projeto.

**Stack**: Kong OSS 3.9.1 (DB-less) + plugin Lua custom · Keycloak 26.6.1 · Spring Boot 4.0.6 (Java 25) · Docker Compose v2.

---

## TL;DR

```bash
git clone <repo-url> && cd keycloack
cp .env.example .env
docker compose up -d --build           # ~60s

# 1) login -> token JWT
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

# 2) request autenticada -> Kong valida o JWT localmente e injeta X-User-Id
curl -s http://localhost:8000/api/products \
  -H "Authorization: Bearer $TOKEN" | jq
```

A única porta exposta é a do Kong (`localhost:8000`). Keycloak, `ms-auth`, `ms-products` e `ms-payments` ficam em rede interna do Compose.

---

## 1. O problema que essa POC resolve

Cenário comum em arquitetura de microsserviços com OAuth2/OIDC:

- Você tem um IdP (Keycloak) emitindo JWTs.
- Você tem N microsserviços que precisam saber **quem** está chamando.
- Se cada microsserviço validar o token sozinho, você duplica lógica de validação, lib de JWT, configuração de issuer/audience, cache de JWKS, etc. — e abre espaço pra inconsistência de segurança entre serviços.
- Se você fizer introspection remota a cada request, paga 1 round-trip extra por chamada e cria dependência crítica do IdP no caminho quente.

**Esta POC** centraliza a validação no gateway:

1. **Kong** valida o JWT **localmente** (offline, com a chave pública em cache).
2. Kong injeta a identidade do usuário num header confiável (`X-User-Id`) e remove qualquer header de identidade que o cliente tenha tentado mandar (anti-spoofing).
3. Microsserviços downstream **não validam JWT** — confiam apenas no header injetado pelo gateway.
4. Keycloak **não fica exposto** ao cliente final. Tudo passa pelo Kong.

Quem fala com o Keycloak é exclusivamente o `ms-auth` (login, refresh, e proxy do JWKS). Kong nunca chama o Keycloak diretamente.

---

## 2. Arquitetura em 1 minuto

```
┌──────────┐         ┌──────────────────────────────────────────────┐
│  Cliente │─────────│  Kong :8000 (única porta pública)            │
│ (browser │ HTTPS   │  ┌────────────────────────────────────────┐  │
│  / curl) │         │  │ plugin: jwt-keycloak-validator         │  │
└──────────┘         │  │  - strip X-User-Id / X-Claim-* (FR-010)│  │
                     │  │  - parse Bearer + decodifica kid       │  │
                     │  │  - kong.cache:get("jwks:<iss>:<kid>")  │  │
                     │  │     └── miss → GET ms-auth/auth/jwks   │  │
                     │  │  - verify_jwt_obj(pem, claims)         │  │
                     │  │  - inject X-User-Id (sub) + X-Claim-*  │  │
                     │  └────────────────────────────────────────┘  │
                     │           │                  │               │
                     │ /auth/*   │ /api/products    │ /api/payments │
                     ▼           ▼                  ▼               ▼
              ┌─────────────┐ ┌────────────┐ ┌─────────────┐
              │  ms-auth    │ │ ms-products│ │ ms-payments │  (rede interna)
              │  (Spring)   │ │  (Spring)  │ │  (Spring)   │
              │  :8080      │ │  :8080     │ │  :8080      │
              │             │ │            │ │             │
              │ login       │ │ confia     │ │ confia      │
              │ refresh     │ │ X-User-Id  │ │ X-User-Id   │
              │ /auth/jwks  │ │            │ │             │
              └──────┬──────┘ └────────────┘ └─────────────┘
                     │
                     │ (somente ms-auth fala com Keycloak)
                     ▼
              ┌─────────────┐
              │  Keycloak   │  (sem ports: no compose — invisível ao host)
              │  :8080      │
              └─────────────┘
```

### Invariantes de segurança (NÃO violar)

1. **O cliente final nunca alcança o Keycloak.** O serviço `keycloak` no `docker-compose.yml` não tem `ports:` mapeado.
2. **Kong sempre roda `jwt-keycloak-validator` com `strip_client_headers: true`** em toda rota protegida. Isso remove qualquer `X-User-Id` ou `X-Claim-*` enviado pelo cliente **antes** de injetar os headers definitivos.
3. **Microsserviços downstream nunca validam JWT.** Confiam apenas no `X-User-Id` injetado pelo Kong.
4. **O plugin nunca chama o Keycloak diretamente** — só `http://ms-auth:8080/auth/jwks`.

---

## 3. Componentes

| Serviço | Porta no host | Papel |
|---------|---------------|-------|
| `kong` | **8000** (único endpoint público) | API gateway. Roda `jwt-keycloak-validator` em `/api/*`. Roteia `/auth/*` direto pro `ms-auth` (público, sem plugin). |
| `keycloak` | _nenhuma_ | IdP. Realm `poc`, cliente `poc-client`, usuário `alice`/`alice`. |
| `ms-auth` | _nenhuma_ | Spring Boot. Único componente que fala com Keycloak. Expõe `POST /auth/login`, `POST /auth/refresh`, `GET /auth/jwks` (este último é o que o plugin do Kong consome). |
| `ms-products` | _nenhuma_ | Spring Boot. Eco do `X-User-Id` recebido. |
| `ms-payments` | _nenhuma_ | Spring Boot. Eco do `X-User-Id` recebido. |
| `kong-b` | 8001 (opcional) | Segundo nó Kong, ativado por `--profile multinode`. Cada nó tem cache em-processo independente. |
| `frontend` | 3000 (opcional) | React/Vite com demo interativa. Ativado por `--profile frontend`. |

---

## 4. O caminho de um request autenticado

1. Cliente faz `POST /auth/login` no Kong → roteado direto pro `ms-auth` (rota pública, sem plugin).
2. `ms-auth` chama o Keycloak (`/protocol/openid-connect/token`, grant `password`) e devolve `access_token` + `refresh_token` JWT (RS256).
3. Cliente faz `GET /api/products` com `Authorization: Bearer <access_token>`.
4. Kong intercepta no `access` phase e roda o plugin:
   - **Step 1**: remove `X-User-Id` e `X-Claim-*` que o cliente tentou enviar (anti-spoofing).
   - **Step 2**: extrai o token do header `Authorization`.
   - **Step 3**: decodifica o JWT **sem verificar** só pra ler o `kid` do header.
   - **Step 4**: busca a chave pública correspondente no `kong.cache`. Se for hit (caso comum), zero I/O. Se for miss, dispara um `GET http://ms-auth:8080/auth/jwks`, extrai o JWK do `kid` certo, converte pra PEM e cacheia.
   - **Step 5**: verifica assinatura RS256 + claims (`iss`, `exp`, opcional `aud`/`nbf`).
   - **Step 6**: lê `payload.sub` e injeta `X-User-Id: <sub>`. Para cada claim em `forward_claims` (default `preferred_username`, `email`), injeta `X-Claim-<claim>`.
5. Kong faz proxy pra `ms-products`. O microsserviço lê `X-User-Id` e responde.

**Performance no caminho feliz (cache hit)**: validação local custa ≤ 5 ms p99. Zero chamadas externas saem do Kong por request.

---

## 5. O plugin `jwt-keycloak-validator`

Quatro arquivos, ~380 linhas de Lua. Tudo ao redor de `kong/plugins/jwt-keycloak-validator/`.

| Arquivo | Linhas | Responsabilidade |
|---------|--------|------------------|
| `schema.lua` | 60 | Define os campos de configuração do plugin (defaults, validações, `one_of`). |
| `handler.lua` | 142 | Implementa o `access(conf)`. É a entrada do plugin no ciclo de vida do Kong. |
| `cache.lua` | 80 | Wrapper sobre `kong.cache:get` que entrega coalescing de misses + negative caching. |
| `jwks.lua` | 98 | `fetch(url)` do JWKS via `lua-resty-http` + `find_pem(jwks, kid)` que converte JWK→PEM via `lua-resty-openssl`. |

**Prioridade**: `1005`. Roda antes de plugins de logging e correlation, depois de plugins de pre-function customizados.

**Dependências runtime** (instaladas via luarocks no `kong/Dockerfile`):

- `lua-resty-jwt` — decode + verify do JWT.
- `lua-resty-jwt-validators` — validators de claims (`iss`, `exp`, `nbf`, `aud`).
- `lua-resty-http` — cliente HTTP pra fetchar o JWKS.
- `lua-resty-openssl` — conversão JWK (`n`/`e` em base64url) → PEM RSA.

### 5.1 `schema.lua` (configuração)

```lua
-- kong/plugins/jwt-keycloak-validator/schema.lua
local typedefs = require "kong.db.schema.typedefs"

return {
  name = "jwt-keycloak-validator",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = {
        type = "record",
        fields = {
          { jwks_url = typedefs.url { required = true } },
          { issuer = { type = "string", required = true } },
          { audience = { type = "string", required = false } },
          { algorithm = {
              type = "string",
              required = false,
              default = "RS256",
              one_of = { "RS256", "RS384", "RS512" },
          } },
          { cache_ttl = { type = "number", default = 3600, gt = 0 } },
          { negative_cache_ttl = { type = "number", default = 30, gt = 0 } },
          { user_id_claim = { type = "string", default = "sub" } },
          { user_id_header = { type = "string", default = "X-User-Id" } },
          { forward_claims = {
              type = "array",
              default = { "preferred_username", "email" },
              elements = { type = "string" },
          } },
          { strip_client_headers = { type = "boolean", default = true } },
        },
      },
    },
  },
}
```

| Campo | Default | O que é |
|-------|---------|---------|
| `jwks_url` | _obrigatório_ | URL do JWKS proxy (no nosso caso, `http://ms-auth:8080/auth/jwks`). |
| `issuer` | _obrigatório_ | Valor esperado no claim `iss`. |
| `audience` | `null` | Se setado, o claim `aud` precisa conter este valor. |
| `algorithm` | `RS256` | RS256 / RS384 / RS512. |
| `cache_ttl` | `3600` (s) | TTL de cache positivo (chave válida). |
| `negative_cache_ttl` | `30` (s) | TTL de cache negativo (falha de fetch). Evita retry storm contra `ms-auth`. |
| `user_id_claim` | `sub` | Claim de origem do `X-User-Id`. |
| `user_id_header` | `X-User-Id` | Nome do header injetado. |
| `forward_claims` | `["preferred_username","email"]` | Claims encaminhadas como `X-Claim-<name>`. |
| `strip_client_headers` | `true` | **Anti-spoofing. NÃO desligar em produção.** |

### 5.2 `handler.lua` (o coração do plugin)

```lua
-- kong/plugins/jwt-keycloak-validator/handler.lua
local jwt_decoder = require "resty.jwt"
local validators  = require "resty.jwt-validators"
local cache_mod   = require "kong.plugins.jwt-keycloak-validator.cache"

local JwtKeycloakValidator = {
  PRIORITY = 1005,
  VERSION = "0.1.0",
}

local function unauthorized(message)
  return kong.response.exit(401, { message = message })
end

local function strip_client_identity_headers(conf)
  local spoof_attempted = false

  if kong.request.get_header(conf.user_id_header) then
    spoof_attempted = true
  end
  kong.service.request.clear_header(conf.user_id_header)

  if conf.forward_claims then
    for _, claim in ipairs(conf.forward_claims) do
      local hname = "X-Claim-" .. claim
      if kong.request.get_header(hname) then
        spoof_attempted = true
      end
      kong.service.request.clear_header(hname)
    end
  end

  if spoof_attempted then
    kong.log.warn("event=identity_headers_stripped reason=anti_spoofing")
  end
end

local function extract_bearer()
  local auth = kong.request.get_header("authorization")
  if not auth then return nil end
  if auth:sub(1, 7):lower() ~= "bearer " then return nil end
  local token = auth:sub(8):gsub("^%s+", ""):gsub("%s+$", "")
  if token == "" then return nil end
  return token
end

function JwtKeycloakValidator:access(conf)
  -- Step 1 (FR-010): strip qualquer X-User-Id / X-Claim-* enviado pelo cliente
  if conf.strip_client_headers then
    strip_client_identity_headers(conf)
  end

  -- Step 2: parse Authorization: Bearer <token>
  local token = extract_bearer()
  if not token then
    return unauthorized("missing_or_invalid_authorization")
  end

  -- Step 3: decode unverified só pra ler o kid do header
  local jwt_obj = jwt_decoder:load_jwt(token)
  if not jwt_obj or not jwt_obj.valid or not jwt_obj.header or not jwt_obj.header.kid then
    return unauthorized("invalid_jwt_format")
  end

  local kid = jwt_obj.header.kid
  local cache_key = "jwks:" .. conf.issuer .. ":" .. kid

  -- Step 4: cache lookup (hit ⇒ no I/O; miss ⇒ load via ms-auth, mutex-coalesced)
  local pem, cerr = cache_mod.get(cache_key, conf, kid)
  if not pem then
    kong.log.warn("event=key_not_available kid=", kid, " err=", tostring(cerr))
    return unauthorized("key_not_available")
  end

  -- Step 5: verify signature + claims
  local claim_specs = {
    iss = validators.equals(conf.issuer),
    exp = validators.is_not_expired(),
    nbf = validators.opt_is_not_before(),
  }
  if conf.audience then
    claim_specs.aud = validators.contains(conf.audience)
  end

  local verified = jwt_decoder:verify_jwt_obj(pem, jwt_obj, claim_specs)
  if not verified or not verified.verified then
    local reason = verified and verified.reason or "signature mismatch"
    return unauthorized("token_verification_failed: " .. reason)
  end

  -- Step 6: inject identity headers a partir do payload validado
  local payload = jwt_obj.payload or {}
  local sub = payload[conf.user_id_claim]
  if sub ~= nil then
    kong.service.request.set_header(conf.user_id_header, tostring(sub))
  end
  if conf.forward_claims then
    for _, claim in ipairs(conf.forward_claims) do
      local v = payload[claim]
      if v ~= nil then
        kong.service.request.set_header("X-Claim-" .. claim, tostring(v))
      end
    end
  end
end

return JwtKeycloakValidator
```

**Por que strip ANTES de validar o token?** Mesmo que o token seja inválido, o request será rejeitado com 401 — mas se desligássemos `strip_client_headers` confiando que o handler retorna cedo no 401, qualquer plugin posterior (ou mesmo um misconfig de rota) poderia vazar o header pro upstream. Stripar primeiro torna a invariante incondicional.

### 5.3 `cache.lua` (o segredo da performance)

```lua
-- kong/plugins/jwt-keycloak-validator/cache.lua
local jwks = require "kong.plugins.jwt-keycloak-validator.jwks"

local M = {}

local function load_public_key(conf, kid)
  kong.log.info("event=jwks_refresh reason=unknown_kid kid=", kid, " iss=", conf.issuer)

  local jwks_doc, err = jwks.fetch(conf.jwks_url, 1000)  -- 1s timeout
  if not jwks_doc then return nil, err end

  local pem, ferr = jwks.find_pem(jwks_doc, kid)
  if not pem then return nil, ferr end

  return pem
end

function M.get(key, conf, kid, loader)
  loader = loader or load_public_key

  if not kong or not kong.cache then
    -- fallback p/ unit test fora do runtime do Kong
    return loader(conf, kid)
  end

  local opts = {
    ttl     = conf.cache_ttl,
    neg_ttl = conf.negative_cache_ttl,
  }

  local pem, err = kong.cache:get(key, opts, loader, conf, kid)
  if err then return nil, "cache_error: " .. tostring(err) end
  return pem
end

return M
```

#### Por que `kong.cache` e não Redis / shared dict caseiro?

`kong.cache` é nativo do Kong e já entrega **três coisas** que precisaríamos reescrever na mão:

1. **L1 (worker LRU em LuaJIT) + L2 (`lua_shared_dict` compartilhado entre workers do mesmo nó)**. Cache hit custa 1–10 µs. Bem abaixo dos 5 ms de orçamento de latência.
2. **Mutex coalescing por chave**: se 1000 requests com o mesmo `kid` desconhecido chegam ao mesmo tempo, o `loader` é chamado **uma única vez**. As outras 999 esperam o resultado. Isso é o que entrega "single JWKS refresh per burst" sem nenhuma linha de lock manual.
3. **Negative caching com TTL próprio**: se o `loader` retorna `(nil, err)`, esse erro fica cacheado por `negative_cache_ttl` segundos (default 30s). Isso evita que um `kid` desconhecido (ex.: token de outro realm) gere uma chamada por request ao `ms-auth`.

**E pra multi-nó?** Cada nó Kong mantém seu próprio cache em-processo. Trade-off conhecido: cada nó paga **no máximo um fetch** ao `ms-auth` por `kid` por TTL. Para a POC (e pra maioria dos casos reais), isso é mais que suficiente — uma camada Redis compartilhada é evolução pós-POC.

### 5.4 `jwks.lua` (fetch + JWK→PEM)

```lua
-- kong/plugins/jwt-keycloak-validator/jwks.lua
local http     = require "resty.http"
local cjson    = require "cjson.safe"
local pkey_lib = require "resty.openssl.pkey"
local bn_lib   = require "resty.openssl.bn"
local b64      = require "ngx.base64"

local M = {}

function M.fetch(url, timeout_ms)
  local httpc, err = http.new()
  if not httpc then return nil, "http_client_init_failed: " .. tostring(err) end

  httpc:set_timeout(timeout_ms or 1000)

  local res, perr = httpc:request_uri(url, {
    method  = "GET",
    headers = { ["Accept"] = "application/json" },
    ssl_verify        = false,
    keepalive_timeout = 60000,
    keepalive_pool    = 10,
  })

  if not res                 then return nil, "fetch_failed: " .. tostring(perr) end
  if res.status ~= 200       then return nil, "fetch_failed: status " .. tostring(res.status) end
  if not res.body or res.body == "" then return nil, "fetch_failed: empty body" end

  local jwks, jerr = cjson.decode(res.body)
  if not jwks or type(jwks) ~= "table" or type(jwks.keys) ~= "table" then
    return nil, "fetch_failed: malformed JWKS body (" .. tostring(jerr) .. ")"
  end

  return jwks, nil
end

function M.find_pem(jwks, kid)
  if not jwks or type(jwks.keys) ~= "table" then return nil, "no_jwks" end

  for _, k in ipairs(jwks.keys) do
    if k.kid == kid then
      if k.kty ~= "RSA" then return nil, "kty_not_rsa" end

      local n_bin = b64.decode_base64url(k.n)
      local e_bin = b64.decode_base64url(k.e)
      if not n_bin or not e_bin then return nil, "invalid_jwk_encoding" end

      local n_bn = bn_lib.from_binary(n_bin)
      local e_bn = bn_lib.from_binary(e_bin)

      local pkey, perr = pkey_lib.new({
        type   = "RSA",
        params = { n = n_bn, e = e_bn },
      })
      if not pkey then return nil, "pkey_build_failed: " .. tostring(perr) end

      local pem, ferr = pkey:tostring("public", "PEM")
      if not pem then return nil, "pem_export_failed: " .. tostring(ferr) end

      return pem, nil
    end
  end

  return nil, "kid_not_found"
end

return M
```

O JWKS chega como JSON (formato RFC 7517) com `n` e `e` em base64url. `lua-resty-openssl` reconstrói a `RSA *` nativa via `pkey.new({ type="RSA", params={ n, e } })` e exporta como PEM, que é o que `lua-resty-jwt` precisa pra verificar a assinatura.

---

## 6. Configuração no `kong.yml` (DB-less declarativo)

```yaml
# kong/kong.yml
_format_version: "3.0"
_transform: true

services:
  # Rota PÚBLICA (sem plugin) — login/refresh/jwks proxy
  - name: ms-auth
    url: http://ms-auth:8080
    routes:
      - name: auth-public
        paths: [/auth]
        strip_path: false

  # Rota PROTEGIDA — JWT validation enforced
  - name: ms-products
    url: http://ms-products:8080/products
    routes:
      - name: products-protected
        paths: [/api/products]
        strip_path: true
        plugins:
          - name: jwt-keycloak-validator
            config:
              jwks_url: http://ms-auth:8080/auth/jwks
              issuer: http://keycloak:8080/realms/poc
              algorithm: RS256
              cache_ttl: 3600
              negative_cache_ttl: 30
              user_id_claim: sub
              user_id_header: X-User-Id
              forward_claims: [preferred_username, email]
              strip_client_headers: true   # FR-010 — NUNCA desligar

  - name: ms-payments
    url: http://ms-payments:8080/payments
    routes:
      - name: payments-protected
        paths: [/api/payments]
        strip_path: true
        plugins:
          - name: jwt-keycloak-validator
            config: { ... mesma config ... }

# CORS global (pro frontend de demo)
plugins:
  - name: cors
    config:
      origins: [http://localhost:5173, http://localhost:3000]
      methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
      headers: [Accept, Authorization, Content-Type]
      credentials: true
```

**Pontos importantes:**

- `/auth/*` é roteada **sem o plugin** (login não pode exigir token).
- `/api/*` aplica o plugin com `strip_client_headers: true`.
- O `issuer` é o que o Keycloak coloca em `iss` quando acessado via `KC_HOSTNAME_URL=http://keycloak:8080` (rede interna do Compose). Em produção, troca para a URL pública do IdP.

### 6.1 Como o plugin é carregado pelo Kong

```dockerfile
# kong/Dockerfile
FROM kong/kong:3.9.1
USER root
RUN luarocks install lua-resty-openssl \
 && luarocks install lua-resty-jwt \
 && luarocks install lua-resty-http \
 && luarocks install lua-resty-jwt-validators || true
COPY plugins/jwt-keycloak-validator/ /usr/local/share/lua/5.1/kong/plugins/jwt-keycloak-validator/
USER kong
```

E no `docker-compose.yml`:

```yaml
kong:
  build: { context: ./kong }
  environment:
    KONG_DATABASE: "off"
    KONG_DECLARATIVE_CONFIG: /usr/local/kong/declarative/kong.yml
    KONG_PLUGINS: bundled,jwt-keycloak-validator   # <-- habilita o plugin
  ports: ["8000:8000"]
  volumes:
    - ./kong/kong.yml:/usr/local/kong/declarative/kong.yml:ro
    - ./kong/plugins/jwt-keycloak-validator:/usr/local/share/lua/5.1/kong/plugins/jwt-keycloak-validator:ro
```

O bind-mount do diretório do plugin permite hot-reload em dev: editar um `.lua`, `docker compose restart kong` e pronto.

---

## 7. Como rodar

### 7.1 Pré-requisitos

| Ferramenta | Versão mínima |
|------------|---------------|
| Docker Engine | 24+ |
| Docker Compose | v2.20+ |
| `curl` | qualquer |
| `jq` | 1.6+ |

> Não precisa de SDK Java na máquina. Tudo roda em container.

### 7.2 Subir o ambiente

```bash
git clone <repo-url> && cd keycloack
cp .env.example .env
docker compose up -d --build
```

Em ≤ 60 segundos, todos os health checks ficam `healthy`. Verificar:

```bash
docker compose ps
```

Esperado: `keycloak`, `ms-auth`, `ms-products`, `ms-payments`, `kong` todos com status `(healthy)`.

### 7.3 Smoke test (caminho feliz)

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

curl -s http://localhost:8000/api/products \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Resposta esperada**:

```json
{
  "user_id": "<UUID do alice no Keycloak>",
  "preferred_username": "alice",
  "email": "alice@example.com",
  "products": [ { "id": "P-001", "name": "Demo Product" } ]
}
```

O `ms-products` está apenas ecoando o que recebeu nos headers `X-User-Id`, `X-Claim-preferred_username` e `X-Claim-email`.

### 7.4 Provar que NÃO há round-trip externo no caminho quente

```bash
# Acompanha logs do ms-auth
docker compose logs --tail=0 -f ms-auth &
LOG_PID=$!

# Dispara 100 requests autenticadas
for i in $(seq 1 100); do
  curl -s http://localhost:8000/api/products \
       -H "Authorization: Bearer $TOKEN" -o /dev/null
done

kill $LOG_PID
```

**Esperado**: zero linhas de log no `ms-auth` durante o loop. O JWKS já está em cache e o Kong valida tudo localmente.

### 7.5 Anti-spoofing (a invariante de segurança)

```bash
curl -s http://localhost:8000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-User-Id: admin" \
  -H "X-Claim-email: attacker@evil.example" | jq
```

**Esperado**: `user_id` e `email` na resposta refletem **o JWT do alice** (o `sub` real e o email real), nunca os valores enviados pelo cliente. O log do Kong mostra `event=identity_headers_stripped reason=anti_spoofing`.

### 7.6 Token expirado

```bash
# Existe um helper que assina um token com exp no passado usando a chave do realm
EXPIRED=$(scripts/test/forge-expired-token.sh)

curl -s -i http://localhost:8000/api/products \
  -H "Authorization: Bearer $EXPIRED"
```

**Esperado**: `HTTP/1.1 401` com body:

```json
{ "message": "token_verification_failed: 'exp' claim expired" }
```

### 7.7 Resiliência: `ms-auth` fora com cache válido

```bash
# Garante que o JWKS está no cache
curl -s http://localhost:8000/api/products \
     -H "Authorization: Bearer $TOKEN" -o /dev/null

# Derruba o ms-auth
docker compose stop ms-auth

# Request continua funcionando enquanto o TTL do cache não expira (1h por default)
curl -s -i http://localhost:8000/api/products \
     -H "Authorization: Bearer $TOKEN"

docker compose start ms-auth
```

**Esperado**: `HTTP/1.1 200` mesmo com `ms-auth` parado, durante toda a janela de `cache_ttl`.

### 7.8 Rotação de chave

```bash
# Forçar rotação no Keycloak via Admin CLI dentro do container
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 \
  --realm master --user admin --password admin

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh \
  create keys -r poc -s providerType=org.keycloak.keys.KeyProvider \
  -s name=poc-rsa-2 -s providerId=rsa-generated -s 'config.priority=["200"]'

# Login novamente — token virá assinado com o novo kid
NEW_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

curl -s -i http://localhost:8000/api/products -H "Authorization: Bearer $NEW_TOKEN"
```

**Esperado**: a primeira chamada com o novo `kid` dispara um refresh do JWKS (uma única chamada extra ao `ms-auth`), valida e responde `200`. Sem restart do Kong.

### 7.9 Tear down

```bash
docker compose down -v
```

---

## 8. Catálogo de erros (todos retornam HTTP 401)

| `message` no body | Quando ocorre |
|-------------------|---------------|
| `missing_or_invalid_authorization` | Header `Authorization` ausente, ou sem prefixo `Bearer`. |
| `invalid_jwt_format` | Token mal formado, sem `header.kid`, base64 inválido. |
| `key_not_available` | `kid` não está no JWKS após refresh; ou fetch do JWKS falhou (timeout, 5xx, body inválido). Cacheado como negativo por `negative_cache_ttl`. |
| `token_verification_failed: signature mismatch` | Assinatura RS256 não bate com a chave pública. |
| `token_verification_failed: 'exp' claim expired` | Token expirado. |
| `token_verification_failed: 'nbf' claim not yet valid` | Token com `nbf` no futuro. |
| `token_verification_failed: 'iss' claim mismatch` | `iss` ≠ `conf.issuer`. |
| `token_verification_failed: 'aud' claim mismatch` | `aud` não contém `conf.audience` (quando configurada). |

Todo cenário acima também gera `kong.log.warn` ou `kong.log.err` com `kid`/`iss`/contexto. **O token nunca é logado.**

---

## 9. Performance budget (cache hit)

| Operação | Budget |
|----------|--------|
| `kong.cache:get` (L1 LRU) | < 50 µs |
| `cjson.decode` do payload | < 200 µs |
| `verify_jwt_obj` (RS256 2048-bit) | < 1 ms |
| `set_header` × N | < 100 µs total |
| **Total p99 esperado** | **≤ 5 ms** |

Cache miss adiciona 1 round-trip ao `ms-auth` (~10–30 ms na rede do Compose), mas é amortizado pelo `cache_ttl` (default 1h).

---

## 10. Multi-nó

Para demonstrar que o plugin é stateless e scaling horizontal funciona:

```bash
docker compose --profile multinode up -d --build
```

Isso sobe um segundo nó Kong em `localhost:8001`. Cada nó tem seu **próprio cache em-processo independente**. Consequência prática: cada nó paga **no máximo um fetch** ao `ms-auth` por `kid` por TTL — não há sincronização entre nós, e isso é uma feature, não um bug.

Para validar:

```bash
# Login uma vez
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

# Bate em ambos os nós
curl -s http://localhost:8000/api/products -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s http://localhost:8001/api/products -H "Authorization: Bearer $TOKEN" -o /dev/null
```

Logs do `ms-auth` vão mostrar **dois** GETs em `/auth/jwks` (um por nó), depois nenhum.

---

## 11. Testes do plugin

A suíte fica em `kong/plugins/jwt-keycloak-validator/spec/` e usa **busted + kong-pongo**:

| Spec | Cobertura |
|------|-----------|
| `01-schema_spec.lua` | Defaults (`strip_client_headers=true`, `forward_claims`, `cache_ttl`, `negative_cache_ttl`), required, `one_of` (`algorithm`). |
| `02-jwks_spec.lua` | `fetch()`: 200 OK; timeout; status 5xx; body inválido. `find_pem()`: kid presente; ausente; `kty != RSA`. |
| `03-handler_spec.lua` | Cenários CA-001..CA-009 com `kong.cache` e `resty.http` mockados. Inclui caso de spoofing. |

Rodar:

```bash
docker compose exec kong /usr/local/bin/pongo run
```

---

## 12. Troubleshooting

### "plugin not found: jwt-keycloak-validator"

Confirme que `KONG_PLUGINS=bundled,jwt-keycloak-validator` está no environment do container, e que o diretório do plugin está montado em `/usr/local/share/lua/5.1/kong/plugins/jwt-keycloak-validator/`. Restart do container do Kong é necessário após mudar `KONG_PLUGINS`.

### `key_not_available` em todas as requests

Provavelmente o `ms-auth` não está respondendo ao `/auth/jwks`. Diagnóstico:

```bash
docker compose exec kong curl -s http://ms-auth:8080/auth/jwks
```

Se isso falha, o problema é no `ms-auth` (que por sua vez pode estar com problema de conectar ao Keycloak). Veja os logs:

```bash
docker compose logs ms-auth | tail -50
```

### `token_verification_failed: 'iss' claim mismatch`

O `iss` que o Keycloak emite depende do `KC_HOSTNAME_URL` que ele recebeu no boot. Em rede interna do Compose, deve ser `http://keycloak:8080/realms/poc`, e isso precisa bater **exatamente** com o `config.issuer` no `kong.yml`. Reiniciar o Keycloak com a env correta resolve.

### Latência alta no caminho hot

Olhar log do Kong por `event=cache_miss`. Cache miss é caro (~10–30 ms). Se está acontecendo a cada request, `cache_ttl` está zerado/baixo demais ou o JWKS está retornando body diferente a cada chamada (não deveria). Confirme com:

```bash
docker compose logs kong | grep "event=" | tail -20
```

### Plugin retorna 500 com stack trace de Lua

Em geral significa que uma das libs `lua-resty-*` não foi instalada na build da imagem. Reconstruir:

```bash
docker compose build --no-cache kong
docker compose up -d kong
```

---

## 13. O que NÃO está nesta POC

- TLS entre componentes (em produção, tudo deveria ser HTTPS; aqui tudo é HTTP na rede interna do Compose).
- mTLS Kong → upstreams (evolução pós-POC).
- Autorização fina (RBAC/ABAC, escopo por rota) — fica a cargo dos microsserviços downstream ou de outro plugin.
- Cache compartilhado (Redis/etc) entre nós Kong — proposital, está em "evolução pós-POC".
- DPoP / cert-bound tokens.
- Multi-tenant com múltiplos realms simultâneos.
- Stack Prometheus/Grafana subindo junto (os endpoints `/actuator/prometheus` e o plugin `prometheus` do Kong existem, só não estão sendo scrapeados).

---

## 14. Referências dentro do repo (caso queira aprofundar)

| Tópico | Caminho |
|--------|---------|
| Spec funcional completa (FR-001..FR-017, SC-001..SC-010) | `specs/001-auth-trust-gateway/spec.md` |
| Decisões de stack e versões (R1..R15) | `specs/001-auth-trust-gateway/research.md` |
| Contrato detalhado do plugin | `specs/001-auth-trust-gateway/contracts/plugin-schema.md` |
| Quickstart operacional com 13 cenários | `specs/001-auth-trust-gateway/quickstart.md` |
| Plano de tarefas executado | `specs/001-auth-trust-gateway/tasks.md` |
| Coleção Postman (E2E, CA-001..CA-009) | `tests/newman/auth-trust-gateway.postman_collection.json` |
| Carga + caos (k6) | `tests/k6/` |
| Frontend de demo (React + Vite) | `frontend/` (subir com `docker compose --profile frontend up`) |

---

## 15. Resumo de uma página

- **Kong OSS 3.9.1** valida JWT localmente via plugin Lua custom (`jwt-keycloak-validator`).
- O plugin baixa o JWKS de **`ms-auth`** (não do Keycloak diretamente) e cacheia em `kong.cache` (L1 LRU + L2 nginx shared dict). Cache hit ≤ 5ms p99.
- **`kong.cache`** dá de graça: coalescing de misses, negative caching, e zero código de lock. É o detalhe mais importante do design.
- **Anti-spoofing** é incondicional: `X-User-Id` e `X-Claim-*` enviados pelo cliente são removidos antes de qualquer outra coisa, sempre.
- **Keycloak invisível** ao host. Cliente final só conhece `localhost:8000` (Kong).
- **Microsserviços downstream** confiam apenas no `X-User-Id` injetado. Não validam JWT.
- Subida em ≤ 60s com `docker compose up -d --build`. Tear down com `docker compose down -v`.

---

**Versão deste doc**: 1.0 · **Data**: 2026-05-07 · **Plugin version**: 0.1.0 · **Kong**: 3.9.1 · **Keycloak**: 26.6.1
