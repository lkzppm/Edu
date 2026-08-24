# Connectors

Both connectors implement `sync(session, account)` and are registered in `SYNCERS` (`connectors/__init__.py`). They raise `ConnectorError` with a user-facing message (never containing credentials). `config["demo"] = true` routes the sync to `connectors/demo.py`, which seeds realistic courses/tasks with relative due dates.

## moodle

One connector for any Moodle site. UFRJ (`https://moodle.cos.ufrj.br/`) and Polimoodle (`https://moodle.poli.ufrj.br/`) are UI presets that prefill `base_url`.

> Polimoodle gotcha (2026-08-21): the advertised `polimoodle.poli.ufrj.br` hostname serves a TLS cert valid only for `moodle.poli.ufrj.br` — connecting through it fails cert verification. The preset uses the canonical `moodle.poli.ufrj.br` (same site). Transport errors surface their own message (`Moodle unreachable: …`) so cert/DNS issues are diagnosable from the UI.

**Auth.** Two paths in the connect form:
- paste a **web-service token** directly (Moodle → Preferences → Security keys, "Moodle mobile web service"), or
- enter username + password: the api exchanges them at `POST {base}/login/token.php?service=moodle_mobile_app` and stores **only the token** — the password is never persisted or logged.

`config`: `{base_url, token}`. The connect route validates by calling `core_webservice_get_site_info` before storing (fail fast, and it yields `userid` + `sitename`).

**Calls per sync** (`{base}/webservice/rest/server.php`, `moodlewsrestformat=json`; arrays flattened Moodle-style `key[0]=…`):

| Function | Purpose |
|---|---|
| `core_webservice_get_site_info` | userid, sitename (institution label) |
| `core_enrol_get_users_courses` | course list → upsert Courses. `parse_course_names` untangles code/term/name — sites pack them differently (UFRJ: "COS242 - 2026/2 - Teoria dos Grafos"; Poli: "2026/2 - Sistemas Operacionais - EEL770" with the bare name as shortname) |
| `mod_assign_get_assignments` | assignments: name, intro, `duedate`, cmid → `kind=assignment` |
| `mod_quiz_get_quizzes_by_courses` | quizzes: `timeclose` as due → `kind=quiz` |
| `core_calendar_get_calendar_events` (courseids, last 14 d onward) | course events; `assign`/`quiz` module events skipped as dupes; name matching `prova/exame/exam/test/p1-3/final` → `kind=exam`, else `event` |
| `core_completion_get_activities_completion_status` (per course) | cmid→completed map → marks tasks done at the source; fails soft per course (completion may be disabled) |
| `mod_assign_get_submission_status` (per still-open assignment) | the truth for "did I deliver": completion only tracks manual checkboxes/views (Polimoodle showed submitted work as incomplete, 2026-08-21). `submitted` (own or team submission) → done; graded feedback → `graded`. Assignments already done/dismissed locally are skipped to keep the call count down. |

| `gradereport_user_get_grade_items` (per course) | gradebook → GradeItems: itemtype `mod`/`manual` are items, `course` is the total, `category` skipped; `graderaw` null until graded (verified live on both sites 2026-08-24) |

Not every Moodle enables every function for the mobile service; each block fails soft (logged, skipped) so a restrictive site still yields whatever it exposes.

## classroom

Official REST API, OAuth 2.0 web flow, read-only scopes:
`classroom.courses.readonly` + `classroom.coursework.me.readonly`.

**Flow.** Requires `GOOGLE_CLIENT_ID`/`SECRET` in `.env` (Google Cloud project with the Classroom API enabled, redirect URI `http://localhost:3001/api/connectors/classroom/callback` authorized — the web proxy forwards it to the api). UI hits `GET /connectors/classroom/auth-url` and navigates there; Google redirects to the callback, the api exchanges the code (`access_type=offline&prompt=consent` so a refresh token always comes back), stores `config={refresh_token}`, creates the account and kicks a sync, then returns a tiny HTML page that bounces back to `/`.

**Calls per sync** (`https://classroom.googleapis.com/v1`, paginated):
- `GET /courses?courseStates=ACTIVE`
- `GET /courses/{id}/courseWork` — title, description, `dueDate`+`dueTime` (UTC parts), `alternateLink`, workType (`ASSIGNMENT`→assignment, question types→activity)
- `GET /courses/{id}/courseWork/-/studentSubmissions?userId=me` — state `TURNED_IN`/`RETURNED` → done at source; `assignedGrade`/`maxPoints` → grade fields

Access tokens are fetched per sync from the stored refresh token and never persisted.
