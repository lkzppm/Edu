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
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
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

function headlinePct(course: CourseGrades): number | null {
  // Source course total (Moodle) wins as the headline when it's graded.
  return course.total?.pct ?? summarize(course.items).currentPct;
}

/** Sidebar: one row per class — dot, code/name, headline % — IS the selector. */
function CourseNav({
  courses,
  colors,
  selected,
  onSelect,
}: {
  courses: CourseGrades[];
  colors: Map<number, string>;
  selected: number;
  onSelect: (id: number) => void;
}) {
  return (
    <nav className="space-y-1">
      {courses.map((course) => {
        const active = course.course_id === selected;
        const pct = headlinePct(course);
        const s = summarize(course.items);
        return (
          <button
            key={course.course_id}
            onClick={() => onSelect(course.course_id)}
            className={`block w-full rounded-xl px-3 py-2.5 text-left transition-all ${
              active ? "bg-white/[0.06] ring-1 ring-white/10" : "hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors.get(course.course_id) ?? "#71717a" }}
                />
                <span className="truncate">
                  {course.course_code && (
                    <span className="mr-1.5 font-mono text-xs text-zinc-500">
                      {course.course_code}
                    </span>
                  )}
                  {course.course_name}
                </span>
              </span>
              <span
                className={`shrink-0 font-mono text-sm font-semibold ${
                  active ? "text-zinc-100" : "text-zinc-400"
                }`}
              >
                {pct != null ? `${Math.round(pct)}%` : "—"}
              </span>
            </div>
            <p className="mt-1 pl-[18px] font-mono text-[10px] text-zinc-600">
              {s.gradedCount}/{course.items.length} graded
            </p>
          </button>
        );
      })}
    </nav>
  );
}

/** One grade item as a labeled bar: fill = grade/max in the course color on a
 * lighter track of the same surface; value labels stay in text tokens. */
function ItemBar({ item, color }: { item: GradeItem; color: string }) {
  const graded = item.grade != null;
  const fillPct = graded && num(item.max_grade) > 0 ? (num(item.grade) / num(item.max_grade)) * 100 : 0;
  return (
    <div className="group py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span
          className={`min-w-0 truncate text-sm ${graded ? "text-zinc-200" : "text-zinc-500"}`}
          title={item.name}
        >
          {item.name}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {graded && item.graded_at && (
            <span className="font-mono text-[10px] text-zinc-600" title="graded on">
              {fmtDay(item.graded_at)}
            </span>
          )}
          <span className="font-mono text-xs tabular-nums text-zinc-300">
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
              className="grid h-5 w-5 place-items-center rounded-md text-zinc-600 opacity-0 transition-all hover:bg-white/[0.04] hover:text-cyan-300 group-hover:opacity-100"
            >
              <LinkOutIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        {graded && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(fillPct, 100)}%`, backgroundColor: color }}
          />
        )}
      </div>
    </div>
  );
}

/** The content field: hero %, the points meter, then every item as a bar. */
function CourseDetail({ course, color }: { course: CourseGrades; color: string }) {
  const s = summarize(course.items);
  const pct = headlinePct(course);
  const seg = (points: number) => `${s.total ? (points / s.total) * 100 : 0}%`;
  const graded = course.items.filter((i) => i.grade != null);
  const ungraded = course.items.filter((i) => i.grade == null);

  return (
    // keyed by the caller so switching classes eases the panel in
    <div className="animate-msg-in">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold text-zinc-100">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{course.course_name}</span>
          </h3>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {course.course_code && <span className="mr-2">{course.course_code}</span>}
            {s.gradedCount}/{course.items.length} graded
          </p>
        </div>
        <p className="shrink-0 font-mono text-6xl font-semibold tracking-tight text-zinc-100">
          {pct != null ? `${Math.round(pct)}%` : "—"}
        </p>
      </div>

      {/* Points meter: earned · lost · still in play (2px surface gaps) */}
      <div className="mt-6 flex h-3 gap-[2px] overflow-hidden rounded-full">
        {s.earned > 0 && (
          <div
            className="transition-all duration-500"
            style={{ width: seg(s.earned), backgroundColor: color }}
            title={`earned: ${fmtPts(s.earned)} pts`}
          />
        )}
        {s.lost > 0 && (
          <div
            className="transition-all duration-500"
            style={{ width: seg(s.lost), backgroundColor: `${color}${LOST_ALPHA}` }}
            title={`lost: ${fmtPts(s.lost)} pts`}
          />
        )}
        {s.pending > 0 && (
          <div
            className="bg-white/[0.08] transition-all duration-500"
            style={{ width: seg(s.pending) }}
            title={`in play: ${fmtPts(s.pending)} pts`}
          />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {fmtPts(s.earned)} earned
        </span>
        {s.lost > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `${color}${LOST_ALPHA}` }}
            />
            {fmtPts(s.lost)} lost
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/20" />
          {fmtPts(s.pending)} in play
        </span>
      </div>

      {graded.length > 0 && (
        <div className="mt-8">
          <h4 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Graded
          </h4>
          <div className="divide-y divide-white/[0.04]">
            {graded.map((item, i) => (
              <ItemBar key={i} item={item} color={color} />
            ))}
          </div>
        </div>
      )}
      {ungraded.length > 0 && (
        <div className="mt-8">
          <h4 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Not graded yet
          </h4>
          <div className="divide-y divide-white/[0.04]">
            {ungraded.map((item, i) => (
              <ItemBar key={i} item={item} color={color} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GradesPanel({
  courses,
  colors,
}: {
  courses: CourseGrades[];
  colors: Map<number, string>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  if (!courses.length)
    return (
      <p className="py-10 text-sm text-zinc-500">
        No grades yet — they appear here as soon as your platforms report graded (or gradable)
        work.
      </p>
    );

  const selected =
    courses.find((c) => c.course_id === selectedId) ?? courses[0];

  return (
    <div className="grid gap-10 pt-2 lg:grid-cols-3 lg:gap-12">
      <aside>
        <h2 className="mb-4 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Classes
        </h2>
        <CourseNav
          courses={courses}
          colors={colors}
          selected={selected.course_id}
          onSelect={setSelectedId}
        />
      </aside>
      <section className="lg:col-span-2">
        <CourseDetail
          key={selected.course_id}
          course={selected}
          color={colors.get(selected.course_id) ?? "#71717a"}
        />
      </section>
    </div>
  );
}
