# Phase 0 Research: Auth Trust Gateway

**Date**: 2026-05-04
**Branch**: `001-auth-trust-gateway`
**Purpose**: Resolver decisões técnicas e versões antes de gerar contratos e código.

> Cada item segue o padrão **Decision / Rationale / Alternatives considered**.

---

## R1 — Versão do Java

**Decision**: **JDK 25 (LTS)** — Eclipse Temurin 25 JRE Alpine como base das imagens Docker.

**Rationale**:
- LTS atual em maio/2026 (próximo LTS 27 ainda não lançado).
- Virtual threads estáveis (JEP 444 desde Java 21, refinados em 25) ⇒ casa bem com Spring Boot 4 e o perfil de tráfego HTTP-bound do `ms-auth`.
- Compatível com Spring Boot 4.0.x (requer Java 17+).

**Alternatives considered**:
- **Java 21 LTS**: ainda suportado, mas 25 traz refinamentos em virtual threads e generational ZGC; sem motivo para regressão.
- **Java 26 (não-LTS)**: GA em março/2026, descartado por não ser LTS — POC tem caráter durável.

---

## R2 — Versão do Spring Boot e estilo do framework web

**Decision**: **Spring Boot 4.0.6** (último patch da linha 4.0 em abril/2026), usando **Spring MVC** sobre **Tomcat com virtual threads habilitadas** (`spring.threads.virtual.enabled=true`).

**Rationale**:
- 4.0 é a linha estável corrente (GA: novembro/2025; OSS support até dez/2026).
- MVC + virtual threads é mais simples que WebFlux para um BFF de autenticação que faz poucas chamadas externas (token endpoint + JWKS proxy) e mantém o modelo de programação imperativo, mais legível e menos propenso a pegadinhas que reactive.
- Spring Boot 4 introduziu **HTTP service clients declarativos** (`@HttpExchange` + `RestClient`), que substituem com elegância o uso direto de `RestTemplate`/`WebClient` para chamar Keycloak.

**Alternatives considered**:
- **WebFlux**: descartado — overkill para o caminho quente do `ms-auth` (poucas chamadas remotas) e mais difícil de testar.
- **Spring Boot 3.5.x**: ainda viável, mas 4.0 já é estável há ~6 meses e ganha integração nativa com `@HttpExchange` + `RestClient`.
- **Quarkus / Micronaut**: descartados pela diretiva explícita do usuário ("backend use java com springboot").

---

## R3 — Cliente HTTP do `ms-auth` para o Keycloak

**Decision**: **Spring `RestClient` + `@HttpExchange` interface** (`KeycloakClient`), com timeouts agressivos (connect 1s, read 3s) e backoff exponencial em retry de falha 5xx (1 retry).

**Rationale**:
- Idiomático em Spring Boot 4.
- Permite tipar `TokenResponse`/`JwksResponse` direto da assinatura do método.
- Suporta interceptors para logging estruturado.

**Alternatives considered**:
- `RestTemplate`: ainda funciona, mas é considerado legado em projetos novos.
- `WebClient` + reactive: introduziria reactive sem ganho — `ms-auth` não é I/O-bound suficiente para justificar.
- Cliente OkHttp puro: perderia o ferramental do Spring (validação, observabilidade, etc.).

---

## R4 — Cache interno do JWKS no `ms-auth`

**Decision**: **Caffeine** com TTL de **60 segundos** para o resultado de `GET /realms/poc/protocol/openid-connect/certs`.

**Rationale**:
- O `ms-auth` é proxy do JWKS, mas precisa de cache curto para não martelar o Keycloak (cada nó Kong fará ao menos um fetch por TTL longo do plugin).
- 60s é equilíbrio entre frescor e proteção contra rajada.
- Caffeine é o cache local in-process padrão recomendado pelo Spring desde a 2.x.

**Alternatives considered**:
- Sem cache: aceitável para POC, mas viola o requisito FR-013 ("cache interno de curta duração").
- ConcurrentHashMap caseiro: suficiente, mas Caffeine já vem com expiração e métricas.
- Cache distribuído: desnecessário para um único `ms-auth`.

---

## R5 — Versão e topologia do Kong Gateway

**Decision**: **Kong OSS 3.9.1** em modo **DB-less** (declarative config via `kong.yml`), com plugin custom carregado via `KONG_PLUGINS=bundled,jwt-keycloak-validator` e `KONG_LUA_PACKAGE_PATH=/opt/kong/plugins/?.lua;;`.

**Rationale**:
- 3.9.1 é a versão estável corrente da linha 3.x (junho/2025).
- DB-less elimina o requisito de Postgres, casa com a meta de subir tudo em ≤ 60s e simplifica versionamento das rotas.
- Kong OSS suporta plugins customizados em DB-less se o plugin não declarar DAOs (nosso plugin é stateless, só usa `kong.cache` e Redis opcional).

