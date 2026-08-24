# Edu — personal education center

Self-hosted dashboard for Lucas's college classes: Google Classroom, Moodle UFRJ and Polimoodle in one place — unified to-do list, due dates and test dates. FastAPI + Postgres + Next.js, run with Docker Compose. Single user.

## Rules

1. Read the relevant `spec/` file before working on an area; update it in the same commit when a decision changes.
2. Timestamps are stored UTC (`DateTime(timezone=True)`); converted to `America/Sao_Paulo` only at display.
3. Platform-specific logic lives only in `apps/api/edu/connectors/` — everything else consumes the unified schema.
4. A failing source degrades to last-good data with visible staleness; it never breaks the dashboard.
5. Secrets only via git-ignored `.env` (`.env.example` kept current). Never log tokens, passwords or OAuth codes.
6. Edu is strictly read-only against the platforms. Local task status (done/dismissed) is Edu-only and is never clobbered by a sync.
7. UI: dark theme, teal-cyan accents (Fin's identity shifted to a greener blue), dates in `pt-BR` habits.
8. Conventional commits, small and scoped.

## Ports

Runs beside Fin: api on **8001**, web on **3001** (Fin owns 8000/3000).

## Specs

| File | What's in it |
|---|---|
| [spec/goals.md](spec/goals.md) | What Edu is/isn't, the three platforms, success criteria |
| [spec/architecture.md](spec/architecture.md) | System diagram, containers, stack, sync cadence, repo layout |
| [spec/connectors.md](spec/connectors.md) | Moodle + Google Classroom integration specs and API notes |
| [spec/data-model.md](spec/data-model.md) | Unified schema (Account → Course → Task) and status rules |
| [spec/standards.md](spec/standards.md) | Code style, testing, git/config conventions |
| [spec/ui.md](spec/ui.md) | Dark/teal theme, dashboard layout, UX principles |
| [spec/roadmap.md](spec/roadmap.md) | Phased plan and current status |
