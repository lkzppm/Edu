# Data model

Three tables, strictly layered: **Account** (a connector instance) → **Course** → **Task**. Everything downstream of connectors consumes only this.

## Account

One row per connected platform instance (`connector`: `moodle` | `classroom` | `compasso`; several Moodle sites are several rows). Carries `display_name` (auto-uniquified "Moodle UFRJ (2)"), `base_url` (Moodle), `config` JSON (token / refresh_token — never logged), and sync health: `sync_status` (`never|syncing|ok|error`), `last_sync_at`, `last_error`.

## Course

`(account_id, external_id)` unique. `name`, `code` (short name), `url` (deep link to the course on its platform), `hidden` (user toggle — hidden courses drop out of the dashboard but keep syncing).

## Task

The unified unit — assignment, quiz, exam, calendar event, or manual to-do.

| Field | Notes |
|---|---|
| `course_id` | nullable — manual tasks may be course-less |
| `external_id` | e.g. `assign:123`, `quiz:45`, `cw:abc`, `event:9`; null for manual. Unique per course. |
| `kind` | `assignment` \| `quiz` \| `exam` \| `event` \| `activity` \| `manual` |
| `title`, `description`, `url` | description is plain text, HTML stripped, capped |
| `due_at` | UTC; null = no due date |
| `source_status` | what the platform says (`submitted`, `graded`, `completed`…), display-only |
| `grade`, `max_grade` | Numeric, from Classroom submissions when present |
| `status` | **local** to-do state: `todo` \| `done` \| `dismissed` |
| `completed_at`, `synced_at`, `created_at` | |

## GradeItem

One gradebook entry per row, `(course_id, external_id)` unique (`gi:<id>` from Moodle, `cw:<id>` from Classroom). `name`, `kind` (`item` | `total`), `grade` (null until graded), `max_grade`, `graded_at` (Moodle `gradedategraded`; Classroom submission `updateTime` when graded), `url` (deep link — `mod/{module}/view.php?id={cmid}` / `alternateLink`), `updated_at`. **No local state** — unlike tasks, sync fully replaces a course's grade items (upsert + delete missing), since gradebooks get restructured freely.

## Status rules (the important part)

1. Sync **upserts** by `(course, external_id)`: title/description/due/url/source fields refresh every sync.
2. Local `status` is never overwritten by sync, with one exception: if the source reports the work completed/submitted and the task is still `todo`, it auto-flips to `done`.
3. A task done in Edu but not at the source **stays done** (work may be handled off-platform).
4. Synced tasks that disappear at the source are kept (platforms hide old items); `dismissed` is the user's delete for synced tasks. Manual tasks can be hard-deleted.
5. All datetimes stored UTC; Moodle epochs and Classroom date/time parts converted at the connector boundary.

## SemesterClass & WorkItem (cowork mirrors, 2026-08-26)

`semester_classes` — the canonical class registry, one row per `CONTEXT.md` frontmatter (`code` unique): name, semester, turma, credits, kind, period, `anchor`, `flags`, professor, contact, evaluation, platform, `platform_url`, `links` JSON, `schedule` JSON (`{day,start,end,room}`), workspace_path. `work_items` — one row per `listas/AAAA-MM-DD_Slug/` folder: class_code, date, slug, title, path, files, has_pdf. Both are **pure filesystem mirrors** — sync fully replaces them, no local state.

`courses.class_code` (nullable) links each platform course to its canonical class, re-derived on every cowork sync (code match, else normalized platform-URL match). The degree plan is **not** in the DB: `apps/api/edu/data/degree_plan.yml` is the editable source of truth, served (with computed summary) by `GET /college`.
