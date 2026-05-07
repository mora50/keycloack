# Feature Specification: Auth Trust Gateway

**Feature Branch**: `001-auth-trust-gateway`  
**Created**: 2026-05-04  
**Status**: Draft  
**Input**: User description: "POC de Auth Trust Gateway — Keycloak em rede interna; ms-auth como BFF de autenticação (login, refresh, proxy do JWKS); Kong validando JWT localmente com JWKS cacheado; microsserviços downstream confiando no `X-User-Id` injetado pelo gateway."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cliente final autentica e acessa microsserviço protegido (Priority: P1)

Um usuário final faz login pelo gateway, recebe um token JWT e usa esse token para acessar uma rota de negócio (por exemplo, `/api/products`). O microsserviço de destino recebe o request já com a identidade do usuário injetada como header confiável (`X-User-Id`), sem precisar validar o token diretamente.

**Why this priority**: É o caminho feliz e o produto mínimo viável da POC. Sem essa fatia funcionando ponta a ponta, nada mais faz sentido. Ela demonstra o coração da proposta: gateway central de autenticação que entrega identidade pronta aos microsserviços.

**Independent Test**: Subir o ambiente, executar `POST /auth/login` com credenciais válidas, usar o token retornado em `GET /api/products`, e verificar (no log do serviço de destino) que o request chegou com `X-User-Id` igual ao claim `sub` do token.

**Acceptance Scenarios**:

1. **Given** um usuário cadastrado no IdP, **When** envia `POST /auth/login` com credenciais corretas, **Then** recebe `200` com `access_token` e `refresh_token` JWT.
2. **Given** um `access_token` válido, **When** faz `GET /api/products` com `Authorization: Bearer <token>`, **Then** o microsserviço de destino recebe o request com `X-User-Id` igual ao claim `sub` do token e responde com sucesso.
3. **Given** um `refresh_token` válido, **When** envia `POST /auth/refresh`, **Then** recebe um novo par `access_token` + `refresh_token`.

---

### User Story 2 - Validação local sem custo por requisição (Priority: P1)

O gateway valida cada JWT localmente, usando uma chave pública previamente cacheada, sem consultar o serviço de autenticação ou o IdP a cada request. Isso elimina a latência adicional de uma chamada de introspecção por requisição e reduz drasticamente a carga no IdP.

**Why this priority**: É a justificativa de existência desta arquitetura. Se cada request tivesse que falar com o `ms-auth` ou com o IdP, o ganho de adotar o gateway desaparece — voltaríamos ao cenário de introspecção remota com custo de um round-trip extra.

**Independent Test**: Com o JWKS já cacheado, disparar 100 requests autenticadas em sequência e verificar (via logs/contadores) que zero novas chamadas saíram do gateway para o `ms-auth` ou para o IdP nessa janela.

**Acceptance Scenarios**:

1. **Given** o JWKS está em cache, **When** 100 requests autenticadas são enviadas em sequência, **Then** zero chamadas saem do gateway para o `ms-auth`.
2. **Given** uma request autenticada é processada com cache hit, **When** a latência adicional do gateway é medida, **Then** o p99 atribuível à validação fica em ≤ 5 ms.

---

### User Story 3 - Anti-spoofing de identidade (Priority: P1)

Um cliente malicioso pode tentar enviar um header `X-User-Id` ou `X-Claim-*` falsificado junto com seu token, na esperança de que algum microsserviço confie nele. O gateway precisa **remover** qualquer header de identidade vindo do cliente **antes** de aplicar a validação, garantindo que o microsserviço só receba dados que comprovadamente saíram do JWT validado.

**Why this priority**: Sem essa garantia, o modelo "Trust Gateway" é furável trivialmente — qualquer cliente poderia se passar por outro usuário. Esta é a invariante de segurança que sustenta toda a arquitetura.

**Independent Test**: Um cliente envia uma request com `Authorization: Bearer <token-do-usuario-A>` e também com `X-User-Id: usuario-B`. Verificar no microsserviço de destino que o `X-User-Id` recebido corresponde ao `sub` de A, nunca ao valor enviado pelo cliente.

**Acceptance Scenarios**:

