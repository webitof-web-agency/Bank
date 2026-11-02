# Frontend image, built by GitHub Actions (.github/workflows/frontend-image.yml)
# and only pulled by Dokploy. Stage 1 runs `vite build`; stage 2 serves the
# static files with nginx on port 80.
#
# VITE_API_URL is baked into the bundle at build time (Vite replaces
# import.meta.env.VITE_API_URL), so it is a build argument, not a runtime
# environment variable: changing the API address needs a new image.

FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
ARG VITE_API_URL=https://api.thriftrpr.in/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
