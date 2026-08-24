# Standards

## Python (apps/api)

- Python 3.12, type hints everywhere, Pydantic v2 models at the API boundary.
- Lint + format: **ruff** (`ruff check` and `ruff format` must pass).
- SQLAlchemy 2.0 style (typed `Mapped[]`, no legacy Query API).
- Platform-specific logic lives **only** under `edu/connectors/`. If a route or service mentions Moodle or Classroom by name, it's in the wrong place (the connectors routes wire forms to connectors — that's the boundary).
- Errors: connectors raise `ConnectorError` with user-facing messages; jobs catch, record staleness, and never crash the scheduler.
- Datetimes: timezone-aware UTC in Python and Postgres. Naive datetimes fail review.

## TypeScript (apps/web)

- Next.js App Router, `strict: true`, no `any` without a comment explaining why.
- Client components only where interactivity requires (this dashboard is interactive — the page shell is client, but keep leaf components dumb).
- Styling via Tailwind tokens — no ad-hoc hex colors outside the theme (see [ui.md](ui.md)); course colors only from `lib/colors.ts`.
- Date formatting through the shared `lib/format.ts` utils — `pt-BR` locale.

## Testing

- pytest for the api. Connector parsing is unit-tested against **recorded fixtures** (`tests/fixtures/*.json`) — tests never call live APIs; connectors expose pure `_rows`-style parse functions for exactly this.
- Task upsert/status rules ([data-model.md](data-model.md)) get explicit tests — the "local done survives sync" rule is the one that must never regress.

## Git & config

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`…), small and scoped. Lucas's `/commit` skill applies.
- Secrets only via `.env` (git-ignored); `.env.example` updated in the same commit that adds a variable. Config through pydantic-settings — no scattered `os.environ`.
- Never log tokens, passwords, OAuth codes or refresh tokens.
- Update the relevant `spec/*.md` in the same commit when a decision changes.
