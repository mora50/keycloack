# Implementation Plan: Auth Trust Gateway

**Branch**: `001-auth-trust-gateway` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-auth-trust-gateway/spec.md`

## Summary

POC reproduzível de uma arquitetura **Auth Trust Gateway**:

- **Kong Gateway OSS** valida JWTs **localmente** em cada request (cache hit ⇒ zero round-trip externo).
- **`ms-auth`** (Java + Spring Boot) é o único serviço que conversa com o Keycloak: faz login/refresh e proxy do JWKS.
- **Keycloak 26** roda em rede interna do Docker Compose, sem porta exposta para a internet pública.
- **Microsserviços downstream** (`ms-products`, `ms-payments`, em Java + Spring Boot) confiam no header `X-User-Id` injetado pelo gateway.
- O gateway **remove** qualquer `X-User-Id` ou `X-Claim-*` enviado pelo cliente antes de aplicar a validação (anti-spoofing).

A entrega é um repositório com `docker compose up` único, plugin Kong customizado em Lua (`jwt-keycloak-validator`), três serviços Spring Boot, realm Keycloak pré-provisionado e suíte de testes (Newman + k6).

## Technical Context

**Language/Version**:
- Backend services: **Java 25 (LTS)** com **Spring Boot 4.0.6**
- Plugin Kong: **Lua 5.1** (LuaJIT, runtime do Kong)

**Primary Dependencies**:
- `ms-auth`, `ms-products`, `ms-payments`: Spring Boot Starter Web (MVC sobre Tomcat com virtual threads), Spring Boot Starter Validation, Caffeine (cache local de JWKS no `ms-auth`), Spring Boot HTTP Service Clients (chamada ao token endpoint do Keycloak), JJWT ou Nimbus JOSE+JWT apenas para testes (assinar tokens fake).
- Plugin Kong `jwt-keycloak-validator`: `lua-resty-jwt`, `lua-resty-jwt-validators`, `lua-resty-http`, `lua-resty-openssl`.
- Orquestração: Docker Compose v2.

**Storage**: Nenhum banco persistente é exigido pela feature.
- Keycloak: H2 embarcado em modo dev (`start-dev`) — suficiente para POC.
- `ms-auth`/microsserviços: stateless, sem DB.
- Cache de chaves do gateway: `kong.cache` em-processo (L1 LRU + L2 nginx shared dict). Sem cache externo.

**Testing**:
- Unitários Spring Boot: **JUnit 5 + Spring Boot Test + Mockito + AssertJ**.
- Integração Spring Boot: **Testcontainers** subindo Keycloak real para testar `ms-auth`.
- Plugin Lua: **busted** + **kong-pongo** (mocks de `kong.cache` e `resty.http`).
- E2E Postman: **Newman** rodando coleção que exercita CA-001..CA-009.
- Carga: **k6** com 1000 RPS por 60s contra rota autenticada.

**Target Platform**:
- Docker Compose Linux (amd64 + arm64) — laptops de desenvolvedor (macOS/Linux/Windows com WSL2).
- Imagens base: Eclipse Temurin 25 JRE para os serviços Spring Boot, `kong/kong:3.9.1`, `quay.io/keycloak/keycloak:26.6.1`.

**Project Type**: Multi-service / monorepo (3 serviços Spring Boot + 1 plugin Kong + configuração de orquestração).

**Performance Goals** (do spec):
- Validação local p99 ≤ 5 ms (SC-001).
- ≥ 1000 RPS sustentados (SC-003).
- Zero chamadas externas em janela de 100 requests autenticadas com cache hit (SC-004).
- `docker compose up` ⇒ tudo pronto em ≤ 60 s (SC-002).

**Constraints**:
- Sem dependência de licença Kong Enterprise (apenas OSS).
- Sem chamada do Kong direto ao Keycloak (sempre via `ms-auth`).
- Anti-spoofing obrigatório: gateway remove `X-User-Id`/`X-Claim-*` do cliente antes de aplicar o plugin.
- Keycloak não pode estar acessível pela rede pública do compose (sem `ports:` mapeado para 0.0.0.0; somente bind interno).

**Scale/Scope**:
- POC: 1 nó Kong (default), 1 instância de cada serviço, 1 Keycloak.
- Demo opcional de horizontal scaling: profile `multinode` sobe um segundo nó Kong; cada nó mantém seu próprio cache em-processo (sem coordenação entre nós).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

A constituição do projeto (`.specify/memory/constitution.md`) ainda está com o conteúdo do template (sem princípios concretos ratificados). **Não há gates específicos definidos**. Os gates abaixo são derivados do espírito da feature spec e do bom senso para uma POC e devem ser revisitados quando a constituição for ratificada.

| Gate | Status | Justificativa |
|------|--------|---------------|
| **Simplicidade**: stack mínimo necessário | PASS | 3 serviços Java de mesma stack + 1 plugin Lua (necessário pelo runtime do Kong) + 1 imagem pronta (Keycloak). Nada além disso. Cache em-processo do Kong evita acoplamento a um cache externo. |
| **Reprodutibilidade**: subir tudo via `docker compose up` | PASS | Toda a orquestração em um único `docker-compose.yml` com healthchecks; FR-016 / SC-002. |
| **Sem detalhes vazando do plano para o spec** | PASS | Java/Spring/Lua/imagens ficaram apenas no plano; o spec descreve papéis, não tecnologia. |
| **Test-first de cada cenário do spec** | PASS | Phase 1 entrega contratos para `ms-auth` e o schema do plugin antes da implementação; suíte Newman cobre CA-001..CA-009. |
| **Observabilidade mínima** | PASS | FR-017 exige logs estruturados; plano inclui logs JSON nos serviços e `kong.log.err/info` em pontos chave do plugin. |

**Resultado do gate inicial**: PASS — pode prosseguir para Phase 0.

**Re-check pós Phase 1**: Sem novas violações detectadas durante o desenho de contratos e data model. Decisão de manter o plugin Lua (em vez de mover validação para um sidecar Java) é justificada pelo SC-001 (≤ 5 ms p99 só é alcançável com validação no próprio worker do Kong, sem hop de rede adicional).

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-trust-gateway/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ms-auth.openapi.yaml
│   ├── downstream-service.openapi.yaml
│   ├── kong.yml
│   └── plugin-schema.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
.
├── docker-compose.yml
├── .env.example
├── README.md
│
├── kong/
│   ├── kong.yml                                    # DB-less declarative config
│   └── plugins/
│       └── jwt-keycloak-validator/
│           ├── handler.lua                         # access phase
│           ├── schema.lua                          # config schema
│           ├── jwks.lua                            # fetch + JWK→PEM
│           ├── cache.lua                           # kong.cache lookup + loader
│           └── spec/                               # busted unit tests
│               ├── 01-schema_spec.lua
│               ├── 02-jwks_spec.lua
│               └── 03-handler_spec.lua
│
├── keycloak/
│   ├── realm-export/
│   │   └── poc-realm.json                          # realm `poc`, client `poc-client`, user `alice`
│   └── Dockerfile                                  # opcional (build com realm pré-importado)
│
├── services/
│   ├── ms-auth/
│   │   ├── pom.xml
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── main/java/com/poc/msauth/
│   │       │   ├── MsAuthApplication.java
│   │       │   ├── config/
│   │       │   │   ├── KeycloakProperties.java
│   │       │   │   ├── HttpClientConfig.java       # Spring 4 HTTP service clients
│   │       │   │   └── CacheConfig.java            # Caffeine: jwks (60s)
│   │       │   ├── auth/
│   │       │   │   ├── AuthController.java         # POST /auth/login, /auth/refresh, GET /auth/jwks
│   │       │   │   ├── AuthService.java
│   │       │   │   ├── KeycloakClient.java         # @HttpExchange para token+jwks
│   │       │   │   └── dto/
│   │       │   │       ├── LoginRequest.java
│   │       │   │       ├── RefreshRequest.java
│   │       │   │       ├── TokenResponse.java
│   │       │   │       └── JwksResponse.java
│   │       │   └── error/
│   │       │       └── GlobalExceptionHandler.java
│   │       └── test/java/com/poc/msauth/
│   │           ├── auth/AuthControllerTest.java
│   │           └── integration/AuthFlowIT.java     # Testcontainers + Keycloak
│   │
│   ├── ms-products/
│   │   ├── pom.xml
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── main/java/com/poc/msproducts/
│   │       │   ├── MsProductsApplication.java
│   │       │   └── api/ProductsController.java     # GET /products → echoes X-User-Id
│   │       └── test/java/com/poc/msproducts/
│   │           └── ProductsControllerTest.java
│   │
│   └── ms-payments/
│       ├── pom.xml
│       ├── Dockerfile
│       └── src/
│           ├── main/java/com/poc/mspayments/
│           │   ├── MsPaymentsApplication.java
│           │   └── api/PaymentsController.java     # POST /payments → echoes X-User-Id
│           └── test/java/com/poc/mspayments/
│               └── PaymentsControllerTest.java
│
└── tests/
    ├── newman/
    │   ├── auth-trust-gateway.postman_collection.json
    │   └── env.poc.postman_environment.json
    └── k6/
        ├── load-authenticated-route.js
        └── chaos-msauth-down.sh
```

**Structure Decision**:

- **Monorepo multi-service**, escolhido porque a POC é coesa (todos os componentes coexistem para validar um único contrato arquitetural) e porque o ciclo de feedback do desenvolvedor depende de subir tudo junto via `docker compose`.
- **Plugin Kong fica no diretório `kong/plugins/`** (não dentro de um dos serviços Java) — montado como volume no container do Kong (`KONG_PLUGINS=bundled,jwt-keycloak-validator` + `KONG_LUA_PACKAGE_PATH=/opt/kong/plugins/?.lua;;`).
- **Os três serviços Spring Boot são módulos Maven independentes** (cada um com seu `pom.xml` e `Dockerfile`). Isso evita acoplamento de versões e mantém a possibilidade de extrair qualquer um deles para outro repositório sem reescrita.
- **Tests/** no topo agrupa as suítes E2E (Newman) e de carga (k6) que cruzam todos os serviços; testes unitários e de integração de cada serviço ficam dentro do próprio módulo Maven (`src/test/java`).

## Complexity Tracking

> Nenhuma violação de gate da Constitution Check. Tabela mantida vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
