# UI

## Identity

Edu mirrors Fin's v0.3 identity, shifted from navy/blue to a **greener blue** (teal-cyan):

- **Single-page app.** No route navigation: Connectors opens as a right slide-over from the plug icon in the navbar (with connected-count badge). Panel stays mounted; backdrop click closes.
- **Typography:** Space Grotesk (display — brand, section titles), Inter (body), JetBrains Mono (numerals, dates, countdowns). Loaded via next/font.
- **Surfaces:** deep teal-black base `#040e12` with fixed "aurora" cyan radial glows. Main page is **open/borderless** — sections separated by whitespace and small-caps display titles, no container boxes. Glass cards survive only inside the slide-over.
- **Accent:** `#22b8cf` (teal-cyan) with glow shadows on primary actions. Hover shifts to cyan-300/400.
- Semantic colors: red = overdue, accent = due today/actionable, amber = staleness/warnings, emerald = done/connected, zinc = quiet metadata. State never by color alone (icons/labels too).

## Layout (v1.1 redesign, 2026-08-21 — Lucas: less raw, wider, quick-add out of the way)

Container is `max-w-6xl` (matches Fin). Two-column on `lg`: tasks (2/3) + visual sidebar (1/3).

| Section | Contents |
|---|---|
| **Navbar** | "Edu" wordmark (display font, accent dot), **Tasks \| Grades tab toggle** (center, Fin's Invest/Spending pattern — Tasks is everything below; Grades swaps the whole page body), plug icon with connected-count badge |
| **Grades panel** (2026-08-24, compacted same day — Lucas: too extense, more visual) | two-column grid of per-course **tiles**: header (dot + name, `code · N/M avaliados`), big mono headline % (Moodle's own course total when graded, else earned/gradedMax), a **points meter** — one bar, segments in fixed order with 2px surface gaps: *ganho* (course color) · *perdido* (course color at ~35% alpha — a red FAILED the dataviz validator vs warm course hues; same-ramp lightness passes for every course) · *em jogo* (white/8 track) — with a swatch legend of the three point sums, then **graded items only** as rows; ungraded items live behind a `+ N a avaliar` toggle so a course with nothing graded is a 4-line tile, not 15 dim rows |
| **Hero row** | left: big mono count of tasks due in 7 days + chips (overdue red, today accent, done·7d emerald). Center: **week strip** — the next 7 days as large columns, one course-colored dot per pending task that day (exams/quizzes get bigger dots), today on an accent tile; **clicking a day filters the task list to it** (chip with ✕ next to the Tasks title clears; hero/exams/workload stay global). Right: **next test** — `Xd Yh` mono countdown, title, date |
| **Tasks (main col)** | header row holds a **pending \| done segmented switch** (with counts — done view lists completed tasks newest-first, replacing the list rather than piling under it) and a **+ add** toggle that reveals the manual quick-add form on demand (never permanently on screen); the unified list grouped **Overdue / Today / Tomorrow / This week / Later / No due date**; each row: check circle (toggles local done), title, colored course chip, kind tag, due (time only when meaningful), source badge (`submitted`/`graded`), link-out icon. Dismiss hides a synced task for good. |
| **Sidebar** | **Provas & testes** — next 5 upcoming `exam`/`quiz` (45 days) as vertical cards with per-course color edge and countdown; **Workload** — per-course pending bars (course color, sorted by load, all non-hidden courses listed). This IS the course filter (the old chip strip was removed, 2026-08-21): clicking a row filters the whole page to that course — selected row highlighted, others dimmed — and a course-colored ✕ chip appears by the Tasks title; clicking either clears. |

## Course colors

Courses get stable entity colors from `lib/colors.ts` slots (validated dark-surface palette inherited from Fin): `#3987e5`, `#c98500`, `#d55181`, `#199e70`, `#9085e9`, `#d95926`, `#b91d63`, `#008300` — assigned by course id order per account, never reshuffled by rank.

## Principles

- Dates in `pt-BR` habits (`seg., 25 de ago.`, 24 h clock); relative labels ("em 3 d", "2 d atrás") in mono.
- **Freshness is always visible** — the connectors panel shows each account's `last_sync_at`; a failing source shows its error, never a blank page.
- Responsive: usable at 390 px wide (checking tasks off from the phone between classes is the core loop).
- Checking off is optimistic — instant UI, then PATCH; revert on failure.
