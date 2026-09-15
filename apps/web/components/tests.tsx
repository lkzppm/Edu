"use client";

import { useMemo, useState } from "react";
import { dayKey } from "@/components/overview";
import { CalendarIcon, CloseIcon, LinkOutIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtCountdown, fmtDue, fmtRelative } from "@/lib/format";
import { Course, SemClass, Task } from "@/lib/types";

/** A test is an `exam` task — Moodle quizzes are weekly graded work and stay
 * in Tasks (2026-09-14, Lucas: tests and to-dos are not the same thing). */
export function isTest(task: Task): boolean {
  return task.kind === "exam";
}

export function upcomingTests(tasks: Task[]): Task[] {
  const now = Date.now();
  return tasks
    .filter(
      (t) =>
        isTest(t) &&
        t.status !== "dismissed" &&
        t.due_at != null &&
        new Date(t.due_at).getTime() >= now,
    )
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
}

// The registry's grading line, when it already says the class has no tests
// (pt-BR CONTEXT.md prose) — surfaced as a hint next to the toggle.
const NO_TESTS_RE = /sem prova|n[ãa]o (tem|h[áa]) prova|no (tests?|exams?)/i;

function Diamond({ color, className = "h-2.5 w-2.5" }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rotate-45 rounded-[2px] ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}

/** Sidebar: one row per class — dot, code/name, next test at a glance — IS
 * the class filter. Classes graded without tests sit in their own group at
 * the bottom, dimmed, showing the grading line instead of dates. */
