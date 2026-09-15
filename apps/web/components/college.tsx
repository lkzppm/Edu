"use client";

import { useEffect, useRef, useState } from "react";
import { LinkOutIcon } from "@/components/ui";
import { CollegeResponse, DegreePlan, PlanCourse, PlanStatus, SemClass } from "@/lib/types";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const JS_DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
      {children}
    </h2>
  );
}

/** Status palette, app semantics: emerald = done, accent = current, zinc =
 * ahead. Never color alone — the fill + edge travel together. Statuses are
 * the plan's three semantic keys, nothing program-specific. */
const NODE_STYLE: Record<PlanStatus, { bg: string; edge: string; text: string }> = {
  done: { bg: "bg-emerald-400/[0.08]", edge: "#34d399", text: "text-emerald-300" },
  current: { bg: "bg-accent/[0.10]", edge: "#22b8cf", text: "text-cyan-300" },
  ahead: { bg: "bg-white/[0.03]", edge: "#3f3f46", text: "text-zinc-400" },
};

function StatusLegend() {
  return (
    <span className="font-mono text-[10px] text-zinc-600">
      <span className="text-emerald-400">●</span> done · <span className="text-cyan-300">●</span>{" "}
      current · ● ahead
    </span>
  );
}

/** Size of a box, live — the fit-to-pane views scale themselves from it. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ── fluxogram — fixed geometry, scaled to fit the pane ─────── */

const COL_W = 152;
const COL_GAP = 26;
const NODE_H = 76;
const NODE_GAP = 10;
const HEADER_H = 34;