1. **Given** um cliente envia `X-User-Id: admin` junto com seu próprio token legítimo, **When** o request chega ao upstream, **Then** o `X-User-Id` reflete o `sub` do token, não o valor enviado pelo cliente.
2. **Given** um cliente envia headers `X-Claim-email` ou `X-Claim-preferred_username` arbitrários, **When** o request chega ao upstream, **Then** esses headers refletem apenas claims extraídos do JWT (ou estão ausentes), nunca os valores enviados pelo cliente.
3. **Given** o ambiente está no ar, **When** um cliente final tenta acessar diretamente o IdP a partir da rede pública, **Then** o IdP não está acessível (apenas o gateway alcança o IdP, e somente via rede interna).

---

### User Story 4 - Resiliência quando o serviço de autenticação está fora (Priority: P2)

Mesmo que o `ms-auth` (ou o IdP) fique temporariamente indisponível, requests com tokens cujas chaves já estão em cache continuam sendo validadas e atendidas. Apenas tokens com `kid` desconhecido (por exemplo, emitidos com chave nova durante a indisponibilidade) são rejeitados, e a falha é cacheada por uma janela curta para evitar tempestade de retries.

**Why this priority**: Vantagem operacional importante: o caminho quente sobrevive a falhas no `ms-auth`/IdP por toda a janela de TTL do cache. Sem isso, qualquer indisponibilidade do IdP derruba todas as APIs.

**Independent Test**: Com tráfego em curso e JWKS já cacheado, parar o `ms-auth` e continuar enviando requests com tokens cujo `kid` está em cache. As requests devem continuar sendo atendidas até a expiração do TTL.

**Acceptance Scenarios**:

1. **Given** o JWKS está em cache e o `ms-auth` está fora, **When** o cliente faz request com token cujo `kid` está em cache, **Then** o gateway valida localmente e a request é atendida normalmente.
2. **Given** o `ms-auth` está fora e o `kid` do token não está em cache, **When** o cliente faz request, **Then** o gateway responde `401` indicando que a chave não está disponível, e o erro é cacheado por uma janela curta.

---

### User Story 5 - Rotação de chave transparente (Priority: P2)

Quando o IdP rotaciona sua chave de assinatura e passa a emitir tokens com um novo `kid`, o gateway detecta o `kid` desconhecido na primeira request, refresca o JWKS automaticamente e valida o token novo, sem necessidade de restart ou intervenção manual.

**Why this priority**: Operação real de produção precisa rotacionar chaves periodicamente. Sem suporte transparente, qualquer rotação no IdP exigiria reinício do gateway, o que é inaceitável em ambientes 24/7.

**Independent Test**: Forçar rotação de chave no IdP, gerar um novo token e enviá-lo ao gateway. A primeira request deve disparar refresh do JWKS e ser atendida com sucesso, sem restart.

**Acceptance Scenarios**:

1. **Given** o IdP rotacionou a chave de assinatura e emitiu um token com novo `kid`, **When** chega o primeiro token assinado com o novo `kid`, **Then** o gateway faz refresh do JWKS automaticamente, valida o token e responde com sucesso.
2. **Given** vários tokens com `kid` desconhecido chegam em rajada, **When** o gateway processa essa rajada, **Then** apenas um refresh do JWKS é disparado e os demais aguardam a chave ser populada no cache.

---

### Edge Cases

