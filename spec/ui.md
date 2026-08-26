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
| **Navbar** | "Edu" wordmark (display font, accent dot), **Tasks \| Grades tab toggle** (center, Fin's Invest/Spending pattern — each tab swaps the whole page body; a separate Tests tab existed for a day on 2026-08-26 and was folded back into the planner), plug icon with connected-count badge |
| **Grades panel** (2026-08-24, compacted same day — Lucas: too extense, more visual) | two-column grid of per-course **tiles**: header (dot + name, `code · N/M avaliados`), big mono headline % (Moodle's own course total when graded, else earned/gradedMax), a **points meter** — one bar, segments in fixed order with 2px surface gaps: *ganho* (course color) · *perdido* (course color at ~35% alpha — a red FAILED the dataviz validator vs warm course hues; same-ramp lightness passes for every course) · *em jogo* (white/8 track) — with a swatch legend of the three point sums, then **graded items only** as rows; ungraded items live behind a `+ N a avaliar` toggle so a course with nothing graded is a 4-line tile, not 15 dim rows |
| **Hero row** | left: big mono count of tasks due in 7 days + chips (overdue red, today accent, done·7d emerald). Center: the **planner** (below). Right: **next test** — `Xd Yh` mono countdown, title, date |
| **Planner** (2026-08-26 — Lucas: one 3-in-1 component instead of a Tests tab + Schedule section) | `Planner` in `components/overview.tsx`, a **week \| month \| chart** segmented switch over one slot, all three driving the **same day filter** (click a day/cluster → task list filters; ✕ chip by the Tasks title clears): **week** — the original 7-day strip, course-colored dots (◆ bigger for tests), today on an accent tile; **month** — browsable ‹ › month grid, same dots (≤3 + "+"), out-of-month days dimmed; **chart** — the six-week per-class timeline (`components/timeline.tsx`): one lane per class with pending work (plus "personal"), −7d…+42d, weekly hairline ticks, ● task / ◆ test marks, accent today-line, selected day as an accent band. Follows the course filter. |
| **Tasks (main col)** | header row holds a **pending \| done segmented switch** (with counts — done view lists completed tasks newest-first, replacing the list rather than piling under it) and a **+ add** toggle that reveals the manual quick-add form on demand (never permanently on screen); the unified list grouped **Overdue / Today / Tomorrow / This week / Later / No due date**; **Later and No due date start collapsed** when >3 items (2026-08-26 — the far horizon was tripling the page): one compact row of course-colored marks + date range, click (or the "show" toggle) expands; each row: check circle (toggles local done), title, colored course chip, kind tag, due (time only when meaningful), source badge (`submitted`/`graded`), link-out icon. Dismiss hides a synced task for good. |
| **Sidebar** | **Workload** — per-course pending bars (course color, sorted by load, all non-hidden courses listed). This IS the course filter (the old chip strip was removed, 2026-08-21): clicking a row filters the whole page to that course — selected row highlighted, others dimmed — and a course-colored ✕ chip appears by the Tasks title; clicking either clears. (The tests strip is gone, 2026-08-26 — test dates live in the planner's chart/calendar and the next-test hero.) |

## Course colors

Courses get stable entity colors from `lib/colors.ts` slots (validated dark-surface palette inherited from Fin): `#3987e5`, `#c98500`, `#d55181`, `#199e70`, `#9085e9`, `#d95926`, `#b91d63`, `#008300` — assigned by course id order per account, never reshuffled by rank.

## Principles

- **All copy and dates in English** (2026-08-26 — Lucas; was pt-BR): `Mon, Aug 25`, 24 h clock kept for compact mono chips; relative labels ("in 3 d", "2 d ago") in mono.
- Timeline marks: kind never by color alone — ◆ diamond = exam/quiz, ● circle = other work; lanes are directly labeled with dot + course code, so no legend box.
- **Freshness is always visible** — the connectors panel shows each account's `last_sync_at`; a failing source shows its error, never a blank page.
- Responsive: usable at 390 px wide (checking tasks off from the phone between classes is the core loop).
- Checking off is optimistic — instant UI, then PATCH; revert on failure.
