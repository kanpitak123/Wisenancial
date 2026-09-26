# syntax=docker/dockerfile:1
#
# Wisenancial backend: multi-stage image, runs the pending Prisma migrations and then starts
# the API. Works on any container host (Render "Docker" service, Fly.io, plain `docker run`).
#
# Build context is THIS folder (tradingjournal-backend/):
#   docker build -t wisenancial-api .
#
# Run (all values come from the environment, see .env.production.example):
#   docker run -p 3000:3000 --env-file .env.production wisenancial-api
#
# Notes for the hosts:
#   - PORT is read from the environment (Render/Fly set it); the container listens on it.
#   - DIRECT_URL (non-pooled) is required at start-up: `prisma migrate deploy` uses it.
#     Several instances starting at once are safe: Prisma serialises migrations with a lock.
#   - Health check: GET /health (returns 503 while the database is unreachable).
#   - Run ONE instance until the uploads driver is S3-compatible (STORAGE_DRIVER=s3); the
#     default local driver writes to ./uploads inside the container.

ARG NODE_VERSION=22

# ── base: Node 22 + the system libraries Prisma's engine needs ────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ── build: install everything, generate the Prisma client, compile TypeScript ────────────
FROM base AS build
# prisma/schema.prisma must be present before `npm ci`: postinstall runs `prisma generate`
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ── runtime: production dependencies + compiled output only ───────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
# pruning can drop the generated client; regenerating is cheap and keeps the image self-consistent
RUN npx prisma generate \
 && mkdir -p uploads \
 && chown -R node:node /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec form is not used for the shell chain, but `exec` hands PID 1 to node so SIGTERM reaches
# the app (graceful shutdown) instead of stopping at the shell
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
