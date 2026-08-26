"use client";

import { useState } from "react";
import { LinkOutIcon } from "@/components/ui";
import { CollegeResponse, PlanCourse, SemClass } from "@/lib/types";

const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };
const JS_DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const HOUR_PX = 44;

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

/** Status palette, app semantics: emerald = banked, accent = in course,
 * zinc = ahead, amber ring = dispensa at risk. Never color alone. */
const NODE_STYLE: Record<string, { bg: string; edge: string; text: string }> = {
  dispensada: { bg: "bg-emerald-400/[0.08]", edge: "#34d399", text: "text-emerald-300" },
  em_curso: { bg: "bg-accent/[0.10]", edge: "#22b8cf", text: "text-cyan-300" },
  a_cursar: { bg: "bg-white/[0.03]", edge: "#3f3f46", text: "text-zinc-400" },
};

function StatusLegend() {
  return (
    <span className="font-mono text-[10px] text-zinc-600">
      <span className="text-emerald-400">●</span> banked · <span className="text-cyan-300">●</span>{" "}
      in course · ● ahead · <span className="text-amber-400">⚠</span> dispensa at risk
    </span>
  );
}

/** One course as a flowchart node — status fill, left color edge, ⚠ ring. */
function CourseNode({ course, status }: { course: PlanCourse; status?: string }) {
  const style = NODE_STYLE[status ?? course.status ?? "a_cursar"] ?? NODE_STYLE.a_cursar;
  const tooltip = [course.name, course.planned && `planned ${course.planned}`, course.note]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 ${style.bg} ${
        course.at_risk ? "ring-1 ring-amber-400/50" : ""
      }`}
      style={{ borderLeft: `3px solid ${style.edge}` }}
      title={tooltip}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[11px] font-semibold ${style.text}`}>
          {course.code}
          {course.at_risk && <span className="ml-1 text-amber-400">⚠</span>}
          {course.unlocks && (
            <span className="ml-1 text-cyan-300" title={`anchor — unlocks ${course.unlocks}`}>
              ⚑
            </span>
          )}
        </span>
        {course.credits != null && (
          <span className="font-mono text-[10px] text-zinc-600">{course.credits}</span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-400" title={course.name}>
        {course.name}
      </p>
      {(course.planned || course.note) && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">
          {course.planned ?? course.note}
        </p>
      )}
    </div>
  );
}

/* ── fluxogram ─────────────────────────────────────────────── */

