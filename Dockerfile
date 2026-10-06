# Stage 1: build the League Data app (React + Vite + Perspective) so the host needs no Node
FROM node:22-alpine AS league-build
WORKDIR /src/league
COPY league/package.json league/package-lock.json ./
RUN npm ci
COPY league/ ./
RUN npm run build

# Stage 2: static site. The explorer and the league page both call the Sleeper API from the browser, so nginx only serves files
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY explorer/ /usr/share/nginx/html/
COPY sleeper-api-guide.html /usr/share/nginx/html/guide.html
COPY --from=league-build /src/league/dist /usr/share/nginx/html/league/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