function FluxNode({ course, x, y }: { course: PlanCourse; x: number; y: number }) {
  const style = NODE_STYLE[course.status] ?? NODE_STYLE.ahead;
  const tooltip = [course.name, course.planned && `planned ${course.planned}`, course.note]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      className={`absolute overflow-hidden rounded-lg px-2.5 py-2 ${style.bg}`}
      style={{
        left: x,
        top: y,
        width: COL_W,
        height: NODE_H,
        borderLeft: `3px solid ${style.edge}`,
      }}
      title={tooltip}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[11px] font-semibold ${style.text}`}>
          {course.code}
          {course.at_risk && (
            <span className="ml-1 text-amber-400" title="at risk">
              ⚠
            </span>
          )}
        </span>
        {course.credits != null && (
          <span className="font-mono text-[10px] text-zinc-600">{course.credits} cr</span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400" title={course.name}>
        {course.name}
      </p>
      {course.planned && course.status === "ahead" && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">→ {course.planned}</p>
      )}
    </div>
  );
}

function Fluxogram({ plan }: { plan: DegreePlan }) {
  const periods = plan.periods;
  const [ref, size] = useSize<HTMLDivElement>();
  if (!periods.length)
    return <p className="py-6 text-sm text-zinc-500">No curriculum yet — import a plan.</p>;

  // Deterministic layout: position every node, then draw prerequisite arrows
  // between them in an SVG underlay — no measuring needed. The whole drawing
  // is then scaled down to fit the pane (never up), so nothing scrolls.
  const pos = new Map<string, { x: number; y: number }>();
  periods.forEach((period, col) => {
    period.courses.forEach((course, row) => {
      pos.set(course.code, {
        x: col * (COL_W + COL_GAP),
        y: HEADER_H + row * (NODE_H + NODE_GAP),
      });
    });
  });
  const width = periods.length * (COL_W + COL_GAP) - COL_GAP;
  const height =
    HEADER_H + Math.max(...periods.map((p) => p.courses.length)) * (NODE_H + NODE_GAP) - NODE_GAP;
  const scale = size.w && size.h ? Math.min(size.w / width, size.h / height, 1) : 1;

  const arrows: { from: { x: number; y: number }; to: { x: number; y: number }; done: boolean }[] =
    [];
  for (const period of periods) {
    for (const course of period.courses) {
      for (const req of course.requires ?? []) {
        const from = pos.get(req);
        const to = pos.get(course.code);
        if (!from || !to) continue;
        arrows.push({
          from: { x: from.x + COL_W, y: from.y + NODE_H / 2 },
          to: { x: to.x, y: to.y + NODE_H / 2 },
          done: course.status === "done",
        });
      }
    }
  }

  return (
    <div className="flex lg:h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-baseline justify-between gap-3">
        <SectionTitle>Curriculum fluxogram</SectionTitle>
        <StatusLegend />
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {/* the scaled box keeps its *scaled* footprint, so the phone gets no blank tail */}
        <div className="overflow-hidden" style={{ height: height * scale }}>
          <div
            className="relative origin-top-left"
            style={{ width, height, transform: `scale(${scale})` }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={width}
              height={height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flux-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M0,0.5 L7.5,4 L0,7.5"
                    fill="none"
                    stroke="context-stroke"
                    strokeWidth="1.4"
                  />
                </marker>
              </defs>
              {arrows.map((a, i) => {
                const dx = Math.max((a.to.x - a.from.x) / 2, 24);
                return (
                  <path
                    key={i}
                    d={`M${a.from.x},${a.from.y} C${a.from.x + dx},${a.from.y} ${a.to.x - dx},${a.to.y} ${a.to.x},${a.to.y}`}
                    fill="none"
                    stroke={a.done ? "rgba(52,211,153,0.45)" : "rgba(161,161,170,0.28)"}
                    strokeWidth="1.2"
                    markerEnd="url(#flux-arrow)"
                  />
                );
              })}
            </svg>
            {periods.map((period, col) => {
              const done = period.courses.filter((c) => c.status === "done").length;
              const cr = period.courses.reduce((n, c) => n + (c.credits ?? 0), 0);
              return (
                <div
                  key={period.period}
                  className="absolute top-0 flex items-baseline justify-between"
                  style={{ left: col * (COL_W + COL_GAP), width: COL_W, height: HEADER_H }}
                >
                  <span className="font-mono text-xs font-semibold text-zinc-200">
                    P{String(period.period).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-600">
                    {done}/{period.courses.length} · {cr} cr
                  </span>
                </div>
              );
            })}
            {periods.flatMap((period) =>
              period.courses.map((course) => {
                const p = pos.get(course.code)!;
                return <FluxNode key={course.code} course={course} x={p.x} y={p.y} />;
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── plan — degree hero, road to graduation, requirement meters ── */

function CourseNode({ course }: { course: PlanCourse }) {
  const style = NODE_STYLE[course.status] ?? NODE_STYLE.ahead;
  const tooltip = [course.name, course.planned && `planned ${course.planned}`, course.note]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 ${style.bg}`}
      style={{ borderLeft: `3px solid ${style.edge}` }}
      title={tooltip}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[11px] font-semibold ${style.text}`}>
          {course.code}
          {course.unlocks && (
            <span className="ml-1 text-cyan-300" title={`anchor — unlocks ${course.unlocks}`}>
              ⚑
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">
          {course.role && course.period == null && <span className="mr-1.5">{course.role}</span>}
          {course.credits != null && course.credits}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-400" title={course.name}>
        {course.name}
      </p>
      {course.note && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">{course.note}</p>
      )}
    </div>
  );
}

function Meter({
  label,
  done,
  inCourse,
  required,
  unit,
}: {
  label: string;
  done: number;
  inCourse: number;
  required: number | null;
  unit: string;
}) {
  const pct = (v: number) => `${required ? Math.min((v / required) * 100, 100) : 0}%`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate text-zinc-400">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">
          {done}
          {inCourse > 0 && <span className="text-cyan-300">+{inCourse}</span>}
          <span className="text-zinc-600">
            {" "}
            / {required ?? "—"} {unit}
          </span>
        </span>
      </div>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/[0.06]">
        {done > 0 && <div className="bg-emerald-400/80" style={{ width: pct(done) }} />}
        {inCourse > 0 && <div className="bg-accent/70" style={{ width: pct(inCourse) }} />}
      </div>
    </div>
  );
}

function Plan({ plan }: { plan: DegreePlan }) {
  const { summary, meta, road, requirements } = plan;
  const total = summary.total_credits || 1;

  return (
    <div className="flex lg:h-full min-h-0 flex-col gap-6">
      {/* top: degree hero + requirement meters, side by side */}
      <section className="grid shrink-0 gap-x-10 gap-y-5 lg:grid-cols-5">
        <div className="flex items-end justify-between gap-6 lg:col-span-2">
          <div className="min-w-0 flex-1">
            <SectionTitle>Degree</SectionTitle>
            <p className="mt-1 truncate text-sm text-zinc-400" title={meta.program}>
              {meta.program ?? "—"}
              {meta.graduation_target && (
                <span className="text-zinc-600"> · graduation {meta.graduation_target}</span>
              )}
            </p>
            <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="bg-emerald-400/80"
                style={{ width: `${(summary.credits.done / total) * 100}%` }}
              />
              <div
                className="bg-accent/70"
                style={{ width: `${(summary.credits.current / total) * 100}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-500">
              <span className="text-emerald-400">{summary.credits.done} cr done</span>
              {" · "}
              <span className="text-cyan-300">{summary.credits.current} cr current</span>
              {" · "}
              {summary.credits.ahead} cr ahead
            </p>
          </div>
          <p className="shrink-0 font-mono text-5xl font-semibold tracking-tight text-zinc-100">
            {summary.done_pct != null ? `${Math.round(summary.done_pct)}%` : "—"}
          </p>
        </div>
        <div className="lg:col-span-3">
          <div className="mb-2">
            <SectionTitle>Requirements</SectionTitle>
          </div>
          <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {requirements.map((req) => (
              <Meter
                key={req.key}
                label={req.label}
                done={req.done}
                inCourse={req.in_course}
                required={req.required}
                unit={req.unit}
              />
            ))}
          </div>
        </div>
      </section>

      {/* bottom: the road — one column per semester, each scrolls on its own */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-baseline justify-between gap-3">
          <SectionTitle>Road to graduation</SectionTitle>
          <StatusLegend />
        </div>
        {road.length ? (
          <div
            className="grid min-h-0 flex-1 gap-5"
            style={{ gridTemplateColumns: `repeat(${road.length}, minmax(0, 1fr))` }}
          >
            {road.map((step) => (
              <div key={step.semester} className="flex min-h-0 flex-col">
                <p className="shrink-0 font-mono text-sm font-semibold text-zinc-100">
                  {step.semester}
                  {step.current && <span className="ml-2 text-[10px] text-cyan-300">now</span>}
                </p>
                <p className="mb-2 mt-0.5 shrink-0 truncate text-[11px] text-zinc-500">
                  {step.note ??
                    `${step.courses.length} ${step.courses.length === 1 ? "class" : "classes"} · ${step.credits} cr`}
                </p>
                <div className="min-h-0 flex-1 space-y-1.5 lg:overflow-y-auto pr-1">
                  {step.courses.map((course) => (
                    <CourseNode key={course.code} course={course} />
                  ))}
                  {step.items.map((item, j) => (
                    <div
                      key={`${item.code ?? item.name}-${j}`}
                      className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5"
                      title={item.note ?? undefined}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {item.code ?? "—"}
                        </span>
                        {item.role && (
                          <span className="font-mono text-[10px] text-zinc-600">{item.role}</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-500">
                        {item.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nothing planned yet — set planned semesters.</p>
        )}
        {meta.notes && (
          <p className="mt-3 shrink-0 truncate text-[11px] text-zinc-600" title={meta.notes}>
            {meta.notes}
          </p>
        )}
      </section>
    </div>
  );
}

/* ── week (timetable) — fills the pane, positions in percent ── */

export function Timetable({
  classes,
  colorOf,
}: {
  classes: SemClass[];
  colorOf: (sc: SemClass) => string;
}) {
  const slots = classes.flatMap((sc) => sc.schedule.map((s) => ({ ...s, sc })));
  if (!slots.length)
    return <p className="py-6 text-sm text-zinc-500">No schedule yet — connect the workspace.</p>;
  const minH = Math.floor(Math.min(...slots.map((s) => minutes(s.start))) / 60);
  const maxH = Math.ceil(Math.max(...slots.map((s) => minutes(s.end))) / 60);
  const span = Math.max(maxH - minH, 1);
  const pct = (h: number) => `${((h - minH) / span) * 100}%`;
  // Days come from the data: at least Mon–Fri, plus any weekend day with a class.
  const used = new Set(slots.map((s) => s.day));
  const days = DAY_ORDER.filter((d, i) => i < 5 || used.has(d));
  const today = new Date().getDay();
  const now = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div className="flex h-[560px] min-h-0 gap-2 lg:h-full">
      <div className="flex w-10 shrink-0 flex-col">
        <div className="h-5 shrink-0" />
        <div className="relative min-h-0 flex-1">
          {Array.from({ length: span + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-zinc-600"
              style={{ top: pct(minH + i) }}
            >
              {String(minH + i).padStart(2, "0")}h
            </span>
          ))}
        </div>
      </div>
      {days.map((day) => {
        const dayIsToday = JS_DAY[day] === today;
        const daySlots = slots.filter((s) => s.day === day);
        return (
          <div key={day} className="flex min-w-0 flex-1 flex-col">
            <p
              className={`h-5 shrink-0 text-center font-mono text-[11px] ${
                dayIsToday ? "font-semibold text-accent" : "text-zinc-600"
              }`}
            >
              {DAY_LABELS[day]}
            </p>
            <div
              className={`relative min-h-0 flex-1 rounded-xl ${
                dayIsToday ? "bg-accent/[0.05]" : "bg-white/[0.02]"
              }`}
            >
              {Array.from({ length: span - 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 h-px bg-white/[0.04]"
                  style={{ top: pct(minH + i + 1) }}
                />
              ))}
              {dayIsToday && now >= minH && now <= maxH && (
                <div className="absolute inset-x-0 z-10 h-px bg-accent" style={{ top: pct(now) }} />
              )}
              {daySlots.map((slot, i) => {
                const start = minutes(slot.start) / 60;
                const end = minutes(slot.end) / 60;
                const color = colorOf(slot.sc);
                return (
                  <div
                    key={i}
                    className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5"
                    style={{
                      top: `calc(${pct(start)} + 2px)`,
                      height: `calc(${((end - start) / span) * 100}% - 4px)`,
                      backgroundColor: `${color}26`,
                      borderLeft: `3px solid ${color}`,
                    }}
                    title={`${slot.sc.code} · ${slot.sc.name}\n${slot.start}–${slot.end} · ${slot.room ?? ""}`}
                  >
                    <p className="truncate font-mono text-[11px] font-semibold text-zinc-100">
                      {slot.sc.code}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-zinc-300">
                      {slot.sc.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-zinc-500">
                      {slot.room} · {slot.start}–{slot.end}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── classes info — master–detail, mirroring the grades page ── */

function ClassNav({
  classes,
  colorOf,
  selected,
  onSelect,
}: {
  classes: SemClass[];
  colorOf: (sc: SemClass) => string;
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {classes.map((sc) => {
        const active = sc.code === selected;
        return (
          <button
            key={sc.code}
            onClick={() => onSelect(sc.code)}
            className={`block w-full rounded-xl px-3 py-2.5 text-left transition-all ${
              active ? "bg-white/[0.06] ring-1 ring-white/10" : "hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorOf(sc) }}
                />
                <span className="truncate">
                  <span className="mr-1.5 font-mono text-xs text-zinc-500">{sc.code}</span>
                  {sc.name}
                </span>
              </span>
              {sc.pending > 0 && (
                <span
                  className={`shrink-0 font-mono text-xs ${active ? "text-zinc-100" : "text-zinc-500"}`}
                >
                  {sc.pending}
                </span>
              )}
            </div>
            <p className="mt-1 truncate pl-[18px] font-mono text-[10px] text-zinc-600">
              {sc.turma && `t. ${sc.turma} · `}
              {sc.credits != null && `${sc.credits} cr`}
              {sc.kind && sc.kind !== "obrigatoria" && ` · ${sc.kind}`}
            </p>
          </button>
        );
      })}
    </nav>
  );
}

function Line({
  label,
  edited = false,
  children,
}: {
  label: string;
  /** Value comes from an Edu edit, not the workspace — say so (2026-09-14). */
  edited?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-2 text-sm">
      <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
        {label}
        {edited && (
          <span className="ml-1.5 text-accent/70" title="edited in Edu">
            ·
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-zinc-300">{children}</span>
    </div>
  );
}

function ClassDetail({ sc, color }: { sc: SemClass; color: string }) {
  const edited = (k: string) => sc.edited.includes(k);
  return (
    <div className="animate-msg-in">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold text-zinc-100">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate">
              <span className="mr-2 font-mono text-sm text-zinc-500">{sc.code}</span>
              {sc.name}
            </span>
          </h3>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {[
              sc.semester,
              sc.turma && `turma ${sc.turma}`,
              sc.credits != null && `${sc.credits} cr`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {sc.anchor && (
            <span
              className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan-300"
              title="anchor — unlocks next semester"
            >
              ⚑ unlocks {sc.anchor}
            </span>
          )}
          {sc.kind && sc.kind !== "obrigatoria" && (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {sc.kind}
            </span>
          )}
          {sc.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-400"
            >
              ⚠ {flag}
            </span>
          ))}
        </span>
      </div>

      <div className="mt-5 divide-y divide-white/[0.04]">
        {sc.professor && (
          <Line label="professor" edited={edited("professor") || edited("contact")}>
            {sc.professor}
            {sc.contact && (
              <a
                href={sc.contact.includes("@") ? `mailto:${sc.contact}` : sc.contact}
                className="ml-2 font-mono text-xs text-cyan-300 hover:underline"
              >
                {sc.contact}
              </a>
            )}
          </Line>
        )}
        {sc.evaluation && (
          <Line label="grading" edited={edited("evaluation")}>
            {sc.evaluation}
          </Line>
        )}
        <Line label="schedule" edited={edited("schedule")}>
          <span className="space-y-0.5 font-mono text-xs">
            {sc.schedule.map((s, i) => (
              <span key={i} className="block">
                {DAY_LABELS[s.day] ?? s.day} {s.start}–{s.end}
                {s.room && <span className="text-zinc-600"> · {s.room}</span>}
              </span>
            ))}
          </span>
        </Line>
        {(sc.platform_url || sc.links.length > 0) && (
          <Line label="links" edited={edited("links") || edited("platform_url")}>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {sc.platform_url && (
                <a
                  href={sc.platform_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                >
                  {sc.platform ?? "platform"} <LinkOutIcon className="h-3 w-3" />
                </a>
              )}
              {sc.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                >
                  {link.label} <LinkOutIcon className="h-3 w-3" />
                </a>
              ))}
            </span>
          </Line>
        )}
      </div>

      <div className="mt-6">
        <h4 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Workspace deliveries
        </h4>
        {sc.work_items.length ? (
          <div className="divide-y divide-white/[0.04]">
            {sc.work_items.map((item) => (
              <div key={item.path} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-zinc-300" title={item.path}>
                  {item.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                  {item.date}
                  <span className="text-zinc-600"> · {item.files} files</span>
                  {item.has_pdf && <span className="text-emerald-400"> · pdf ✓</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Nothing produced with Claude yet.</p>
        )}
      </div>
    </div>
  );
}

/* ── panel ─────────────────────────────────────────────────── */

const TABS = [
  { key: "fluxogram", label: "fluxogram" },
  { key: "plan", label: "plan" },
  { key: "week", label: "week" },
  { key: "classes", label: "classes info" },
] as const;
type CollegeTab = (typeof TABS)[number]["key"];

export function CollegePanel({
  data,
  colors,
}: {
  data: CollegeResponse;
  colors: Map<number, string>;
}) {
  const [tab, setTab] = useState<CollegeTab>("fluxogram");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const { classes, plan } = data;
  const colorOf = (sc: SemClass) => (sc.course_id != null && colors.get(sc.course_id)) || "#71717a";
  const selected = classes.find((sc) => sc.code === selectedClass) ?? classes[0];

  return (
    <div className="flex lg:h-full min-h-0 flex-col">
      <div className="mb-5 flex shrink-0 justify-center">
        <div className="flex rounded-lg bg-white/[0.05] p-0.5 font-mono text-[11px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 transition-colors ${
                tab === t.key ? "bg-accent/20 text-cyan-300" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* keyed by tab so each view eases in on switch; fills the pane */}
      <div key={tab} className="animate-msg-in min-h-0 flex-1">
        {tab === "fluxogram" && <Fluxogram plan={plan} />}
        {tab === "plan" && <Plan plan={plan} />}
        {tab === "week" && <Timetable classes={classes} colorOf={colorOf} />}
        {tab === "classes" && selected && (
          <div className="grid lg:h-full min-h-0 gap-8 lg:grid-cols-3 lg:gap-12">
            <aside className="min-h-0 lg:overflow-y-auto">
              <ClassNav
                classes={classes}
                colorOf={colorOf}
                selected={selected.code}
                onSelect={setSelectedClass}
              />
            </aside>
            <section className="min-h-0 lg:overflow-y-auto lg:col-span-2">
              <ClassDetail key={selected.code} sc={selected} color={colorOf(selected)} />
            </section>
          </div>
        )}
        {tab === "classes" && !selected && (
          <p className="py-6 text-sm text-zinc-500">No classes yet — connect the workspace.</p>
        )}
      </div>
    </div>
  );
}

/** "now: EEL770 · H-213 · until 17:00" / "next: …" for the tasks-tab hero. */
export function nextClass(classes: SemClass[]): string | null {
  const now = new Date();
  for (let offset = 0; offset < 7; offset++) {
    const day = (now.getDay() + offset) % 7;
    const dayName = Object.keys(JS_DAY).find((k) => JS_DAY[k] === day)!;
    const slots = classes
      .flatMap((sc) => sc.schedule.map((s) => ({ ...s, sc })))
      .filter((s) => s.day === dayName)
      .sort((a, b) => minutes(a.start) - minutes(b.start));
    const mins = now.getHours() * 60 + now.getMinutes();
    for (const slot of slots) {
      if (offset === 0 && minutes(slot.end) <= mins) continue;
      if (offset === 0 && minutes(slot.start) <= mins)
        return `now: ${slot.sc.code} · ${slot.room} · until ${slot.end}`;
      const prefix =
        offset === 0 ? "next" : offset === 1 ? "tomorrow" : (DAY_LABELS[dayName] ?? dayName);
      return `${prefix}: ${slot.sc.code} · ${slot.room} · ${slot.start}`;
    }
  }
  return null;
}
