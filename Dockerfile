# Lovewall: production image (Next.js standalone output).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
# APP_URL is read again at runtime; this only fills the static pages (landing, sitemap) at build time.
ARG APP_URL=http://localhost:3000
ENV APP_URL=$APP_URL
# Also build-time: the landing page's footer links to the legal pages only when they are on (see .env.example).
ARG LEGAL_PAGES=
ENV LEGAL_PAGES=$LEGAL_PAGES
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S lovewall && adduser -S lovewall -G lovewall
COPY --from=build --chown=lovewall:lovewall /app/.next/standalone ./
COPY --from=build --chown=lovewall:lovewall /app/.next/static ./.next/static
COPY --from=build --chown=lovewall:lovewall /app/public ./public
COPY --from=build --chown=lovewall:lovewall /app/db ./db
COPY --from=build --chown=lovewall:lovewall /app/scripts ./scripts
COPY --from=build --chown=lovewall:lovewall /app/assets ./assets
USER lovewall
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Migrations are idempotent; storage setup creates the bucket if it's missing.
CMD ["sh", "-c", "node scripts/migrate.mjs && (node scripts/setup-storage.mjs || true) && node --require ./scripts/client-ip.cjs server.js"]
