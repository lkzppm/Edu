"use client";

import { useMemo, useState } from "react";
import { CourseTimeline, TimelineLane } from "@/components/timeline";
import { Course, Task } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Start-of-local-day timestamp — the currency for day selection. */
export function dayKey(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pendingByDay(tasks: Task[]): Map<number, Task[]> {
  const map = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.status !== "todo" || !t.due_at) continue;
    const key = dayKey(t.due_at);
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}

function Dot({ task, color }: { task: Task; color: string }) {
  const test = task.kind === "exam" || task.kind === "quiz";
  return (
    <span
      className={`inline-block ${
        test ? "h-3 w-3 rotate-45 rounded-[2px]" : "h-2 w-2 rounded-full"
      }`}
      style={{ backgroundColor: color }}
      title={task.title}
    />
  );
}

/** The next 7 days as columns with one colored dot per pending task due that
 * day — the "shape of the week" at a glance. Today wears the accent; clicking
 * a day filters the task list to it (click again to clear). */
function WeekStrip({
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
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const byDay = pendingByDay(tasks);

  return (
    <div className="flex items-end justify-center gap-1.5 sm:gap-2.5">
      {days.map((day, i) => {
        const list = byDay.get(day.getTime()) ?? [];
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
                <Dot
                  key={t.id}
                  task={t}
                  color={(t.course_id != null && colors.get(t.course_id)) || "#71717a"}
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

/** Browsable month grid, same dots and the same day filter as the strip. */
function MonthCalendar({
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
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const byDay = pendingByDay(tasks);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((month.getDay() + daysInMonth) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    return new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay() + i);
  });
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="previous month"
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
        >
          ‹
        </button>
        <p className="font-display text-sm font-medium text-zinc-200">{monthFmt.format(month)}</p>
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label="next month"
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
        >
          ›
        </button>
      </div>
      <div
        key={`${month.getFullYear()}-${month.getMonth()}`}
        className="animate-fade-in grid grid-cols-7 text-center"
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1 font-mono text-[10px] text-zinc-600">
            {d}
          </span>
        ))}
        {cells.map((day) => {
          const key = day.getTime();
          const list = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === today.getTime();
          const active = selected === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(active ? null : key)}
              title={list.length ? list.map((t) => t.title).join("\n") : undefined}
              className={`flex h-12 flex-col items-center gap-1 rounded-lg pt-1 transition-all ${
                active
                  ? "bg-accent/15 ring-1 ring-accent/60"
                  : isToday
                    ? "bg-accent/[0.08] hover:bg-accent/15"
                    : "hover:bg-white/[0.05]"
              } ${inMonth ? "" : "opacity-30"}`}
            >
              <span
                className={`font-mono text-xs ${
                  active || isToday ? "font-semibold text-accent" : "text-zinc-400"
                }`}
              >
                {day.getDate()}
              </span>
              <span className="flex items-center gap-0.5">
                {list.slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className={`inline-block ${
                      t.kind === "exam" || t.kind === "quiz"
                        ? "h-1.5 w-1.5 rotate-45 rounded-[1px]"
                        : "h-1.5 w-1.5 rounded-full"
                    }`}
                    style={{
                      backgroundColor:
                        (t.course_id != null && colors.get(t.course_id)) || "#71717a",
                    }}
                  />
                ))}
                {list.length > 3 && (
                  <span className="font-mono text-[9px] leading-none text-zinc-500">+</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PlannerMode = "week" | "month" | "chart";

/** The 3-in-1 planner living in the hero: the 7-day strip, a browsable month
 * calendar, or the six-week per-class timeline — one component, one mode
 * switch, all three driving the same day filter. */
export function Planner({
  tasks,
  courses,
  colors,
  selected,
  onSelect,
}: {
  tasks: Task[];
  courses: Course[];
  colors: Map<number, string>;
  selected: number | null;
  onSelect: (day: number | null) => void;
}) {
  const [mode, setMode] = useState<PlannerMode>("week");

  // Chart mode: pending work as one lane per class, overdue tail included.
  const chart = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - 7 * DAY_MS);
    const end = new Date(today.getTime() + 42 * DAY_MS);
    const items = tasks.filter((t) => {
      if (t.status !== "todo" || !t.due_at) return false;
      const due = new Date(t.due_at).getTime();
      return due >= start.getTime() && due <= end.getTime();
    });
    const laneIds = new Set(items.map((t) => t.course_id ?? null));
    const lanes: TimelineLane[] = courses
      .filter((c) => laneIds.has(c.id))
      .map((c) => ({ id: c.id, label: c.code ?? c.name, color: colors.get(c.id) ?? "#71717a" }));
    if (laneIds.has(null)) lanes.push({ id: null, label: "personal", color: "#71717a" });
    return { items, lanes, start, end };
  }, [tasks, courses, colors]);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex rounded-lg bg-white/[0.05] p-0.5 font-mono text-[11px]">
          {(["week", "month", "chart"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                mode === m ? "bg-accent/20 text-cyan-300" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">
          ◆ test · ● task
        </span>
      </div>
      {/* keyed by mode so each view eases in on switch */}
      <div key={mode} className="animate-msg-in">
        {mode === "week" && (
          <WeekStrip tasks={tasks} colors={colors} selected={selected} onSelect={onSelect} />
        )}
        {mode === "month" && (
          <MonthCalendar tasks={tasks} colors={colors} selected={selected} onSelect={onSelect} />
        )}
        {mode === "chart" &&
          (chart.items.length ? (
            <CourseTimeline
              tasks={chart.items}
              lanes={chart.lanes}
              start={chart.start}
              end={chart.end}
              selectedDay={selected}
              onSelectDay={onSelect}
            />
          ) : (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nothing due in the next six weeks.
            </p>
          ))}
      </div>
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
