"use client";

import { CalendarIcon } from "@/components/ui";
import { fmtCountdown, fmtDue } from "@/lib/format";
import { Task } from "@/lib/types";

const WINDOW_DAYS = 45;

export function upcomingExams(tasks: Task[]): Task[] {
  const now = Date.now();
  const limit = now + WINDOW_DAYS * 86_400_000;
  return tasks
    .filter(
      (t) =>
        (t.kind === "exam" || t.kind === "quiz") &&
        t.status === "todo" &&
        t.due_at != null &&
        new Date(t.due_at).getTime() >= now &&
        new Date(t.due_at).getTime() <= limit
    )
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
}

export function ExamsStrip({
  exams,
  colors,
  vertical = false,
}: {
  exams: Task[];
  colors: Map<number, string>;
  vertical?: boolean;
}) {
  if (!exams.length) return null;
  return (
    <div
      className={
        vertical ? "flex flex-col gap-3" : "-mx-1 flex gap-3 overflow-x-auto px-1 pb-2"
      }
    >
      {exams.map((exam) => {
        const color = exam.course_id != null ? colors.get(exam.course_id) : undefined;
        return (
          <div
            key={exam.id}
            className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 ${
              vertical ? "" : "min-w-[220px] shrink-0"
            }`}
            style={{ borderLeft: `3px solid ${color ?? "#71717a"}` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs text-zinc-500">
                {exam.course_code ?? exam.course_name ?? "—"}
              </span>
              <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-300">
                {exam.kind === "quiz" ? "quiz" : "prova"}
              </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-zinc-100" title={exam.title}>
              {exam.title}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-lg font-semibold text-zinc-100">
                {fmtCountdown(exam.due_at!)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                <CalendarIcon className="h-3 w-3" />
                {fmtDue(exam.due_at!)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