- Token sem header `kid` → request rejeitada como JWT mal-formado.
- Token com assinatura adulterada (payload modificado, assinatura recalculada com chave incorreta) → request rejeitada.
- Token com `iss` divergente do configurado → request rejeitada.
- Token com `aud` divergente, quando audience está configurada → request rejeitada.
- Token expirado (`exp` no passado) → request rejeitada com motivo claro no corpo.
- Token ainda não válido (`nbf` no futuro) → request rejeitada.
- Request sem header `Authorization` em rota protegida → `401`.
- Header `Authorization` presente mas sem prefixo `Bearer` → `401`.
- `ms-auth` retorna corpo JWKS inválido ou vazio → erro tratado, request rejeitada e erro cacheado por janela curta.
- Relógio do gateway desalinhado com o IdP além da tolerância de skew → tokens podem ser indevidamente rejeitados (assumir NTP sincronizado).
- Cliente envia simultaneamente `Authorization` válido e múltiplos `X-Claim-*` arbitrários → todos os headers de identidade vindos do cliente são removidos antes da injeção feita pelo gateway.
- Refresh do JWKS em curso enquanto chega outra request com o mesmo `kid` desconhecido → segundo request aguarda o resultado em vez de disparar refresh paralelo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o cliente autentique enviando credenciais (`username` + `password`) ao endpoint público `POST /auth/login` exposto pelo gateway, recebendo em resposta um par `access_token` + `refresh_token` JWT.
- **FR-002**: O sistema MUST permitir que o cliente renove sua sessão enviando `POST /auth/refresh` com um `refresh_token` válido, recebendo um novo par de tokens.
- **FR-003**: O gateway MUST validar a assinatura RS256 do JWT em cada request autenticada, usando a chave pública correspondente ao `kid` do token. O algoritmo é configurável dentro da família RSA (RS256/RS384/RS512), com RS256 como default.
- **FR-004**: O gateway MUST validar os claims `exp` (expiração) e `iss` (issuer configurável) de todo JWT recebido, e MUST opcionalmente validar `aud` (audience) e `nbf` (not-before) quando configurados.
- **FR-005**: O gateway MUST obter o JWKS exclusivamente através do `ms-auth`, nunca diretamente do IdP. O cliente final NUNCA recebe URLs do IdP.
- **FR-006**: O gateway MUST cachear chaves públicas por `kid` com TTL configurável (default razoável: 1 hora) e MUST cachear erros de fetch por uma janela negativa separada (default razoável: 30 segundos) para evitar tempestade de retries.
- **FR-007**: Quando o gateway recebe um token com `kid` que não está em cache, ele MUST disparar um refresh do JWKS, garantindo que apenas um refresh seja executado por rajada de tokens com o mesmo `kid` desconhecido.
- **FR-008**: O gateway MUST injetar no request upstream um header `X-User-Id` (nome configurável) contendo o valor do claim `sub` do token (claim de origem configurável).
- **FR-009**: O gateway MUST injetar como headers `X-Claim-{name}` os claims adicionais configurados na lista `forward_claims` (defaults razoáveis: `preferred_username`, `email`).
- **FR-010**: O gateway MUST remover qualquer header `X-User-Id` ou `X-Claim-*` enviado pelo cliente **antes** de extrair claims do token e injetar os headers definitivos. Esta proteção é o default e seu desligamento via configuração só é permitido com aviso explícito; em produção ela é considerada obrigatória.
- **FR-011**: O gateway MUST rejeitar requests com `401` em todos os cenários de falha (token ausente, formato inválido, `kid` indisponível após refresh, assinatura inválida, claim divergente, token expirado, chave indisponível por falha de fetch). O motivo da falha MUST estar incluído no corpo da resposta de forma legível para troubleshooting.
- **FR-012**: O gateway MUST manter cache local em memória das chaves públicas validadas, com TTL configurável, sem dependência de qualquer cache externo. Esta POC opera com cache em-processo apenas; cada nó de gateway mantém seu próprio cache de forma independente.
- **FR-013**: O `ms-auth` MUST expor `GET /auth/jwks` como proxy idempotente do JWKS do IdP, com cache interno de curta duração (~60 segundos) para não martelar o IdP.
- **FR-014**: Os microsserviços downstream MUST consumir exclusivamente o `X-User-Id` (e demais `X-Claim-*`) injetado pelo gateway e NUNCA validar o token diretamente.
- **FR-015**: O IdP MUST permanecer em rede interna, sem qualquer endpoint exposto publicamente. O cliente final só conhece os hosts do gateway.
- **FR-016**: O ambiente completo MUST ser entregue de forma reproduzível por um orquestrador de containers, com realm, cliente OAuth e usuário de exemplo pré-provisionados.
- **FR-017**: O gateway MUST emitir logs estruturados em pelo menos os eventos: cache miss, fetch de JWKS (sucesso e falha) e falha de validação de token. Métricas operacionais MUST estar disponíveis para coleta externa.

### Key Entities