function Fluxogram({ plan }: { plan: CollegeResponse["plan"] }) {
  if (!plan.curriculum) return null;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <SectionTitle>Curriculum fluxogram</SectionTitle>
        <StatusLegend />
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: plan.curriculum.length * 148 }}>
          {plan.curriculum.map((period) => {
            const credits = period.courses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
            const done = period.courses.filter((c) => c.status === "dispensada").length;
            return (
              <div key={period.period} className="w-36 shrink-0">
                <div className="mb-2 flex items-baseline justify-between px-0.5">
                  <span className="font-mono text-sm font-semibold text-zinc-200">
                    P{String(period.period).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-600">
                    {done}/{period.courses.length} · {credits} cr
                  </span>
                </div>
                <div className="space-y-1.5">
                  {period.courses.map((course) => (
                    <CourseNode key={course.code} course={course} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── plan (degree progress + forward semesters + requirements) ── */

function Meter({ label, done, inCourse, required, unit }: {
  label: string;
  done: number;
  inCourse: number;
  required: number;
  unit: string;
}) {
  const pct = (v: number) => `${required ? Math.min((v / required) * 100, 100) : 0}%`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-[11px] text-zinc-500">
          {done}
          {inCourse > 0 && <span className="text-cyan-300">+{inCourse}</span>}
          <span className="text-zinc-600">
            {" "}
            / {required} {unit}
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

function Plan({ plan }: { plan: CollegeResponse["plan"] }) {
  const summary = plan.summary;
  const statusByCode = new Map<string, string>();
  for (const period of plan.curriculum ?? [])
    for (const course of period.courses) statusByCode.set(course.code, course.status ?? "a_cursar");

  return (
    <div className="space-y-12">
      {summary && (
        <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="min-w-0 flex-1">
            <SectionTitle>Degree</SectionTitle>
            <p className="mt-1 text-sm text-zinc-400">
              {plan.meta?.program} · graduation {plan.meta?.graduation_target}
            </p>
            <div className="mt-3 flex h-2.5 max-w-md gap-[2px] overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="bg-emerald-400/80"
                style={{ width: `${(summary.credits.dispensada / summary.total_credits) * 100}%` }}
              />
              <div
                className="bg-accent/70"
                style={{ width: `${(summary.credits.em_curso / summary.total_credits) * 100}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-500">
              <span className="text-emerald-400">{summary.credits.dispensada} cr banked</span>
              {" · "}
              <span className="text-cyan-300">{summary.credits.em_curso} cr in course</span>
              {" · "}
              {summary.credits.a_cursar} cr ahead
            </p>
          </div>
          <p className="shrink-0 font-mono text-6xl font-semibold tracking-tight text-zinc-100">
            {summary.done_pct != null ? `${Math.round(summary.done_pct)}%` : "—"}
          </p>
        </section>
      )}

      {plan.forward && plan.forward.length > 0 && (
        <section>
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <SectionTitle>Road to graduation</SectionTitle>
            <StatusLegend />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plan.forward.map((step, i) => (
              <div key={step.semester} className="relative">
                <p className="font-mono text-sm font-semibold text-zinc-100">
                  {step.semester}
                  {i === 0 && <span className="ml-2 text-[10px] text-cyan-300">now</span>}
                </p>
                <p className="mb-3 mt-0.5 text-[11px] text-zinc-500">{step.note}</p>
                <div className="space-y-1.5">
                  {step.courses.map((course, j) => (
                    <CourseNode
                      key={`${course.code}-${j}`}
                      course={course}
                      status={
                        course.role === "optativa" || course.role === "projeto" || course.role === "ace"
                          ? i === 0
                            ? "em_curso"
                            : "a_cursar"
                          : statusByCode.get(course.code)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {plan.requirements && summary && (
        <section>
          <div className="mb-5">
            <SectionTitle>Requirements</SectionTitle>
          </div>
          <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {plan.requirements.map((req) =>
              req.key === "obrigatorias" ? (
                <Meter
                  key={req.key}
                  label={req.label}
                  done={summary.credits.dispensada}
                  inCourse={summary.credits.em_curso}
                  required={summary.total_credits}
                  unit="cr"
                />
              ) : (
                <Meter
                  key={req.key}
                  label={req.label}
                  done={req.done ?? 0}
                  inCourse={req.in_course ?? 0}
                  required={req.required ?? 0}
                  unit={req.unit}
                />
              )
            )}
          </div>
          {plan.meta?.notes && (
            <p className="mt-6 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
              {plan.meta.notes}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/* ── week (timetable) ──────────────────────────────────────── */

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
  const minH = Math.min(...slots.map((s) => minutes(s.start))) / 60;
  const maxH = Math.max(...slots.map((s) => minutes(s.end))) / 60;
  const height = (maxH - minH) * HOUR_PX;
  const today = new Date().getDay();
  const now = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] gap-2">
        <div className="relative w-10 shrink-0" style={{ height, marginTop: 24 }}>
          {Array.from({ length: maxH - minH + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-zinc-600"
              style={{ top: i * HOUR_PX }}
            >
              {String(minH + i).padStart(2, "0")}h
            </span>
          ))}
        </div>
        {DAYS.map((day) => {
          const dayIsToday = JS_DAY[day] === today;
          const daySlots = slots.filter((s) => s.day === day);
          return (
            <div key={day} className="min-w-0 flex-1">
              <p
                className={`mb-1 text-center font-mono text-[11px] ${
                  dayIsToday ? "font-semibold text-accent" : "text-zinc-600"
                }`}
              >
                {DAY_LABELS[day]}
              </p>
              <div
                className={`relative rounded-xl ${dayIsToday ? "bg-accent/[0.05]" : "bg-white/[0.02]"}`}
                style={{ height }}
              >
                {Array.from({ length: maxH - minH - 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 h-px bg-white/[0.04]"
                    style={{ top: (i + 1) * HOUR_PX }}
                  />
                ))}
                {dayIsToday && now >= minH && now <= maxH && (
                  <div
                    className="absolute inset-x-0 z-10 h-px bg-accent"
                    style={{ top: (now - minH) * HOUR_PX }}
                  />
                )}
                {daySlots.map((slot, i) => {
                  const top = (minutes(slot.start) / 60 - minH) * HOUR_PX;
                  const blockHeight = ((minutes(slot.end) - minutes(slot.start)) / 60) * HOUR_PX;
                  const color = colorOf(slot.sc);
                  return (
                    <div
                      key={i}
                      className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5"
                      style={{
                        top: top + 2,
                        height: blockHeight - 4,
                        backgroundColor: `${color}26`,
                        borderLeft: `3px solid ${color}`,
                      }}
                      title={`${slot.sc.code} · ${slot.sc.name}\n${slot.start}–${slot.end} · ${slot.room ?? ""}`}
                    >
                      <p className="truncate font-mono text-[11px] font-semibold text-zinc-100">
                        {slot.sc.code}
                      </p>
                      <p className="truncate font-mono text-[10px] text-zinc-400">
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
    </div>
  );
}

/* ── classes info ──────────────────────────────────────────── */

function ClassCard({ sc, color }: { sc: SemClass; color: string }) {
  const latest = sc.work_items[0];
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 font-display text-sm font-semibold text-zinc-100">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate" title={sc.name}>
            {sc.name}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {sc.anchor && (
            <span
              className="rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-300"
              title={`anchor — unlocks ${sc.anchor}`}
            >
              ⚑ {sc.anchor}
            </span>
          )}
          {sc.kind === "optativa" && (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
              optativa
            </span>
          )}
          {sc.flags.length > 0 && (
            <span
              className="rounded-full bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-400"
              title={sc.flags.join(", ")}
            >
              ⚠
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">
        {sc.code} · t. {sc.turma} · {sc.credits} cr
        {sc.pending > 0 && <span className="text-zinc-400"> · {sc.pending} pending</span>}
      </p>
      {sc.professor && <p className="mt-2.5 text-xs text-zinc-400">{sc.professor}</p>}
      {sc.evaluation && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{sc.evaluation}</p>}
      <div className="mt-2.5 space-y-0.5 font-mono text-[11px] text-zinc-500">
        {sc.schedule.map((s, i) => (
          <p key={i}>
            {DAY_LABELS[s.day] ?? s.day} {s.start}–{s.end}
            <span className="text-zinc-600"> · {s.room}</span>
          </p>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[10px] text-zinc-600">
          {latest
            ? `workspace: ${sc.work_items.length} deliver${sc.work_items.length > 1 ? "ies" : "y"} · last ${latest.date}${latest.has_pdf ? " · pdf ✓" : ""}`
            : "workspace: no deliveries yet"}
        </span>
        {sc.platform_url && (
          <a
            href={sc.platform_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`open ${sc.platform ?? "platform"}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-cyan-300"
          >
            <LinkOutIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </section>
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
  const { classes, plan } = data;
  const colorOf = (sc: SemClass) =>
    (sc.course_id != null && colors.get(sc.course_id)) || "#71717a";

  return (
    <div>
      <div className="mb-8 flex justify-center">
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
      {/* keyed by tab so each view eases in on switch */}
      <div key={tab} className="animate-msg-in">
        {tab === "fluxogram" && <Fluxogram plan={plan} />}
        {tab === "plan" && <Plan plan={plan} />}
        {tab === "week" && <Timetable classes={classes} colorOf={colorOf} />}
        {tab === "classes" && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classes.map((sc) => (
              <ClassCard key={sc.code} sc={sc} color={colorOf(sc)} />
            ))}
          </div>
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
        offset === 0 ? "next" : offset === 1 ? "tomorrow" : DAY_LABELS[dayName] ?? dayName;
      return `${prefix}: ${slot.sc.code} · ${slot.room} · ${slot.start}`;
    }
  }
  return null;
}
