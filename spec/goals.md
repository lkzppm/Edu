# Goals

## What Edu is

A single dashboard for Lucas's college coursework. Three platforms feed it:

| Platform | How | What it provides |
|---|---|---|
| **Google Classroom** | official REST API, OAuth (read-only scopes) | courses, coursework with due dates, submission state, grades |
| **Moodle UFRJ** | Moodle Web Services REST (`https://moodle.cos.ufrj.br/`) | courses, assignments, quizzes, calendar events (test dates), completion |
| **Polimoodle** | same Moodle connector (`https://moodle.poli.ufrj.br/` — see [connectors.md](connectors.md) on the hostname) | same |

Everything lands in one unified to-do list: what's due, when, for which class, and whether it's already handled. Test/exam dates surface separately with a countdown.

## What Edu is not

- Not a submission tool — strictly **read-only** against the platforms. Marking a task done in Edu never writes back.
- Not multi-user. One student, self-hosted, no auth beyond being on Lucas's machine/Tailscale.
- Not a notes app or file store — it links out to the platform for the actual work.

## Success criteria (v1)

1. Open `localhost:3001` and see, within one screen: everything due this week, anything overdue, and the next test date — across all three platforms.
2. Adding a platform is a connector flow in the UI (like Fin): pick a type, paste credentials / OAuth, done. Demo mode works with zero credentials.
3. A platform being down or a token expiring never blanks the dashboard — last-good data with a visible stale/error state.
4. Checking a task off locally sticks, even after the next sync.
5. Manual to-dos (not from any platform) live in the same list.
