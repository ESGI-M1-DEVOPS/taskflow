# syntax=docker/dockerfile:1

# --- Étape 1 : dépendances de production uniquement ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Étape 2 : image finale minimale, utilisateur non-root ---
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Version injectée par la CI (SHA du commit) : visible dans /api/version et les logs.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# UID numérique (= utilisateur "node") : Kubernetes peut vérifier runAsNonRoot.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]
