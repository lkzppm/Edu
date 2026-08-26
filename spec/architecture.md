# Architecture

## System shape

```
Google OAuth ─────▶ classroom connector ──▶ Google Classroom API (read-only)
Moodle token ─────▶ moodle connector ─────▶ moodle.cos.ufrj.br  (WS REST)
Moodle token ─────▶ moodle connector ─────▶ moodle.poli.ufrj.br (Polimoodle)
page URL ─────────▶ compasso connector ───▶ compasso.ufrj.br page + public Google Sheet CSV
                          │
                          ▼
             ┌─────────────────────────┐
             │  api (FastAPI + jobs)   │
             │  unified schema         │
             │  Postgres               │
             └───────────┬─────────────┘
                         ▼
                  web (Next.js)
                  dark/teal UI
```

The backend owns all data and computation. The frontend only reads the API. Connectors are the only code that knows the platforms exist; everything else consumes the unified schema ([data-model.md](data-model.md)). One `moodle` connector serves any Moodle site — UFRJ and Poli are just presets with different `base_url`.

## Containers (Docker Compose)

| Service | Image/build | Port | Role |
|---|---|---|---|
| `db` | `postgres:16` | 5432 (internal) | storage, volume-backed |
| `api` | `./apps/api` | **8001**→8000 | FastAPI + APScheduler sync jobs (in-process; no Celery — single user) |
| `web` | `./apps/web` | **3001**→3000 | Next.js dashboard; proxies `/api/*`→api |

Ports 8001/3001 so Edu runs beside Fin (8000/3000). `docker compose up` is the only way Edu runs. Secrets exclusively from a git-ignored `.env` (template: `.env.example`).

**Pretty URL**: the standalone Gateway project (`~/Desktop/Code/Gateway`, Caddy on port 80) serves Edu at **http://edu.localhost** (and Fin at fin.localhost) by proxying the host ports. Google OAuth keeps its redirect on `http://localhost:3001/...` — Google rejects non-public TLDs — and the callback bounces to `WEB_ORIGIN` (http://edu.localhost) afterwards.

## Stack

- **api**: Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, APScheduler, httpx.
- **web**: Next.js (App Router), TypeScript strict, Tailwind.
- **db**: Postgres 16.

## Sync cadence (APScheduler)

| Job | Schedule | Notes |
|---|---|---|
| Moodle accounts | every 3 h + on-demand | WS REST is cheap; assignments/quizzes/calendar per sync |
| Classroom accounts | every 3 h + on-demand | refresh-token flow; a revoked token fails soft with a visible error |
| Catch-up | every 10 min + at boot | self-healing: syncs any account older than 6 h — covers crons missed while the host slept. Boot also resets accounts stuck in `syncing`. |
| Page open | `POST /connectors/refresh` fired by the web app on mount | syncs any account older than **15 min** in the background (gate keeps repeated opens from hammering the platforms); the UI fast-polls while syncing, so fresh data lands seconds after opening. Manual per-account sync stays available in the connectors panel but is never required. |
