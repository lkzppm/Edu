"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, CheckIcon, CloseIcon, LinkOutIcon, LineInput } from "@/components/ui";
import { api } from "@/lib/api";
import { dueGroup, fmtDay, fmtDue, fmtRelative, GROUP_LABELS, GROUP_ORDER } from "@/lib/format";
import { Course, Task } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  assignment: "assignment",
  quiz: "quiz",
  exam: "exam",
  event: "event",
  activity: "activity",
  manual: "personal",
};

function KindTag({ kind }: { kind: string }) {
  const emphatic = kind === "exam" || kind === "quiz";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        emphatic ? "bg-accent/10 text-cyan-300" : "bg-white/[0.05] text-zinc-500"
      }`}
    >
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

function TaskRow({
  task,
  color,
  onToggle,
  onDismiss,
}: {
  task: Task;
  color: string | undefined;
  onToggle: (task: Task) => void;
  onDismiss: (task: Task) => void;
}) {
  const done = task.status === "done";
  const overdue = !done && task.due_at != null && new Date(task.due_at).getTime() < Date.now();
  return (
    <div
      className={`group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03] ${
        done ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={() => onToggle(task)}
        aria-label={done ? "mark as to-do" : "mark as done"}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-all ${
          done
            ? "border-accent bg-accent text-[#03191e]"
            : "border-zinc-600 text-transparent hover:border-accent hover:text-accent/60"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm ${done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
            {task.title}
          </span>
          <KindTag kind={task.kind} />
          {task.source_status && (
            <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-400">
              {task.source_status}
              {task.grade != null && ` ${task.grade}${task.max_grade ? `/${task.max_grade}` : ""}`}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {task.course_name && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color ?? "#71717a" }}
              />
              {task.course_code ?? task.course_name}
            </span>
          )}
          {task.due_at && (
            <span className={`font-mono ${overdue ? "text-red-400" : ""}`}>
              {fmtDue(task.due_at)} · {fmtRelative(task.due_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noreferrer"
            aria-label="open on the platform"
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-cyan-300"
          >
            <LinkOutIcon className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          onClick={() => onDismiss(task)}
          aria-label={task.kind === "manual" ? "delete" : "dismiss"}
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-red-400"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
      {children}
    </p>
  );
}

/** Manual to-do form as a centered popup — title, the class it belongs to,
 * due date and optional notes. Esc or a backdrop click closes it. */
export function AddTaskDialog({
  open,
  courses,
  colors,
  defaultCourseId,
  onClose,
  onAdded,
}: {
  open: boolean;
  courses: Course[];
  colors: Map<number, string>;
  defaultCourseId: number | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [courseId, setCourseId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form on every open; the active course filter is the natural default.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDue("");
    setNotes("");
    setError(null);
    setCourseId(defaultCourseId);
  }, [open, defaultCourseId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: notes.trim(),
          due_at: due || null,
          course_id: courseId,
        }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add the task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        onClick={onClose}
        className="animate-fade-in fixed inset-0 bg-[#030b0e]/70 backdrop-blur-sm"
      />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        className="animate-msg-in relative my-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#08161b]/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wide text-zinc-100">
            New task
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <FieldLabel>What</FieldLabel>
            <LineInput
              autoFocus
              placeholder="Read chapter 4…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Class</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCourseId(null)}
                className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  courseId == null
                    ? "bg-white/[0.09] text-zinc-100"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                personal
              </button>
              {courses.map((c) => {
                const color = colors.get(c.id) ?? "#71717a";
                const on = courseId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCourseId(c.id)}
                    title={c.name}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors"
                    style={{
                      backgroundColor: on ? `${color}26` : "transparent",
                      color: on ? color : "#a1a1aa",
                    }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: color, opacity: on ? 1 : 0.5 }}
                    />
                    {c.code ?? c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel>Due</FieldLabel>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="due date"
              className="w-full border-b border-white/10 bg-transparent py-2 font-mono text-xs text-zinc-300 outline-none transition-colors [color-scheme:dark] focus:border-accent"
            />
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full resize-none border-b border-white/10 bg-transparent py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>

        {error && <p className="mt-5 text-sm text-red-400">{error}</p>}

        <div className="mt-7 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? "Adding…" : "Add task"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export type TaskView = "pending" | "done";

/** Pending | Done segmented switch — one view at a time, never a pile at the
 * bottom of the page. */
export function ViewSwitch({
  view,
  counts,
  onChange,
}: {
  view: TaskView;
  counts: { pending: number; done: number };
  onChange: (view: TaskView) => void;
}) {
  return (
    <div className="flex rounded-lg bg-white/[0.05] p-0.5 font-mono text-[11px]">
      {(["pending", "done"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            view === v
              ? "bg-accent/20 text-cyan-300"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {v} <span className="text-zinc-600">{counts[v]}</span>
        </button>
      ))}
    </div>
  );
}

export function TaskList({
  tasks,
  colors,
  view,
  onToggle,
  onDismiss,
}: {
  tasks: Task[];
  colors: Map<number, string>;
  view: TaskView;
  onToggle: (task: Task) => void;
  onDismiss: (task: Task) => void;
}) {
  const [opened, setOpened] = useState<Partial<Record<string, boolean>>>({});
  const pending = tasks.filter((t) => t.status === "todo");
  const done = tasks
    .filter((t) => t.status === "done")
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime()
    );

  if (!tasks.length)
    return (
      <p className="py-6 text-sm text-zinc-500">
        Nothing here yet — connect a platform or add a to-do with + add.
      </p>
    );

  if (view === "done") {
    if (!done.length)
      return <p className="py-6 text-sm text-zinc-500">Nothing done yet — get to work!</p>;
    return (
      <div className="animate-msg-in">
        {done.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            color={task.course_id != null ? colors.get(task.course_id) : undefined}
            onToggle={onToggle}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    );
  }

  const groups = new Map(GROUP_ORDER.map((g) => [g, [] as Task[]]));
  for (const task of pending) groups.get(dueGroup(task.due_at))!.push(task);

  if (!pending.length)
    return <p className="py-6 text-sm text-zinc-500">All clear — nothing pending.</p>;

  return (
    <div className="animate-msg-in space-y-7">
      {GROUP_ORDER.map((group) => {
        const list = groups.get(group)!;
        if (!list.length) return null;
        // The far horizon starts folded — the near-term list is the workspace;
        // "Later"/"No due date" would otherwise triple the page.
        const collapsible = (group === "later" || group === "none") && list.length > 3;
        const collapsed = collapsible && !opened[group];
        return (
          <div key={group}>
            <h3
              className={`mb-1.5 flex items-center font-display text-[11px] font-semibold uppercase tracking-[0.2em] ${
                group === "overdue"
                  ? "text-red-400"
                  : group === "today"
                    ? "text-accent"
                    : "text-zinc-500"
              }`}
            >
              {GROUP_LABELS[group]}
              <span className="ml-2 font-mono text-[10px] text-zinc-600">{list.length}</span>
              {collapsible && (
                <button
                  onClick={() => setOpened((prev) => ({ ...prev, [group]: collapsed }))}
                  className="ml-3 font-mono text-[10px] lowercase tracking-normal text-zinc-600 transition-colors hover:text-cyan-300"
                >
                  {collapsed ? "show" : "hide"}
                </button>
              )}
            </h3>
            {collapsed ? (
              <button
                onClick={() => setOpened((prev) => ({ ...prev, [group]: true }))}
                className="animate-fade-in flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                title="show these tasks"
              >
                <span className="flex items-center gap-1.5">
                  {list.slice(0, 12).map((t) => (
                    <span
                      key={t.id}
                      className={`inline-block ${
                        t.kind === "exam" || t.kind === "quiz"
                          ? "h-2 w-2 rotate-45 rounded-[1px]"
                          : "h-2 w-2 rounded-full"
                      }`}
                      style={{
                        backgroundColor:
                          (t.course_id != null && colors.get(t.course_id)) || "#71717a",
                      }}
                    />
                  ))}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {group === "later" && list[0].due_at && list[list.length - 1].due_at
                    ? `${fmtDay(list[0].due_at)} – ${fmtDay(list[list.length - 1].due_at!)}`
                    : `${list.length} tasks`}
                </span>
              </button>
            ) : (
              <div className={collapsible ? "animate-msg-in" : undefined}>
                {list.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    color={task.course_id != null ? colors.get(task.course_id) : undefined}
                    onToggle={onToggle}
                    onDismiss={onDismiss}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
