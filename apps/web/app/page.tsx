"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatOverlay } from "@/components/chat-overlay";
import { CollegePanel, nextClass } from "@/components/college";
import { ConnectorsPanel } from "@/components/connectors-panel";
import { CoworkButton } from "@/components/cowork";
import { GradesPanel } from "@/components/grades";
import { CourseLoad, dayKey, Planner } from "@/components/overview";
import { AddTaskDialog, TaskList, TaskView, ViewSwitch } from "@/components/tasks";
import { isTest, TestsPanel } from "@/components/tests";
import { CloseIcon, PlugIcon, PlusIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { courseColorMap } from "@/lib/colors";
import { fmtDay } from "@/lib/format";
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

type Panel = "tasks" | "tests" | "grades" | "college";

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
  const [showChat, setShowChat] = useState(false);
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

  // ⌘⇧E (mac) / Ctrl+Shift+E toggles the Edu chat from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setShowChat((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const colors = useMemo(() => courseColorMap(courses.map((c) => c.id)), [courses]);

  const allTasks = data?.tasks ?? [];
  // Tests (exams) have their own tab — the Tasks tab is to-dos only.
  const tasks = useMemo(
    () =>
      allTasks.filter((t) => !isTest(t) && (filterCourse == null || t.course_id === filterCourse)),
    [allTasks, filterCourse],
  );

  // Day filter (from the week strip) narrows the task list only — the hero,
  // exams and workload keep showing the whole picture.
  const listTasks = useMemo(
    () =>
      filterDay == null
        ? tasks
        : tasks.filter((t) => t.due_at != null && dayKey(t.due_at) === filterDay),
    [tasks, filterDay],
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
        : prev,
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
  const upcoming = useMemo(() => (college ? nextClass(college.classes) : null), [college]);

  return (
    // Viewport-locked shell (2026-09-14 — Lucas: nothing should scroll the
    // page): navbar on top, the active tab fills the rest and its long lists
    // scroll inside their own panes. Below lg the tabs stack and the shell
    // itself scrolls — no-scroll is not a thing at 390px.
    <main className="mx-auto flex h-[100dvh] w-full max-w-[1400px] flex-col px-5">
      {/* Navbar */}
      <header className="flex shrink-0 items-center gap-4 py-3">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Edu<span className="text-accent">.</span>
        </h1>
        <nav className="ml-6 flex gap-0.5 text-xs">
          {(["tasks", "tests", "grades", "college"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              className={`rounded-full px-3 py-1.5 font-mono capitalize transition-colors ${
                panel === p ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
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
        <p className="mb-3 shrink-0 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-sm text-amber-400">
          {error} — showing last-loaded data.
        </p>
      )}

      {/* The active tab: fills the viewport on lg (panes scroll), stacks and scrolls below */}
      <div className="min-h-0 flex-1 lg:overflow-y-auto pb-10 pt-2 lg:overflow-hidden">
        {panel === "tests" && (
          <div key="tests" className="animate-msg-in lg:h-full min-h-0">
            <TestsPanel
              tasks={allTasks}
              courses={courses}
              classes={college?.classes ?? []}
              colors={colors}
              onChanged={load}
            />
          </div>
        )}

        {panel === "grades" && (
          <div key="grades" className="animate-msg-in lg:h-full min-h-0">
            <GradesPanel courses={grades?.courses ?? []} colors={colors} />
          </div>
        )}

        {panel === "college" && college && (
          <div key="college" className="animate-msg-in lg:h-full min-h-0">
            <CollegePanel data={college} colors={colors} />
          </div>
        )}

        {panel === "tasks" && (
          <div
            key="tasks"
            className="animate-msg-in grid lg:h-full min-h-0 gap-8 lg:grid-cols-3 lg:gap-10"
          >
            {/* main: hero line · tasks header · the list (scrolls) */}
            <section className="flex min-h-0 flex-col lg:col-span-2">
              <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div className="min-w-0">
                  <SectionTitle>This week</SectionTitle>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-4xl font-semibold tracking-tight">
                      {summary ? summary.due_week : "—"}
                      <span className="ml-2 text-base font-normal text-zinc-500">due</span>
                    </span>
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
                  </p>
                </div>
                {upcoming && (
                  <p className="font-mono text-xs text-zinc-500">
                    <span className="text-zinc-600">class </span>
                    {upcoming}
                  </p>
                )}
              </div>

              <div className="mb-3 mt-6 flex shrink-0 items-center justify-between">
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
                    onClick={() => setShowAdd(true)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    <PlusIcon className="h-3 w-3" />
                    add
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 lg:overflow-y-auto pr-1">
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
              </div>
            </section>

            {/* side: planner on top, workload below (scrolls if it must) */}
            <aside className="flex min-h-0 flex-col gap-8">
              <section className="shrink-0">
                <Planner
                  tasks={tasks}
                  courses={courses}
                  colors={colors}
                  selected={filterDay}
                  onSelect={setFilterDay}
                />
              </section>
              {courses.length > 0 && (
                <section className="flex min-h-0 flex-col">
                  <div className="mb-3 shrink-0">
                    <SectionTitle>Workload</SectionTitle>
                  </div>
                  <div className="min-h-0 flex-1 lg:overflow-y-auto pr-1">
                    <CourseLoad
                      courses={courses}
                      colors={colors}
                      selected={filterCourse}
                      onSelect={setFilterCourse}
                    />
                  </div>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>

      {/* ── Edu dot — always bottom center ─────────────────── */}
      <button
        onClick={() => setShowChat(true)}
        aria-label="Chat with Edu"
        title="Chat with Edu"
        className={`group fixed bottom-5 left-1/2 z-30 -translate-x-1/2 p-3 transition-opacity duration-300 ${
          showChat ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <span className="relative block h-3.5 w-3.5">
          <span className="absolute inset-0 block animate-ping rounded-full bg-accent opacity-30 [animation-duration:2.5s]" />
          <span className="relative block h-3.5 w-3.5 rounded-full bg-accent shadow-glow transition-transform duration-200 group-hover:scale-125" />
        </span>
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-zinc-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          ask edu <span className="ml-1 text-zinc-600">⌘⇧E</span>
        </span>
      </button>

      <AddTaskDialog
        open={showAdd}
        courses={courses}
        colors={colors}
        defaultCourseId={filterCourse}
        onClose={() => setShowAdd(false)}
        onAdded={() => {
          setShowAdd(false);
          load();
        }}
      />
      <ConnectorsPanel open={panelOpen} onClose={() => setPanelOpen(false)} onChanged={load} />
      <ChatOverlay open={showChat} onClose={() => setShowChat(false)} />
    </main>
  );
}