- **Identity Provider (IdP)**: Emissor dos JWTs. Mantém usuários, credenciais e chaves de assinatura. Roda em rede interna, invisível para o cliente final.
- **Authentication BFF (`ms-auth`)**: Único componente que conversa diretamente com o IdP. Expõe endpoints públicos de login, refresh e proxy do JWKS para o gateway. Não armazena estado de usuários nem de sessão.
- **Trust Gateway**: Ponto único de entrada. Roteia tráfego, valida JWTs localmente em cache hit, injeta identidade verificada como header e remove headers de identidade enviados pelo cliente.
- **JWT**: Credencial portátil emitida pelo IdP com assinatura RSA. Possui header (`alg`, `kid`), claims padrão (`iss`, `sub`, `exp`, `nbf`, `aud`) e claims opcionais (`preferred_username`, `email`, etc.).
- **JWKS (JSON Web Key Set)**: Conjunto de chaves públicas do IdP, indexadas por `kid`. Servido pelo `ms-auth` ao gateway. Cacheado por TTL no gateway.
- **Identity Headers**: `X-User-Id` (default, mapeia `sub`) e `X-Claim-{name}` (claims encaminhados). Sempre derivados do JWT validado, jamais confiáveis quando vindos do cliente.
- **Microsserviço downstream**: Consumidor da identidade injetada (ex.: `ms-products`, `ms-payments`, monolito). Lê `X-User-Id` confiando no contrato com o gateway.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma request autenticada com a chave já em cache, o gateway adiciona ≤ 5 ms de latência de validação no p99.
- **SC-002**: O ambiente completo de POC sobe (todos os componentes prontos para receber tráfego) em ≤ 60 segundos a partir de um único comando de orquestração.
- **SC-003**: Em um teste de carga sustentado, o gateway processa ≥ 1000 requisições autenticadas por segundo sem erros, em hardware modesto (laptop de desenvolvimento).
- **SC-004**: Durante uma janela de 100 requests autenticadas consecutivas com o JWKS já cacheado, o número de chamadas que saem do gateway para o `ms-auth` é exatamente zero.
- **SC-005**: 100% das tentativas de spoofing de `X-User-Id` ou `X-Claim-*` enviadas pelo cliente são neutralizadas: o microsserviço downstream nunca observa o valor enviado pelo cliente.
- **SC-006**: Após uma rotação de chave no IdP, o primeiro token emitido com o novo `kid` é validado com sucesso pelo gateway sem restart, com no máximo 1 fetch adicional de JWKS para a rajada inicial.
- **SC-007**: Quando o `ms-auth` está indisponível e existe uma chave válida em cache, 100% das requests com tokens cujo `kid` corresponde à chave cacheada continuam sendo atendidas durante toda a janela de TTL.
- **SC-008**: 100% das falhas de validação retornam `401` com um motivo legível que permite a um operador identificar a causa em ≤ 30 segundos olhando apenas o corpo da resposta.
- **SC-009**: A suíte automatizada cobre os 9 cenários de aceitação principais (login, request autenticada, validação local sem chamada externa, token expirado, assinatura adulterada, header spoofado, rotação de chave, indisponibilidade do `ms-auth` com cache válido, indisponibilidade com cache miss) e roda sem dependências externas.
- **SC-010**: Em ambiente de inspeção de rede a partir do cliente final, nenhum endpoint do IdP é alcançável; 100% do tráfego de autenticação flui pelos hosts do gateway.

## Assumptions

- O cliente final é responsável por gerenciar o ciclo de vida do `access_token` (renovar via `/auth/refresh` antes da expiração); o gateway não faz refresh automático em nome do cliente.
- A POC valida apenas tokens JWT (RS256 inicialmente, com suporte opcional a RS384/RS512); tokens opacos com introspecção remota estão fora de escopo.
- A POC trabalha com um único realm/tenant no IdP; multi-tenant com múltiplos realms simultâneos está fora de escopo.
- A POC roda em rede interna do orquestrador de containers usando HTTP entre componentes; em produção espera-se TLS em todos os hops, e mTLS entre gateway e upstreams é evolução futura, não parte da POC.
- O cache de chaves do gateway é mantido **em memória do processo** apenas; em deployments multi-nó cada nó mantém seu próprio cache (consequência: cada nó paga no máximo um fetch ao `ms-auth` por `kid` por TTL). Cache compartilhado externo entre nós é evolução pós-POC, não parte do escopo atual.
- Autorização fina (RBAC/ABAC, validação de escopos por rota) fica a cargo dos microsserviços downstream ou de um plugin separado; o gateway nesta POC apenas autentica e injeta identidade.
- Tokens DPoP / cert-bound tokens estão fora de escopo desta POC.
- Os clocks dos componentes estão sincronizados via NTP, com tolerância de skew dentro do default do validador de claims.
- A fonte da verdade dos usuários é o IdP; o `ms-auth` não persiste estado de usuários nem de sessão.
- A política de rotação de chaves do IdP é configurada de forma compatível com o TTL de cache escolhido (regra prática: TTL ≤ ½ do intervalo entre rotações).
- O fluxo de login inicial usa grant `password`; o suporte a `authorization_code` (e fluxo Social/OIDC completo) é evolução posterior, não bloqueante para a POC.