**Alternatives considered**:
- **Kong com Postgres**: adiciona um container e ~10–15s ao boot — sem benefício para a POC.
- **Kong Konnect / Enterprise**: licenciado, fora da diretiva OSS do spec.
- **Tyk / Traefik / Envoy**: outros gateways, mas saímos da diretiva explícita do spec ("Kong Gateway").

---

## R6 — Estrutura do plugin Lua `jwt-keycloak-validator`

**Decision**: Plugin com **prioridade `1005`** (executa antes de plugins de logging e correlation, depois de plugins de pre-function customizados), com módulos:

| Arquivo | Responsabilidade |
|---------|------------------|
| `handler.lua` | `access(conf)`: strip de headers, parse do bearer, lookup no cache, verify_jwt_obj, inject de headers |
| `schema.lua`  | Definição de campos de configuração (jwks_url, issuer, audience, algorithm, cache_strategy, redis_*, user_id_*, forward_claims, strip_client_headers) |
| `jwks.lua`    | `fetch(url, timeout)`, `find_pem(jwks, kid)` (JWK→PEM via `lua-resty-openssl`) |
| `cache.lua`   | Lookup via `kong.cache:get` (L1 worker LRU + L2 nginx shared dict) com `cache_ttl` positivo e `negative_cache_ttl` para falhas |

Bibliotecas runtime: `lua-resty-jwt`, `lua-resty-jwt-validators`, `lua-resty-http`, `lua-resty-openssl` (já presentes no Kong 3.x exceto `openssl`, que é instalável via luarocks na build da imagem).

**Rationale**:
- Prioridade 1005 garante que o gateway autentica antes de qualquer transformação de body/header que outro plugin possa querer aplicar.
- Separação `handler/schema/jwks/cache` torna cada arquivo testável isoladamente com `busted`.
- Adapter de cache evita `if cache_strategy == "redis" then ... else ...` espalhado pelo handler.

**Alternatives considered**:
- **Reusar `kong-plugin-jwt-keycloak` upstream (gbbirkisson)**: arquivado e sem suporte oficial a DB-less. Fork `telekom-digioss` é uma opção, mas perdemos o controle do contrato exato (header names, claim mapping, anti-spoofing) e ganhamos dependência externa de release. Para uma POC didática, plugin custom enxuto é melhor.
- **Plugin OIDC do Kong Enterprise**: licenciado.
- **lua-resty-openidc**: faz introspection ou validação JWT, mas é heavy e mistura muitas responsabilidades — superdimensionado para a POC.

---

## R7 — Estratégia de cache no plugin

**Decision**: **Apenas `kong.cache` em-processo** (L1 worker LRU + L2 nginx shared dict). Sem cache externo na POC.

**Pseudocódigo de lookup** (em `cache.lua`):
```
function lookup(key, conf, kid):
    return kong.cache:get(
        key,
        { ttl = conf.cache_ttl, neg_ttl = conf.negative_cache_ttl },
        loader,         -- chamado UMA vez por rajada de mesmo kid (mutex de kong.cache)
        conf, kid
    )

function loader(conf, kid):
    jwks = jwks.fetch(conf.jwks_url, 1000ms)
    if not jwks: return nil, err   -- vira entrada negativa por neg_ttl
    return jwks.find_pem(jwks, kid)
```

**Rationale**:
- `kong.cache` já é dois níveis (L1 LRU em LuaJIT + L2 `lua_shared_dict` entre workers). Hit custa ~1–10 µs, bem abaixo dos 5 ms de SC-001.
- O **mutex coalescing por chave** embutido em `kong.cache:get` entrega FR-007 / SC-006 ("um único refresh por rajada de `kid` desconhecido") **sem nenhuma linha de lock manual**.
- O **negative caching** com TTL próprio (`neg_ttl`) protege o `ms-auth` de retry storms quando um `kid` desconhecido aparece.
- Para uma POC didática, ter um único caminho de cache torna o fluxo "request → kong.cache → ms-auth" trivial de explicar e auditar.

**Alternatives considered**:
- **Layer adicional Redis** (versão anterior do plano, US6 P3): foi descartada para esta POC porque (a) introduz uma dependência opcional que complica a leitura do `cache.lua` sem agregar valor para 1 nó; (b) o problema que ela resolve — coordenação de cache entre N nós Kong — só aparece em produção multi-nó, fora do escopo da POC. A camada pode ser reintroduzida no futuro como `cache.lua::M.get` com um adapter, sem alterar o `handler.lua`.
- **Apenas Redis (sem `kong.cache`)**: cada cache hit pagaria um round-trip Redis (~0,3–1 ms) — fere SC-001 com folga e queima budget de latência por nada quando o nó já tem a chave em memória.
- **Cache em `lua_shared_dict` puro com mutex manual**: viável mas reescreveria mal o que `kong.cache` já entrega (coalescing + negative cache + invalidação cluster-aware). Sem motivo.

