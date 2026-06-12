# Production image for the Discord Alpha Channel Analytics dashboard.
# Builds the React client, then runs the Express server which (re)builds the
# SQLite DB from server/data/raw/*.json at startup and serves the built client.
FROM node:20-bookworm-slim AS builder

# better-sqlite3 may need to compile on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install --workspaces --include-workspace-root

COPY client/ client/
COPY server/ server/
RUN npm run build

# --- runtime ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/client/package.json client/
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/server server

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# npm start = ingest raw JSON into SQLite, then launch the server
CMD ["npm", "start"]
