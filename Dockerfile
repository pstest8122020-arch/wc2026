# Production Dockerfile for Jupiter Community Predictor Challenge
# Node 20 LTS — better-sqlite3 has prebuilt arm64/x64 binaries for it.

FROM node:20-bookworm-slim AS builder

# better-sqlite3 sometimes needs to build from source on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace package files first so layer caching works
COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm install --workspaces --include-workspace-root

# Now copy the source
COPY client/ client/
COPY server/ server/

# Build the React client into client/dist
RUN npm run build

# --- Runtime image ---
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/package.json ./
COPY --from=builder /app/client/package.json client/
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/server server

ENV NODE_ENV=production
ENV PORT=3001
# DB lives on the persistent volume mounted at /data
ENV DB_PATH=/data/wc2026.db

EXPOSE 3001

CMD ["npm", "start"]
