# =============================================================================
# Auth Trust Gateway — POC frontend (React + Vite)
# Builds a static bundle and serves it with `vite preview` on :3000.
#
# Usage (from repo root):
#   docker compose --profile frontend up -d --build frontend
#   open http://localhost:3000
# =============================================================================

# ---- builder ---------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src

# Bake the API base URL at build time. Override in compose with build args.
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN npm install --omit=dev --no-audit --no-fund vite@^5.4.11

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./vite.config.ts

EXPOSE 3000

# `vite preview` is intentional: zero-extra-deps static server that respects
# the same SPA fallback rules used in dev. Fine for a POC demo.
CMD ["npx", "--no-install", "vite", "preview", "--host", "0.0.0.0", "--port", "3000", "--outDir", "dist"]
