# Our Museum — production images (see docs/DEPLOYMENT.md).
#
#   docker build --target web      -t our-museum-web .
#   docker build --target realtime -t our-museum-realtime .
#   docker build --target tools    -t our-museum-tools .   # migrations / seed
#
# The build needs no secrets and none end up in an image: every value is
# provided to the containers at runtime.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- dependencies (postinstall runs `prisma generate`) ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build -------------------------------------------------------------------
FROM deps AS builder
COPY . .
# NEXT_PUBLIC_ENABLE_TEST_HOOKS is deliberately absent: test hooks stay off.
ENV NEXT_OUTPUT=standalone
RUN npm run build && npm run realtime:build

# ---- migrations and seed (one-off jobs) ---------------------------------------
FROM builder AS tools
# The seed writes sample photos into the shared storage volume; owning it as
# `node` (like the web image) keeps it writable for uploads afterwards.
ENV STORAGE_LOCAL_DIR=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- realtime service: one bundled file, no node_modules ----------------------
FROM ${NODE_IMAGE} AS realtime
WORKDIR /app
ENV NODE_ENV=production REALTIME_PORT=4001
COPY --from=builder /app/dist/realtime/server.mjs ./realtime/server.mjs
USER node
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.REALTIME_PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "realtime/server.mjs"]

# ---- web app: Next.js standalone server ----------------------------------------
FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