---

## R8 — Versão do Keycloak e provisioning do realm

**Decision**: **`quay.io/keycloak/keycloak:26.6.1`** rodando como `start-dev --import-realm`, com volume `./keycloak/realm-export/:/opt/keycloak/data/import:ro`.

Realm `poc-realm.json` contém:
- Realm `poc`
- Cliente `poc-client` (public, grant `password` habilitado, grant `refresh_token` habilitado)
- Role `user`
- Usuário `alice` / senha `alice` (apenas para POC) com role `user`
- Mapper que injeta `preferred_username` e `email` no access token

**Rationale**:
- 26.6.1 é a estável atual da família 26.x (Quarkus-based).
- `start-dev` com H2 embarcado é suficiente — banco persistente está fora do escopo da POC.
- `--import-realm` é o caminho oficial recomendado para realm pré-provisionado em desenvolvimento desde Keycloak 19.

**Alternatives considered**:
- `start --optimized` com Postgres: produção-ready, mas adiciona ~15s ao boot e mais um container; viola SC-002 sem ganho para POC.
- Bootstrap via `kcadm.sh` em script de init: mais flexível, mas menos reproduzível que JSON versionado.

---

## R9 — Visibilidade do Keycloak na rede do Compose

**Decision**: O serviço `keycloak` no `docker-compose.yml` **não expõe portas para o host** (`expose:` ao invés de `ports:`). Apenas a rede interna do Compose alcança o Keycloak. O `ms-auth` resolve `http://keycloak:8080` por DNS interno.

**Rationale**:
- Atende FR-015 / SC-010 ("Keycloak invisível para o cliente final").
- Em modo dev, é trivial inspecionar via `docker compose exec keycloak ...` ou `docker compose port` quando necessário; o cliente final, porém, nunca vê o Keycloak.

**Alternatives considered**:
- Expor 8080 do Keycloak: violaria o requisito de spec.
- Network mode `internal: true` em rede dedicada: viável, mas adiciona complexidade desnecessária.

---

## R10 — *(removido)* — versão do Redis não se aplica mais

A POC não usa mais um cache externo (ver R7). Bullet mantido como placeholder para preservar a numeração de R11..R15 nos cross-references existentes.

---

## R11 — Como o cliente final acessa as rotas autenticadas

**Decision**: Kong expõe **uma única porta pública** (`8000`) que serve tanto rotas públicas (`/auth/*` ⇒ `ms-auth`, sem plugin) quanto rotas protegidas (`/api/*` ⇒ `ms-products`/`ms-payments`, com plugin `jwt-keycloak-validator`).

**Mapeamento declarado em `kong/kong.yml`**:

```yaml
_format_version: "3.0"
services:
  - name: ms-auth
    url: http://ms-auth:8080
    routes:
      - { name: auth-public, paths: ["/auth"] }
  - name: ms-products
    url: http://ms-products:8080
    routes:
      - name: products-protected
        paths: ["/api/products"]
        plugins:
          - name: jwt-keycloak-validator
            config: { jwks_url: "http://ms-auth:8080/auth/jwks", issuer: "http://keycloak:8080/realms/poc" }
  - name: ms-payments
    url: http://ms-payments:8080
    routes:
      - name: payments-protected
        paths: ["/api/payments"]
        plugins:
          - name: jwt-keycloak-validator
            config: { jwks_url: "http://ms-auth:8080/auth/jwks", issuer: "http://keycloak:8080/realms/poc" }
```

**Rationale**:
- Casa com a arquitetura: cliente nunca toca em Keycloak nem em `ms-auth` diretamente — sempre via Kong.
- A rota `/auth` deliberadamente **não** tem o plugin (login não pode exigir token).

**Alternatives considered**:
- Duas portas Kong (8000 público, 8001 interno): adiciona complexidade sem ganho funcional.
- Sub-route por `host:`: aumenta acoplamento ao DNS local.

---

## R12 — Issuer claim que será validado pelo plugin

**Decision**: O plugin valida `iss == http://keycloak:8080/realms/poc` (configurado via `config.issuer`).

**Rationale**:
- Em rede interna do Compose, `http://keycloak:8080` é o `iss` que o Keycloak emitirá quando acessado via `KC_HOSTNAME_URL=http://keycloak:8080`.
- Em produção real, troca-se por `https://auth.empresa.com/realms/poc` — uma linha de configuração.

**Alternatives considered**:
- Não validar `iss`: descartado — viola FR-004 e abre vetor para tokens de outro realm.
- Validar via env var no plugin: viável mas adiciona indireção; configurar diretamente no `kong.yml` é mais explícito.

---

