# Roadmap

## v1 — read-only aggregator (current)

- [x] Repo scaffold mirroring Fin (compose, spec, api, web)
- [x] Unified schema: Account → Course → Task with local-status rules
- [x] `moodle` connector (UFRJ + Polimoodle presets, token or user/pass → token)
- [x] `classroom` connector (OAuth web flow, coursework + submissions)
- [x] Demo mode per connector (zero-credential seeded data)
- [x] Scheduler: 3 h syncs + 10 min self-healing catch-up
- [x] Dashboard: week hero, next-test countdown, course filter, grouped task list, manual quick-add
- [ ] Real-credential shakedown against moodle.cos.ufrj.br and polimoodle (needs Lucas's tokens)
- [ ] Google Cloud project + OAuth consent screen (needs Lucas's Google account)

- [x] Grades tab (2026-08-24): Moodle gradebook + Classroom graded coursework → per-course grade cards

## v2 — ideas (not committed)

- Announcements feed (Classroom announcements, Moodle forum posts)
- Weekly digest notification (email or ntfy) — "what's due this week", Sunday evening
- ICS export of due dates/tests for Google Calendar
- Edu agent (Claude) like Fin's: "what should I do first today?"

## Notes

- 2026-08-21: project started; identity = Fin shifted to teal-cyan per Lucas's ask ("greener blue").
