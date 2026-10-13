# Backend image for Dokploy (Build Type: Dockerfile, build path: backend).
#
# Same as the Railpack build it replaces (Node 24 on Debian 12, npm, `node
# server.js`), plus the PostgreSQL 18 client tools: the database backups
# (Settings -> Storage Providers -> Google Drive, Settings -> Backup) run
# pg_dump, whose major version must be at least the server's (postgres:18).
# Debian's own repository only has pg_dump 15, so it comes from the official
# PostgreSQL apt repository (apt.postgresql.org).
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-18 \
  && apt-get purge -y curl gnupg \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PG_DUMP_PATH=/usr/lib/postgresql/18/bin/pg_dump

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Runs as the unprivileged "node" user that the base image provides; the
# uploads folder (local storage provider) must be writable by it.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 8001
CMD ["node", "server.js"]
