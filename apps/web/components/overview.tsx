"use client";

import { Course, Task } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Start-of-local-day timestamp — the currency for day selection. */
export function dayKey(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The next 7 days as columns with one colored dot per pending task due that
 * day — the "shape of the week" at a glance. Today wears the accent; clicking
 * a day filters the task list to it (click again to clear). */
export function WeekStrip({
  tasks,
  colors,
  selected,
  onSelect,
}: {
  tasks: Task[];
  colors: Map<number, string>;
  selected: number | null;
  onSelect: (day: number | null) => void;
}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

  const byDay = days.map((day) => {
    const end = new Date(day.getTime() + DAY_MS);
    return tasks.filter((t) => {
      if (t.status !== "todo" || !t.due_at) return false;
      const due = new Date(t.due_at);
      return due >= day && due < end;
    });
  });

  return (
    <div className="flex items-end gap-1.5 sm:gap-2.5">
      {days.map((day, i) => {
        const list = byDay[i];
        const today = i === 0;
        const active = selected === day.getTime();
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(active ? null : day.getTime())}
            className={`flex w-12 flex-col items-center gap-2.5 rounded-2xl px-1 py-3.5 transition-all sm:w-16 ${
              active
                ? "bg-accent/15 ring-1 ring-accent/60"
                : today
                  ? "bg-accent/[0.08] hover:bg-accent/15"
                  : "hover:bg-white/[0.05]"
            }`}
            title={`${list.length} due — click to filter`}
          >
            <div className="flex min-h-14 flex-col-reverse items-center justify-start gap-1.5">
              {list.slice(0, 5).map((t) => (
                <span
                  key={t.id}
                  className={`inline-block rounded-full ${
                    t.kind === "exam" || t.kind === "quiz" ? "h-3 w-3" : "h-2 w-2"
                  }`}
                  style={{
                    backgroundColor:
                      (t.course_id != null && colors.get(t.course_id)) || "#71717a",
                  }}
                  title={t.title}
                />
              ))}
              {list.length > 5 && (
                <span className="font-mono text-[10px] text-zinc-500">+{list.length - 5}</span>
              )}
            </div>
            <div className="text-center">
              <p
                className={`font-mono text-lg font-semibold sm:text-xl ${
                  active || today ? "text-accent" : "text-zinc-300"
                }`}
              >
                {day.getDate()}
              </p>
              <p
                className={`text-[10px] lowercase sm:text-[11px] ${
                  active ? "text-cyan-300" : "text-zinc-600"
                }`}
              >
                {weekday.format(day).replace(".", "")}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Pending-work bars per course (Fin's allocation bars, workload flavor).
 * Doubles as THE course filter: clicking a row filters the whole page to that
 * course; clicking again (or the selected row's ✕ chip by the Tasks title)
 * clears. */
export function CourseLoad({
  courses,
  colors,
  selected,
  onSelect,
}: {
  courses: Course[];
  colors: Map<number, string>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (!courses.length)
    return <p className="text-sm text-zinc-500">No courses yet — connect a platform.</p>;
  const max = Math.max(...courses.map((c) => c.pending), 1);
  return (
    <div className="space-y-1">
      {[...courses]
        .sort((a, b) => b.pending - a.pending)
        .map((course) => {
          const color = colors.get(course.id) ?? "#71717a";
          const active = selected === course.id;
          const dimmed = selected != null && !active;
          return (
            <button
              key={course.id}
              onClick={() => onSelect(active ? null : course.id)}
              className={`block w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                active
                  ? "bg-white/[0.06] ring-1 ring-white/10"
                  : dimmed
                    ? "opacity-40 hover:opacity-80"
                    : "hover:bg-white/[0.04]"
              }`}
              title={active ? "clear filter" : `filter to ${course.name}`}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-zinc-300">
                  {course.code && (
                    <span className="mr-1.5 font-mono text-xs text-zinc-500">{course.code}</span>
                  )}
                  {course.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-400">{course.pending}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: course.pending ? `${Math.max((course.pending / max) * 100, 4)}%` : "0%",
                    backgroundColor: color,
                  }}
                />
              </div>
            </button>
          );
        })}
    </div>
  );
}
