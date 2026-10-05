# Sleeper Playground

A browser-based explorer for the [Sleeper](https://sleeper.com) fantasy football API, plus an API guide.

- `/` — League Explorer (`explorer/`)
- `/guide.html` — Sleeper API guide

## Run with Docker

```bash
docker compose up -d --build
```

The site is served on port 8080 by default. Pick another host port with `HOST_PORT`:

```bash
HOST_PORT=8090 docker compose up -d --build
```

## Deploy on a VPS

```bash
git clone https://github.com/xxlillusion/sleeper-playground.git
cd sleeper-playground
docker compose up -d --build
```

To update later: `git pull && docker compose up -d --build`.

### Hostinger VPS (Traefik)

`docker-compose.deploy.yml` serves the site at https://fantasy.maybesomething.tech through
the VPS's existing Traefik proxy (no host port is published). On the VPS:

```bash
git clone https://github.com/xxlillusion/sleeper-playground.git /docker/sleeper-playground
cd /docker/sleeper-playground
docker compose -f docker-compose.deploy.yml up -d --build
```

To ship an update: push to `main`, then on the VPS run `git pull` and the compose command again.