function ClassNav({
  courses,
  evaluations,
  tests,
  colors,
  selected,
  onSelect,
  onToggleNoTests,
}: {
  courses: Course[];
  evaluations: Map<number, string | null>;
  tests: Task[];
  colors: Map<number, string>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  onToggleNoTests: (course: Course) => void;
}) {
  const now = Date.now();
  const byCourse = new Map<number, Task[]>();
  for (const t of tests) {
    if (t.course_id == null) continue;
    byCourse.set(t.course_id, [...(byCourse.get(t.course_id) ?? []), t]);
  }
  const withTests = courses.filter((c) => !c.no_tests);
  const without = courses.filter((c) => c.no_tests);

  const row = (course: Course) => {
    const color = colors.get(course.id) ?? "#71717a";
    const active = selected === course.id;
    const dimmed = selected != null && !active;
    const list = byCourse.get(course.id) ?? [];
    const next = list.find((t) => new Date(t.due_at!).getTime() >= now);
    const evaluation = evaluations.get(course.id) ?? null;
    const hint = !course.no_tests && evaluation != null && NO_TESTS_RE.test(evaluation);
    return (
      <div
        key={course.id}
        className={`group rounded-xl transition-all ${
          active
            ? "bg-white/[0.06] ring-1 ring-white/10"
            : dimmed
              ? "opacity-40 hover:opacity-80"
              : "hover:bg-white/[0.04]"
        } ${course.no_tests && !active ? "opacity-60" : ""}`}
      >
        <button
          onClick={() => onSelect(active ? null : course.id)}
          className="block w-full px-3 pt-2.5 text-left"
          title={active ? "clear filter" : `show ${course.name}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">
                {course.code && (
                  <span className="mr-1.5 font-mono text-xs text-zinc-500">{course.code}</span>
                )}
                {course.name}
              </span>
            </span>
            <span
              className={`shrink-0 font-mono text-xs ${
                next ? (active ? "text-zinc-100" : "text-zinc-400") : "text-zinc-600"
              }`}
            >
              {course.no_tests ? "—" : next ? fmtRelative(next.due_at!) : "no dates"}
            </span>
          </div>
        </button>
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pl-[30px]">
          <p
            className="min-w-0 truncate font-mono text-[10px] text-zinc-600"
            title={evaluation ?? undefined}
          >
            {course.no_tests
              ? (evaluation ?? "graded without tests")
              : list.length
                ? `${list.length} ${list.length === 1 ? "test" : "tests"}${
                    next ? ` · next ${fmtDue(next.due_at!)}` : " · all done"
                  }`
                : hint
                  ? "grading says no tests"
                  : "no test dates yet"}
          </p>
          <button
            onClick={() => onToggleNoTests(course)}
            className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all ${
              course.no_tests
                ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]"
                : hint
                  ? "bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                  : "text-zinc-600 opacity-0 hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100"
            }`}
            title={course.no_tests ? "This class does have tests" : "Mark: graded without tests"}
          >
            {course.no_tests ? "no tests ✓" : "no tests"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <nav className="space-y-1">
      {withTests.map(row)}
      {without.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-5 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
            Graded without tests
          </p>
          {without.map(row)}
        </>
      )}
    </nav>
  );
}

/** Full-width month grid: every test on its day as a course-colored chip
 * with the title, today on the accent. Unlike the planner's month, this one
 * is not a filter — the sidebar is; other classes' tests dim, never hide, so
 * the month keeps its shape. */
function TestCalendar({
  tests,
  colors,
  selected,
}: {
  tests: Task[];
  colors: Map<number, string>;
  selected: number | null;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const byDay = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tests) {
      if (!t.due_at) continue;
      const key = dayKey(t.due_at);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tests]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((month.getDay() + daysInMonth) / 7);
  const cells = Array.from(
    { length: rows * 7 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay() + i),
  );
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const inMonthCount = tests.filter((t) => {
    if (!t.due_at || (selected != null && t.course_id !== selected)) return false;
    const d = new Date(t.due_at);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  }).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="previous month"
          className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
        >
          ‹
        </button>
        <p className="font-display text-base font-medium text-zinc-100">
          {monthFmt.format(month)}
          <span className="ml-3 font-mono text-xs font-normal text-zinc-500">
            {inMonthCount} {inMonthCount === 1 ? "test" : "tests"}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-md px-2 py-1 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            today
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="next month"
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            ›
          </button>
        </div>
      </div>
      <div
        key={`${month.getFullYear()}-${month.getMonth()}`}
        className="animate-fade-in grid grid-cols-7 gap-1"
      >
        {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
          <span key={d} className="pb-1 text-center font-mono text-[10px] text-zinc-600">
            {d}
          </span>
        ))}
        {cells.map((day) => {
          const key = day.getTime();
          const list = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === today.getTime();
          const past = key < today.getTime();
          return (
            <div
              key={key}
              className={`flex min-h-[4.5rem] flex-col gap-1 rounded-lg p-1.5 transition-colors sm:min-h-[5.5rem] ${
                isToday ? "bg-accent/[0.08] ring-1 ring-accent/40" : "bg-white/[0.02]"
              } ${inMonth ? "" : "opacity-30"}`}
            >
              <span
                className={`font-mono text-[11px] ${
                  isToday ? "font-semibold text-accent" : past ? "text-zinc-600" : "text-zinc-400"
                }`}
              >
                {day.getDate()}
              </span>
              {list.map((t) => {
                const color = (t.course_id != null && colors.get(t.course_id)) || "#71717a";
                const muted = selected != null && t.course_id !== selected;
                return (
                  <span
                    key={t.id}
                    title={`${t.course_code ?? t.course_name ?? ""} · ${t.title}`}
                    className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[10px] leading-tight transition-opacity sm:text-[11px] ${
                      muted ? "opacity-25" : ""
                    } ${past || t.status === "done" ? "line-through opacity-60" : ""}`}
                    style={{ backgroundColor: `${color}26`, color }}
                  >
                    <Diamond color={color} className="h-1.5 w-1.5" />
                    <span className="hidden truncate font-mono sm:inline">
                      {t.course_code ?? ""}
                    </span>
                    <span className="truncate">{t.title}</span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tests grouped by class, soonest class first; past ones under their own
 * dimmed heading so the semester's shape stays visible. */
function TestList({
  tests,
  courses,
  colors,
}: {
  tests: Task[];
  courses: Course[];
  colors: Map<number, string>;
}) {
  const now = Date.now();
  const upcoming = tests.filter((t) => new Date(t.due_at!).getTime() >= now);
  const past = tests
    .filter((t) => new Date(t.due_at!).getTime() < now)
    .sort((a, b) => new Date(b.due_at!).getTime() - new Date(a.due_at!).getTime());
  const [showPast, setShowPast] = useState(false);

  // Group upcoming by class, ordered by each class's soonest test.
  const groups = new Map<number | null, Task[]>();
  for (const t of upcoming) groups.set(t.course_id, [...(groups.get(t.course_id) ?? []), t]);

  const rowOf = (t: Task, dim = false) => {
    const color = (t.course_id != null && colors.get(t.course_id)) || "#71717a";
    return (
      <div
        key={t.id}
        className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03] ${
          dim ? "opacity-50" : ""
        }`}
      >
        <Diamond color={color} />
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-200" title={t.title}>
          {t.title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{fmtDue(t.due_at!)}</span>
        <span
          className={`w-16 shrink-0 text-right font-mono text-xs ${
            dim ? "text-zinc-600" : "text-zinc-300"
          }`}
        >
          {dim ? fmtRelative(t.due_at!) : fmtCountdown(t.due_at!)}
        </span>
        {t.url ? (
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-200"
            aria-label="open on platform"
          >
            <LinkOutIcon className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {groups.size === 0 && <p className="py-4 text-sm text-zinc-500">No upcoming tests.</p>}
      {[...groups.entries()].map(([courseId, list]) => {
        const course = courses.find((c) => c.id === courseId);
        const color = (courseId != null && colors.get(courseId)) || "#71717a";
        return (
          <section key={courseId ?? "none"}>
            <p className="mb-1 flex items-center gap-2 px-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {course?.code && (
                <span className="font-mono text-xs text-zinc-500">{course.code}</span>
              )}
              <span className="text-zinc-300">{course?.name ?? list[0].course_name ?? "—"}</span>
              <span className="ml-auto font-mono text-[10px] text-zinc-600">
                {list.length} {list.length === 1 ? "test" : "tests"}
              </span>
            </p>
            {list.map((t) => rowOf(t))}
          </section>
        );
      })}
      {past.length > 0 && (
        <section>
          <button
            onClick={() => setShowPast((v) => !v)}
            className="mb-1 flex items-center gap-2 px-2 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Past · {past.length}
            <span className="font-mono text-[10px] normal-case tracking-normal">
              {showPast ? "hide" : "show"}
            </span>
          </button>
          {showPast && <div className="animate-fade-in">{past.map((t) => rowOf(t, true))}</div>}
        </section>
      )}
    </div>
  );
}

export function TestsPanel({
  tasks,
  courses,
  classes,
  colors,
  onChanged,
}: {
  tasks: Task[];
  courses: Course[];
  classes: SemClass[];
  colors: Map<number, string>;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const allTests = useMemo(
    () =>
      tasks
        .filter((t) => isTest(t) && t.status !== "dismissed" && t.due_at != null)
        .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()),
    [tasks],
  );
  const tests = useMemo(
    () => (selected == null ? allTests : allTests.filter((t) => t.course_id === selected)),
    [allTests, selected],
  );
  const evaluations = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const sc of classes) if (sc.course_id != null) map.set(sc.course_id, sc.evaluation);
    return map;
  }, [classes]);

  const next = upcomingTests(tests)[0];
  const selectedCourse = courses.find((c) => c.id === selected);

  const toggleNoTests = async (course: Course) => {
    if (saving != null) return;
    setSaving(course.id);
    try {
      await api(`/courses/${course.id}`, {
        method: "PATCH",
        body: JSON.stringify({ no_tests: !course.no_tests }),
      });
      if (selected === course.id && !course.no_tests) setSelected(null);
      onChanged();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-3 lg:gap-10">
      <aside>
        <div className="mb-5">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Classes
          </h2>
        </div>
        <div>
          {courses.length ? (
            <ClassNav
              courses={courses}
              evaluations={evaluations}
              tests={allTests}
              colors={colors}
              selected={selected}
              onSelect={setSelected}
              onToggleNoTests={toggleNoTests}
            />
          ) : (
            <p className="text-sm text-zinc-500">No courses yet — connect a platform.</p>
          )}
        </div>
      </aside>

      <section className="min-w-0 lg:col-span-2">
        {/* hero and list keyed by class so they ease in on switch; the calendar keeps its month */}
        <div
          key={`hero-${selected ?? "all"}`}
          className="animate-msg-in mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              <CalendarIcon className="h-3.5 w-3.5" /> Next test
              {selectedCourse && (
                <button
                  onClick={() => setSelected(null)}
                  className="animate-chip-in ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] normal-case tracking-normal transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `${colors.get(selectedCourse.id) ?? "#71717a"}22`,
                    color: colors.get(selectedCourse.id) ?? "#a1a1aa",
                  }}
                  title="clear class filter"
                >
                  {selectedCourse.code ?? selectedCourse.name}
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </p>
            {next ? (
              <>
                <p className="mt-2 font-mono text-5xl font-semibold tracking-tight text-zinc-100 sm:text-6xl">
                  {fmtCountdown(next.due_at!)}
                </p>
                <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-zinc-400">
                  <Diamond
                    color={(next.course_id != null && colors.get(next.course_id)) || "#71717a"}
                  />
                  {next.course_code && (
                    <span className="font-mono text-xs text-zinc-500">{next.course_code}</span>
                  )}
                  <span className="truncate">{next.title}</span>
                  <span className="shrink-0 text-zinc-600">· {fmtDue(next.due_at!)}</span>
                </p>
              </>
            ) : (
              <p className="mt-2 font-mono text-5xl font-semibold tracking-tight text-zinc-600 sm:text-6xl">
                —
              </p>
            )}
          </div>
          <p className="shrink-0 font-mono text-[10px] text-zinc-600">
            ◆ test · today on the accent
          </p>
        </div>

        <TestCalendar tests={allTests} colors={colors} selected={selected} />

        <div key={`list-${selected ?? "all"}`} className="animate-msg-in mt-12">
          <div className="mb-4">
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Upcoming
            </h2>
          </div>
          <TestList tests={tests} courses={courses} colors={colors} />
        </div>
      </section>
    </div>
  );
}