## R13 — Estratégia de teste do plugin Lua

**Decision**: **busted + kong-pongo**. Suítes em `kong/plugins/jwt-keycloak-validator/spec/`.

Cobertura mínima:
- `01-schema_spec.lua`: validação dos campos do schema (defaults, required, one_of).
- `02-jwks_spec.lua`: `fetch()` (sucesso, timeout, body inválido, status != 200) e `find_pem()` (kid existente, kid inexistente, kty != RSA).
- `03-handler_spec.lua`: cenários CA-001..CA-009 com `kong.cache` e `resty.http` mockados; assinaturas RS256 reais geradas via `lua-resty-openssl` em `before_each`.

**Rationale**:
- kong-pongo é o ferramental oficial de testes de plugin Kong, roda em container e isola o Lua/LuaJIT.
- busted é o framework de testes idiomático no ecossistema Lua.

**Alternatives considered**:
- Apenas testes de integração via Newman: insuficiente para cobrir branches do plugin (e.g., cache miss vs hit, fetch error).
- LuaUnit: menos suporte e ecossistema.

---

## R14 — Estratégia de teste E2E e de carga

**Decision**:
- **E2E**: Newman 6.x rodando coleção Postman (`tests/newman/auth-trust-gateway.postman_collection.json`) que cobre CA-001..CA-009 sequencialmente. Executável local (`npx newman run ...`) e em CI.
- **Carga**: k6 0.51+ rodando `tests/k6/load-authenticated-route.js` — 1000 RPS por 60s contra `GET /api/products`, com pré-script que faz login e armazena o token.
- **Caos**: script bash `tests/k6/chaos-msauth-down.sh` que executa `docker compose stop ms-auth` no meio de uma janela de carga para validar US4 / SC-007.

**Rationale**:
- Newman + k6 explicitamente listados no spec.
- Os três artefatos cobrem funcional (Newman), performance (k6) e resiliência (chaos script) sem duplicação.

**Alternatives considered**:
- Karate: alternativa a Newman, mas usuário já está familiarizado com Postman/Newman pelo spec.
- Gatling/JMeter: pesados demais para POC; k6 já entrega percentis e RPS.

---

## R15 — Observabilidade na POC

**Decision**:
- Serviços Spring Boot com **Logback JSON encoder** (`logstash-logback-encoder`) e Spring Boot Actuator (`/actuator/health`, `/actuator/prometheus` via Micrometer + `micrometer-registry-prometheus`).
- Plugin Kong loga via `kong.log.warn/err/info` em pontos chave: cache miss, fetch JWKS (sucesso/falha), falha de validação.
- **Sem stack Prometheus/Grafana subindo na POC** (fica para o item 15 do spec — "próximos passos pós-POC"). Apenas garantir que os endpoints/métricas estejam expostos.

**Rationale**:
- Atende FR-017 e SC-002 (subir em ≤ 60s — adicionar Prometheus+Grafana custaria mais 15–25s e ofuscaria o foco da POC).
- Operadores podem `docker compose up prometheus grafana` em uma evolução posterior sem mexer nos serviços.

**Alternatives considered**:
- Subir Prometheus + Grafana já na POC: explicitamente listado em "próximos passos pós-POC" no spec; respeitar a separação.
- Logs em texto plano: dificulta agregação futura.

---

## Consolidação de NEEDS CLARIFICATION

Nenhum item da Technical Context ficou marcado como `NEEDS CLARIFICATION`. Todas as decisões acima foram derivadas de:

1. Diretivas explícitas do usuário no `/speckit.plan` (Java + Spring Boot, Keycloak, docker-compose latest).
2. Princípios e requisitos do `spec.md` (FR-001..FR-017, SC-001..SC-010).
3. Convenções de mercado / boas práticas (versões LTS, imagens estáveis, frameworks de teste padrão).

---

## Resumo do stack final

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| JVM    | Eclipse Temurin | 25 (LTS) |
| Framework backend | Spring Boot | 4.0.6 |
| Cache local in-process | Caffeine | versão alinhada ao Spring Boot 4.0 |
| Gateway | Kong OSS | 3.9.1 (`kong/kong:3.9.1`) |
| Plugin runtime | Lua / LuaJIT | nativo do Kong |
| Cache do plugin | `kong.cache` (L1 LRU + L2 nginx shared dict) | nativo do Kong |
| IdP | Keycloak | 26.6.1 (`quay.io/keycloak/keycloak:26.6.1`) |
| Orquestração | Docker Compose | v2 |
| Testes unit Java | JUnit 5 + Mockito + AssertJ | versões via Spring Boot BOM |
| Integração Java | Testcontainers (com Keycloak module) | 1.x |
| Testes Lua | busted + kong-pongo | recente |
| E2E | Newman | 6.x |
| Carga | k6 | 0.51+ |
