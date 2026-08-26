"use client";

import { dayKey } from "@/components/overview";
import { fmtDue } from "@/lib/format";
import { Task } from "@/lib/types";

const DAY_MS = 86_400_000;
const ROW_H = 36;
// Marks carry a 2px ring in the page color so overlapping neighbors stay
// legible (surface-ring rule) — the page base, since sections are borderless.
const PAGE_BG = "#040e12";

export type TimelineLane = { id: number | null; label: string; color: string };

/** Diamond = exam/quiz, circle = everything else — kind is never color-alone. */
function Mark({ task, color }: { task: Task; color: string }) {
  const test = task.kind === "exam" || task.kind === "quiz";
  const past = task.status !== "todo" || (task.due_at != null && new Date(task.due_at) < new Date());
  return (
    <span
      className={`inline-block shrink-0 ring-2 transition-transform group-hover:scale-125 ${
        test ? "h-2.5 w-2.5 rotate-45 rounded-[2px]" : "h-2.5 w-2.5 rounded-full"
      } ${past ? "opacity-40" : ""}`}
      style={{ backgroundColor: color, ["--tw-ring-color" as string]: PAGE_BG }}
    />
  );
}

/** Horizontal time chart, one lane per course: gridline ticks, a today line,
 * and one mark per item. Lanes are directly labeled (identity channel), so no
 * legend; wide content scrolls inside its own container. When `onSelectDay`
 * is given, clicking a mark cluster filters the task list to that day. */
export function CourseTimeline({
  tasks,
  lanes,
  start,
  end,
  selectedDay = null,
  onSelectDay,
}: {
  tasks: Task[];
  lanes: TimelineLane[];
  start: Date;
  end: Date;
  selectedDay?: number | null;
  onSelectDay?: (day: number | null) => void;
}) {
  const startMs = start.getTime();
  const span = Math.max(end.getTime() - startMs, DAY_MS);
  const pct = (ms: number) => `${Math.min(Math.max(((ms - startMs) / span) * 100, 0), 100)}%`;

  // Ticks: weekly under ~9 weeks, else monthly — clean, hairline, recessive.
  const weekly = span <= 63 * DAY_MS;
  const ticks: Date[] = [];
  if (weekly) {
    const first = new Date(startMs);
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() + ((8 - first.getDay()) % 7)); // next Monday
    for (let t = new Date(first); t.getTime() < startMs + span; t.setDate(t.getDate() + 7))
      ticks.push(new Date(t));
  } else {
    const first = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    for (let t = new Date(first); t.getTime() < startMs + span; t.setMonth(t.getMonth() + 1))
      ticks.push(new Date(t));
  }
  const tickFmt = new Intl.DateTimeFormat("en-US", weekly ? { month: "short", day: "numeric" } : { month: "short" });

  // One cluster per (lane, day) — same-day items share a click target.
  const clusters = lanes.map((lane) => {
    const byDay = new Map<number, Task[]>();
    for (const task of tasks) {
      if ((task.course_id ?? null) !== lane.id || !task.due_at) continue;
      const due = new Date(task.due_at).getTime();
      if (due < startMs || due > startMs + span) continue;
      const key = dayKey(task.due_at);
      byDay.set(key, [...(byDay.get(key) ?? []), task]);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  });

  const now = Date.now();
  const height = lanes.length * ROW_H;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Tick-label header, sharing the label-column offset with the body */}
        <div className="flex">
          <div className="w-28 shrink-0 sm:w-32" />
          <div className="relative h-5 flex-1">
            {ticks
              // keep the gridline but drop a label that would collide with "today"
              .filter((t) => !weekly || Math.abs(t.getTime() - now) > 2.5 * DAY_MS)
              .map((t) => (
                <span
                  key={t.getTime()}
                  className="absolute -translate-x-1/2 font-mono text-[10px] text-zinc-600"
                  style={{ left: pct(t.getTime()) }}
                >
                  {tickFmt.format(t)}
                </span>
              ))}
            {now >= startMs && now <= startMs + span && (
              <span
                className="absolute -translate-x-1/2 font-mono text-[10px] font-semibold text-accent"
                style={{ left: pct(now) }}
              >
                today
              </span>
            )}
          </div>
        </div>

        <div className="flex">
          <div className="w-28 shrink-0 sm:w-32">
            {lanes.map((lane) => (
              <div
                key={lane.id ?? "personal"}
                className="flex items-center gap-2 pr-3"
                style={{ height: ROW_H }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: lane.color }}
                />
                <span className="truncate font-mono text-[11px] text-zinc-400" title={lane.label}>
                  {lane.label}
                </span>
              </div>
            ))}
          </div>

          <div className="relative flex-1" style={{ height }}>
            {/* hairline grid */}
            {ticks.map((t) => (
              <div
                key={t.getTime()}
                className="absolute inset-y-0 w-px bg-white/[0.06]"
                style={{ left: pct(t.getTime()) }}
              />
            ))}
            {/* lane separators */}
            {lanes.slice(1).map((lane, i) => (
              <div
                key={lane.id ?? "personal"}
                className="absolute inset-x-0 h-px bg-white/[0.04]"
                style={{ top: (i + 1) * ROW_H }}
              />
            ))}
            {/* selected-day band */}
            {selectedDay != null && selectedDay >= startMs && selectedDay <= startMs + span && (
              <div
                className="animate-fade-in absolute inset-y-0 rounded-md bg-accent/10 transition-all duration-300"
                style={{ left: pct(selectedDay), width: `${(DAY_MS / span) * 100}%` }}
              />
            )}
            {/* today line */}
            {now >= startMs && now <= startMs + span && (
              <div className="absolute inset-y-0 w-px bg-accent/60" style={{ left: pct(now) }} />
            )}
            {/* marks */}
            {lanes.map((lane, laneIdx) =>
              clusters[laneIdx].map(([day, dayTasks]) => {
                const label = dayTasks.map((t) => `${t.title} — ${fmtDue(t.due_at!)}`).join("\n");
                const content = (
                  <span className="flex items-center gap-1">
                    {dayTasks.slice(0, 3).map((t) => (
                      <Mark key={t.id} task={t} color={lane.color} />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="font-mono text-[10px] text-zinc-500">
                        +{dayTasks.length - 3}
                      </span>
                    )}
                  </span>
                );
                const style = {
                  left: pct(day + DAY_MS / 2),
                  top: laneIdx * ROW_H + ROW_H / 2,
                };
                return onSelectDay ? (
                  <button
                    key={`${lane.id}-${day}`}
                    onClick={() => onSelectDay(selectedDay === day ? null : day)}
                    title={`${label}\nclick to filter this day`}
                    className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-md p-1.5"
                    style={style}
                  >
                    {content}
                  </button>
                ) : (
                  <span
                    key={`${lane.id}-${day}`}
                    title={label}
                    className="group absolute -translate-x-1/2 -translate-y-1/2 p-1.5"
                    style={style}
                  >
                    {content}
                  </span>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
