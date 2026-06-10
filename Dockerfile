# ─── Stage 1: Dependencies ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Production image ───────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Instalar curl para healthcheck
RUN apk add --no-cache curl

# Copiar dependencias desde stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Usuario no-root para seguridad
RUN addgroup -S atomtask && adduser -S atomtask -G atomtask
USER atomtask

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/login || exit 1

CMD ["node", "server.js"]
