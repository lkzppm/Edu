"use client";

import { useState } from "react";
import { LinkOutIcon } from "@/components/ui";
import { fmtDay } from "@/lib/format";
import { CourseGrades, GradeItem } from "@/lib/types";

// "Lost" points wear the course's own hue at low alpha — a darker step of the
// same ramp (meter rule). A separate red FAILED the palette validator next to
// warm course colors (ΔE 6–7 vs magenta/orange); lightness separates where a
// second hue can't, for every course color at once.
const LOST_ALPHA = "59"; // ~35%

function num(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtPts(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Points math: how much of the course's total is banked, gone, or still open. */
function summarize(items: GradeItem[]) {
  let earned = 0;
  let gradedMax = 0;
  let pending = 0;
  for (const item of items) {
    const max = num(item.max_grade);
    if (item.grade != null) {
      earned += num(item.grade);
      gradedMax += max;
    } else {
      pending += max;
    }
  }
  const total = gradedMax + pending;
  const gradedCount = items.filter((i) => i.grade != null).length;
  return {
    earned,
    lost: Math.max(gradedMax - earned, 0),
    pending,
    total,
    gradedCount,
    currentPct: gradedMax > 0 ? (earned / gradedMax) * 100 : null,
  };
}

function ItemRow({ item }: { item: GradeItem }) {
  const graded = item.grade != null;
  return (
    <div className="group flex items-center justify-between gap-3 py-1.5 text-sm">
      <span
        className={`min-w-0 truncate ${graded ? "text-zinc-300" : "text-zinc-600"}`}
        title={item.name}
      >
        {item.name}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {graded && item.graded_at && (
          <span className="font-mono text-[10px] text-zinc-600" title="graded on">
            {fmtDay(item.graded_at)}
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-zinc-400">
          {graded ? (
            <>
              {fmtPts(num(item.grade))}
              <span className="text-zinc-600"> / {fmtPts(num(item.max_grade))}</span>
              {item.pct != null && (
                <span className="ml-2 text-zinc-500">{Math.round(item.pct)}%</span>
              )}
            </>
          ) : (
            <span className="text-zinc-600">— / {fmtPts(num(item.max_grade))}</span>
          )}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            aria-label="open the graded activity"
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-600 opacity-0 transition-all hover:bg-white/[0.04] hover:text-cyan-300 group-hover:opacity-100"
          >
            <LinkOutIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </span>
    </div>
  );
}

function CourseCard({ course, color }: { course: CourseGrades; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const s = summarize(course.items);
  const graded = course.items.filter((i) => i.grade != null);
  const ungraded = course.items.length - graded.length;
  // Source course total (Moodle) wins as the headline when it's graded.
  const headlinePct = course.total?.pct ?? s.currentPct;

  const seg = (points: number) => `${s.total ? (points / s.total) * 100 : 0}%`;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{course.course_name}</span>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {course.course_code && <span className="mr-2">{course.course_code}</span>}
            {s.gradedCount}/{course.items.length} avaliados
          </p>
        </div>
        <p className="shrink-0 font-mono text-3xl font-semibold text-zinc-100">
          {headlinePct != null ? `${Math.round(headlinePct)}%` : "—"}
        </p>
      </div>

      {/* Points meter: earned · lost · still in play (2px surface gaps) */}
      <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {s.earned > 0 && (
          <div
            style={{ width: seg(s.earned), backgroundColor: color }}
            title={`ganho: ${fmtPts(s.earned)} pts`}
          />
        )}
        {s.lost > 0 && (
          <div
            style={{ width: seg(s.lost), backgroundColor: `${color}${LOST_ALPHA}` }}
            title={`perdido: ${fmtPts(s.lost)} pts`}
          />
        )}
        {s.pending > 0 && (
          <div
            className="bg-white/[0.08]"
            style={{ width: seg(s.pending) }}
            title={`em jogo: ${fmtPts(s.pending)} pts`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {fmtPts(s.earned)} ganho
        </span>
        {s.lost > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `${color}${LOST_ALPHA}` }}
            />
            {fmtPts(s.lost)} perdido
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/20" />
          {fmtPts(s.pending)} em jogo
        </span>
      </div>

      {(graded.length > 0 || expanded) && (
        <div className="mt-3 divide-y divide-white/[0.04]">
          {(expanded ? course.items : graded).map((item, i) => (
            <ItemRow key={i} item={item} />
          ))}
        </div>
      )}
      {ungraded > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 font-mono text-[11px] text-zinc-600 transition-colors hover:text-cyan-300"
        >
          {expanded ? "esconder não avaliados" : `+ ${ungraded} a avaliar`}
        </button>
      )}
    </section>
  );
}

export function GradesPanel({
  courses,
  colors,
}: {
  courses: CourseGrades[];
  colors: Map<number, string>;
}) {
  if (!courses.length)
    return (
      <p className="py-10 text-sm text-zinc-500">
        No grades yet — they appear here as soon as your platforms report graded (or gradable)
        work.
      </p>
    );
  return (
    <div className="grid gap-x-14 gap-y-12 pt-2 md:grid-cols-2">
      {courses.map((course) => (
        <CourseCard
          key={course.course_id}
          course={course}
          color={colors.get(course.course_id) ?? "#71717a"}
        />
      ))}
    </div>
  );
}
