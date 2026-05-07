# Auth Trust Gateway — Frontend

React + Vite + TypeScript + TailwindCSS. Frontend interativo que demonstra o
fluxo completo da POC, conversando exclusivamente com o **Kong** (porta 8000).

Não é uma SPA "de produção" — é uma ferramenta de demo para a banca:

- Faz login em `POST /auth/login` (via ms-auth atrás do Kong).
- Decodifica o `access_token` e exibe header/claims/exp no painel.
- Renova o token com `POST /auth/refresh`.
- Chama `GET /api/products` e `POST /api/payments` (rotas protegidas).
- Tenta o **ataque de spoofing** enviando `X-User-Id: attacker-…` e mostra
  que o backend recebeu o `sub` real (FR-010 / SC-005).
- Tenta sem token e mostra o `401` retornado pelo plugin Lua.
- Histórico completo de todas as requisições (headers + bodies).

## Pré-requisitos

A stack do compose precisa estar de pé:

```bash
docker compose up -d --build
```

E o Kong precisa estar com CORS habilitado (já está, em `kong/kong.yml`).

## Modo 1 — Dev local (Vite)

```bash
cd frontend
npm install
npm run dev
# abrir http://localhost:5173
```

A `VITE_API_BASE` padrão aponta para `http://localhost:8000`. Se você quiser
usar o proxy do Vite (sem CORS), aponte o cliente para `/api-proxy` editando
`src/api/client.ts` ou definindo `VITE_API_BASE=/api-proxy`.

## Modo 2 — Container (perfil `frontend` do compose)

```bash
docker compose --profile frontend up -d --build frontend
# abrir http://localhost:3000
```

O Dockerfile faz multi-stage: build com `npm run build` e runtime com
`vite preview` na porta 3000. A URL da API é fixada em build-time pelo
`VITE_API_BASE` (default `http://localhost:8000`).

## Variáveis de ambiente

| Var              | Default                  | Onde é lida           |
| ---------------- | ------------------------ | --------------------- |
| `VITE_API_BASE`  | `http://localhost:8000`  | `src/api/client.ts`   |

## Estrutura

```text
frontend/
├── index.html
├── vite.config.ts          # dev proxy /api-proxy → :8000
├── tailwind.config.js
├── Dockerfile              # builder + runtime (vite preview)
└── src/
    ├── App.tsx             # fluxo principal (login → demos → log)
    ├── api/client.ts       # fetch wrapper que registra cada chamada
    ├── components/
    │   ├── LoginCard.tsx
    │   ├── TokenCard.tsx           # exibe sub, exp, claims, header decodificado
    │   ├── ProductsDemo.tsx        # GET /api/products
    │   ├── PaymentsDemo.tsx        # POST /api/payments
    │   ├── AntiSpoofingDemo.tsx    # injeta X-User-Id falso e prova que é descartado
    │   ├── UnauthDemo.tsx          # chama sem Authorization → 401
    │   ├── ArchitectureDiagram.tsx
    │   ├── RequestLog.tsx          # log estilo DevTools de todas as chamadas
    │   ├── DemoCard.tsx
    │   ├── JsonBlock.tsx
    │   └── StatusPill.tsx
    ├── utils/jwt.ts        # decoder client-side (sem verificação de assinatura)
    ├── types.ts
    └── styles.css          # Tailwind + helpers .card / .btn-* / .pill-*
```

## Notas

- O decoder de JWT é puramente cosmético — **não** valida assinatura. Só Kong faz isso.
- O token fica em `sessionStorage` (`atg.tokens`) e some quando você fecha a aba.
- O log mantém só os 50 registros mais recentes para não estourar a memória.
