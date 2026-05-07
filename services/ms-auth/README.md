# `ms-auth` — Authentication BFF

Spring Boot 4.0.6 (Java 25). Único componente da arquitetura que conversa com o Keycloak (FR-005, FR-013).

## Endpoints

OpenAPI source of truth: [`specs/001-auth-trust-gateway/contracts/ms-auth.openapi.yaml`](../../specs/001-auth-trust-gateway/contracts/ms-auth.openapi.yaml).

| Method | Path | Descrição |
|--------|------|-----------|
| POST   | `/auth/login`     | grant_type=password against Keycloak |
| POST   | `/auth/refresh`   | grant_type=refresh_token against Keycloak |
| GET    | `/auth/jwks`      | JWKS proxy (Caffeine cache 60s; serves stale on Keycloak outage) |
| GET    | `/actuator/health` | liveness/readiness |
| GET    | `/actuator/prometheus` | Micrometer metrics |

## Configuração

Variáveis (defaults entre parênteses):

| Variável | Default | Notas |
|----------|---------|-------|
| `KC_HOSTNAME_URL`               | `http://keycloak:8080` | Base URL do Keycloak |
| `MS_AUTH_KEYCLOAK_REALM`        | `poc` | |
| `MS_AUTH_KEYCLOAK_CLIENT_ID`    | `poc-client` | Client público |
| `ms-auth.http.connect-timeout-ms` | `1000` | RestClient connect timeout |
| `ms-auth.http.read-timeout-ms`    | `3000` | RestClient read timeout |

## Build / test

```bash
./mvnw -pl services/ms-auth test
./mvnw -pl services/ms-auth spring-boot:run
```

## Observabilidade

Logs estruturados via Logback + LogstashEncoder (JSON em stdout). Prometheus em `/actuator/prometheus`.
