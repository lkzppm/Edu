"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CollegePanel, nextClass } from "@/components/college";
import { ConnectorsPanel } from "@/components/connectors-panel";
import { CoworkButton } from "@/components/cowork";
import { upcomingExams } from "@/components/exams";
import { GradesPanel } from "@/components/grades";
import { CourseLoad, dayKey, Planner } from "@/components/overview";
import { QuickAdd, TaskList, TaskView, ViewSwitch } from "@/components/tasks";
import { CalendarIcon, CloseIcon, PlugIcon, PlusIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { courseColorMap } from "@/lib/colors";
import { fmtCountdown, fmtDay, fmtDue } from "@/lib/format";
import {
  CollegeResponse,
  Course,
  ConnectorsResponse,
  GradesResponse,
  Task,
  TasksResponse,
} from "@/lib/types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
      {children}
    </h2>
  );
}

type Panel = "tasks" | "grades" | "college";

export default function Home() {
  const [panel, setPanel] = useState<Panel>("tasks");
  const [data, setData] = useState<TasksResponse | null>(null);
  const [grades, setGrades] = useState<GradesResponse | null>(null);
  const [college, setCollege] = useState<CollegeResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [connCount, setConnCount] = useState(0);
  const [cowork, setCowork] = useState<import("@/lib/types").Conn | null>(null);
  const [anySyncing, setAnySyncing] = useState(false);
  const [filterCourse, setFilterCourse] = useState<number | null>(null);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [view, setView] = useState<TaskView>("pending");
  const [showAdd, setShowAdd] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tasksRes, coursesRes, connRes, gradesRes, collegeRes] = await Promise.all([
        api<TasksResponse>("/tasks"),
        api<Course[]>("/courses"),
        api<ConnectorsResponse>("/connectors"),
        api<GradesResponse>("/grades"),
        api<CollegeResponse>("/college"),
      ]);
      setData(tasksRes);
      setGrades(gradesRes);
      setCollege(collegeRes);
      setCourses(coursesRes.filter((c) => !c.hidden));
      setCowork(connRes.connectors.find((c) => c.name === "cowork") ?? null);
      setConnCount(connRes.connectors.filter((c) => c.name !== "cowork").length);
      setAnySyncing(connRes.connectors.some((c) => c.sync_status === "syncing"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    load();
    // Page open kicks a background sync of anything stale (>15 min) — the
    // syncing fast-poll below picks up the results, no manual sync needed.
    api("/connectors/refresh", { method: "POST" })
      .then(() => load())
      .catch(() => {});
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // While a sync is in flight, poll faster so results land quickly.
  useEffect(() => {
    if (!anySyncing) return;
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [anySyncing, load]);

  const colors = useMemo(() => courseColorMap(courses.map((c) => c.id)), [courses]);

  const allTasks = data?.tasks ?? [];
  const tasks = useMemo(
    () =>
      filterCourse == null ? allTasks : allTasks.filter((t) => t.course_id === filterCourse),
    [allTasks, filterCourse]
  );

  const exams = useMemo(() => upcomingExams(tasks), [tasks]);
  const nextExam = exams[0];

  // Day filter (from the week strip) narrows the task list only — the hero,
  // exams and workload keep showing the whole picture.
  const listTasks = useMemo(
    () =>
      filterDay == null
        ? tasks
        : tasks.filter((t) => t.due_at != null && dayKey(t.due_at) === filterDay),
    [tasks, filterDay]
  );

  const toggle = async (task: Task) => {
    const next = task.status === "done" ? "todo" : "done";
    // Optimistic — instant check, then PATCH; reload reconciles.
    setData((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
          }
        : prev
    );
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    } finally {
      load();
    }
  };

  const dismiss = async (task: Task) => {
    if (task.kind === "manual") {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
    } else {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed" }),
      });
    }
    load();
  };

  const summary = data?.summary;
  const upcoming = useMemo(
    () => (college ? nextClass(college.classes) : null),
    [college]
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-28">
      {/* Navbar */}
      <header className="flex items-center justify-between py-6">
        <h1 className="flex-1 font-display text-xl font-semibold tracking-tight">
          Edu<span className="text-accent">.</span>
        </h1>
        <nav className="flex gap-1 rounded-xl bg-white/[0.04] p-1 font-display text-xs font-medium">
          {(["tasks", "grades", "college"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              className={`rounded-lg px-4 py-1.5 capitalize transition-colors ${
                panel === p
                  ? "bg-accent/15 text-cyan-300"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-1">
        <CoworkButton
          conn={cowork}
          classesCount={college?.classes.length ?? 0}
          deliveries={(college?.classes ?? []).reduce((n, c) => n + c.work_items.length, 0)}
          onChanged={load}
        />
        <button
          onClick={() => setPanelOpen(true)}
          className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
          aria-label="Connectors"
        >
          <PlugIcon className="h-5 w-5" />
          {connCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent font-mono text-[9px] font-semibold text-[#03191e]">
              {connCount}
            </span>
          )}
        </button>
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-sm text-amber-400">
          {error} — showing last-loaded data.
        </p>
      )}

      {panel === "grades" && (
        <div className="animate-msg-in pt-4">
          <GradesPanel courses={grades?.courses ?? []} colors={colors} />
        </div>
      )}

      {panel === "college" && college && (
        <div className="animate-msg-in pt-4">
          <CollegePanel data={college} colors={colors} />
        </div>
      )}

      {panel === "tasks" && (
        <div className="animate-msg-in">
      {/* Hero: week count · 7-day strip · next test */}
      <section className="flex flex-col gap-10 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="shrink-0">
          <SectionTitle>This week</SectionTitle>
          <p className="mt-2 font-mono text-5xl font-semibold tracking-tight sm:text-6xl">
            {summary ? summary.due_week : "—"}
            <span className="ml-2 text-lg font-normal text-zinc-500">due</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary != null && summary.overdue > 0 && (
              <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-400">
                {summary.overdue} overdue
              </span>
            )}
            {summary != null && summary.due_today > 0 && (
              <span className="rounded-full bg-accent/10 px-2.5 py-1 font-mono text-xs text-cyan-300">
                {summary.due_today} today
              </span>
            )}
            {summary != null && summary.done_week > 0 && (
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 font-mono text-xs text-emerald-400">
                {summary.done_week} done · 7d
              </span>
            )}
          </div>
          {upcoming && (
            <p className="mt-4 font-mono text-xs text-zinc-500">
              <span className="text-zinc-600">class </span>
              {upcoming}
            </p>
          )}
        </div>

        <div className="min-w-0 lg:mx-8 lg:flex-1">
          <Planner
            tasks={tasks}
            courses={courses}
            colors={colors}
            selected={filterDay}
            onSelect={setFilterDay}
          />
        </div>

        {nextExam && (
          <div className="shrink-0 lg:text-right">
            <p className="inline-flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              <CalendarIcon className="h-3.5 w-3.5" /> Next test
            </p>
            <p className="mt-2 font-mono text-4xl font-semibold text-zinc-100">
              {fmtCountdown(nextExam.due_at!)}
            </p>
            <p className="mt-1 max-w-[280px] truncate text-sm text-zinc-400 lg:ml-auto">
              {nextExam.title}
              <span className="text-zinc-600"> · {fmtDue(nextExam.due_at!)}</span>
            </p>
          </div>
        )}
      </section>

      {/* Tasks + sidebar */}
      <div className="mt-14 grid gap-14 lg:grid-cols-3 lg:gap-10">
        <section className="lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SectionTitle>Tasks</SectionTitle>
              {filterCourse != null && (
                <button
                  onClick={() => setFilterCourse(null)}
                  className="animate-chip-in inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `${colors.get(filterCourse) ?? "#71717a"}22`,
                    color: colors.get(filterCourse) ?? "#a1a1aa",
                  }}
                  title="clear course filter"
                >
                  {(() => {
                    const c = courses.find((x) => x.id === filterCourse);
                    return c?.code ?? c?.name ?? "course";
                  })()}
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
              {filterDay != null && (
                <button
                  onClick={() => setFilterDay(null)}
                  className="animate-chip-in inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-cyan-300 transition-colors hover:bg-accent/20"
                  title="clear day filter"
                >
                  {fmtDay(new Date(filterDay).toISOString())}
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <ViewSwitch
                view={view}
                counts={{
                  pending: listTasks.filter((t) => t.status === "todo").length,
                  done: listTasks.filter((t) => t.status === "done").length,
                }}
                onChange={setView}
              />
              <button
                onClick={() => setShowAdd(!showAdd)}
                className={`inline-flex items-center gap-1 font-mono text-[11px] transition-colors ${
                  showAdd ? "text-accent" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <PlusIcon
                  className={`h-3 w-3 transition-transform duration-200 ${
                    showAdd ? "rotate-45" : ""
                  }`}
                />
                add
              </button>
            </div>
          </div>
          {showAdd && (
            <div className="mb-6 animate-msg-in">
              <QuickAdd
                onAdded={() => {
                  setShowAdd(false);
                  load();
                }}
              />
            </div>
          )}
          {data ? (
            <TaskList
              // remount on any filter/view change so the list eases in
              key={`${view}-${filterDay ?? "all"}-${filterCourse ?? "all"}`}
              tasks={listTasks}
              colors={colors}
              view={view}
              onToggle={toggle}
              onDismiss={dismiss}
            />
          ) : (
            <p className="py-6 text-sm text-zinc-500">Loading…</p>
          )}
        </section>

        <aside className="space-y-12">
          {courses.length > 0 && (
            <section>
              <div className="mb-5">
                <SectionTitle>Workload</SectionTitle>
              </div>
              <CourseLoad
                courses={courses}
                colors={colors}
                selected={filterCourse}
                onSelect={setFilterCourse}
              />
            </section>
          )}
        </aside>
      </div>
        </div>
      )}

      <ConnectorsPanel open={panelOpen} onClose={() => setPanelOpen(false)} onChanged={load} />
    </main>
  );
}
