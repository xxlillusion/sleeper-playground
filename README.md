# Sleeper Playground

A browser-based explorer for the [Sleeper](https://sleeper.com) fantasy football API, plus an API guide and a pivot-table page for a league's full history.

- `/` — League Explorer (`explorer/`): the guided walk from username to league, with curated tabs. Plain HTML and JS, no build.
- `/guide.html` — Sleeper API guide
- `/league/?id=<league_id>` — League Data (`league/`): every season of one league, loaded by league id, as flat tables you can group, filter, chart and export. React + Vite + TypeScript with [Perspective](https://github.com/perspective-dev/perspective) for the pivots and charts.

Both pages call `api.sleeper.app` straight from the browser and share one IndexedDB cache of finished seasons, so a season loaded on either page is instant on the other.

## League Data

Datasets, one tab each: **Teams** (standings per season with luck, all-play and final rank), **Games**, **Weekly scores**, **Managers** (all-time per Sleeper account), **Seasons**, **Player weeks** (starters and bench with points), **Transactions**, **Draft picks**, **Brackets** and **Scoring rules**. Every table carries `season`, `manager` and `team` on each row so pivots never need joins. The "Quick view" menu has starter pivots and charts for each dataset; anything you build is remembered per league and dataset in your browser. Export gives CSV or JSON of the current view or the whole dataset.

If the history looks short, the commissioner probably created a new league one year instead of renewing. Open **Options** and add that older season's league id to stitch it on.

## Develop

```bash
cd league && npm install && npm run dev
```

Then open `http://localhost:5173/league/?id=<league_id>`. The explorer needs no tooling: serve the `explorer/` folder with any static server, for example `python3 -m http.server 8765 --directory explorer`.

## Run with Docker

```bash
docker compose up -d --build
```

The image builds the league page itself (Node runs inside the build stage), so the host only needs Docker. The site is served on port 8080 by default. Pick another host port with `HOST_PORT`:

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

To ship an update: push to `main`, then on the VPS run `git pull` and the compose command again. The Vite build in the image needs roughly 1 GB of memory; on a very small VPS build the image elsewhere and push it instead.
