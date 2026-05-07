# Auth Trust Gateway — POC

Prova de conceito reproduzível de uma arquitetura **Auth Trust Gateway** com:

- **Kong Gateway OSS 3.9.1** validando JWTs **localmente** com plugin Lua custom (`jwt-keycloak-validator`).
- **`ms-auth`** (Java 25 + Spring Boot 4.0.6) — único componente que conversa com o Keycloak (login, refresh, proxy do JWKS).
- **Keycloak 26.6.1** rodando em rede interna do Docker Compose, **sem porta exposta** ao host.
- **Microsserviços downstream** `ms-products` e `ms-payments` que **confiam** no header `X-User-Id` injetado pelo gateway.
- **Anti-spoofing** obrigatório: `X-User-Id`/`X-Claim-*` enviados pelo cliente são removidos antes da validação.

---

## TL;DR

```bash
docker compose up -d --build
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice"}' | jq -r .access_token)

curl -s http://localhost:8000/api/products -H "Authorization: Bearer $TOKEN" | jq
```

Para o passo-a-passo completo (smoke tests, anti-spoofing, rotação de chave, caos), siga **[`specs/001-auth-trust-gateway/quickstart.md`](specs/001-auth-trust-gateway/quickstart.md)**.

---

## Mapa do repositório

```text
.
├── docker-compose.yml          # único entrypoint de orquestração
├── .env.example                # variáveis (copiar para .env)
├── kong/
│   ├── Dockerfile              # Kong + lua-resty-openssl
│   ├── kong.yml                # rotas DB-less (públicas + protegidas) + CORS
│   └── plugins/jwt-keycloak-validator/   # plugin custom em Lua
├── keycloak/
│   ├── Dockerfile              # Keycloak + realm import
│   └── realm-export/poc-realm.json
├── services/
│   ├── ms-auth/                # Spring Boot — login/refresh/jwks
│   ├── ms-products/            # Spring Boot — echo X-User-Id
│   └── ms-payments/            # Spring Boot — echo X-User-Id
├── frontend/                   # React + Vite (demo interativa da POC)
├── tests/
│   ├── newman/                 # E2E Postman/Newman (CA-001..CA-009)
│   └── k6/                     # carga + caos
└── specs/001-auth-trust-gateway/   # spec, plan, contracts, quickstart, tasks
```

## Frontend de demonstração

Frontend React opcional que executa o fluxo completo no navegador (login,
listagem de produtos, criação de pagamento, **teste de anti-spoofing**,
chamada sem token e renovação de token) e mostra o request/response de cada
chamada feita ao Kong.

```bash
# Modo 1 — dev local (hot reload)
cd frontend && npm install && npm run dev
# abrir http://localhost:5173

# Modo 2 — junto da stack via docker compose (perfil opcional)
docker compose --profile frontend up -d --build
# abrir http://localhost:3000
```

Detalhes em [`frontend/README.md`](frontend/README.md). O Kong já vem com
o plugin bundled `cors` habilitado em `kong/kong.yml` para os origins
`http://localhost:5173` (dev) e `http://localhost:3000` (preview).

---

## Documentação por papel

- **Arquitetura e requisitos**: [`specs/001-auth-trust-gateway/spec.md`](specs/001-auth-trust-gateway/spec.md)
- **Plano técnico (stack, versões, decisões)**: [`specs/001-auth-trust-gateway/plan.md`](specs/001-auth-trust-gateway/plan.md)
- **Pesquisa de stack (R1..R15)**: [`specs/001-auth-trust-gateway/research.md`](specs/001-auth-trust-gateway/research.md)
- **Modelo de dados conceitual**: [`specs/001-auth-trust-gateway/data-model.md`](specs/001-auth-trust-gateway/data-model.md)
- **Contratos**: [`specs/001-auth-trust-gateway/contracts/`](specs/001-auth-trust-gateway/contracts/)
- **Quickstart operacional (13 seções)**: [`specs/001-auth-trust-gateway/quickstart.md`](specs/001-auth-trust-gateway/quickstart.md)
- **Plano de tarefas executado**: [`specs/001-auth-trust-gateway/tasks.md`](specs/001-auth-trust-gateway/tasks.md)

---

## Invariantes arquiteturais (NÃO violar)

1. O cliente final **nunca** alcança o Keycloak. O serviço Keycloak NÃO tem `ports:` mapeado (FR-015 / SC-010).
2. O Kong **sempre** roda `jwt-keycloak-validator` com `strip_client_headers: true` em toda rota protegida (FR-010 / SC-005).
3. Microsserviços downstream **nunca** validam JWTs. Confiam apenas no `X-User-Id` injetado pelo Kong (FR-014).
4. O plugin Kong **nunca** chama o Keycloak diretamente — apenas `http://ms-auth:8080/auth/jwks` (FR-005).

---

## Comandos úteis

```bash
docker compose up -d --build                     # stack completa (≤60s)
docker compose --profile multinode up -d --build # 2 nós Kong (8000 + 8001)
docker compose --profile frontend up -d --build  # + frontend React (3000)
docker compose down -v                           # tear down + reset

./mvnw -pl services/ms-auth test             # testes (per service)
docker compose exec kong /usr/local/bin/pongo run   # busted suite
npx newman run tests/newman/auth-trust-gateway.postman_collection.json \
  -e tests/newman/env.poc.postman_environment.json --bail
```
