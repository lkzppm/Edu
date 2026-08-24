"use client";

import { FormEvent, useState } from "react";
import { Button, CheckIcon, LinkOutIcon, LineInput } from "@/components/ui";
import { api } from "@/lib/api";
import { dueGroup, fmtDue, fmtRelative, GROUP_LABELS, GROUP_ORDER } from "@/lib/format";
import { Task } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  assignment: "tarefa",
  quiz: "quiz",
  exam: "prova",
  event: "evento",
  activity: "atividade",
  manual: "pessoal",
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

export function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), due_at: due || null }),
      });
      setTitle("");
      setDue("");
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-3">
      <div className="flex-1">
        <LineInput
          placeholder="Add a personal to-do…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <input
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        aria-label="due date"
        className="border-b border-white/10 bg-transparent py-2 font-mono text-xs text-zinc-400 outline-none transition-colors [color-scheme:dark] focus:border-accent"
      />
      <Button type="submit" disabled={busy || !title.trim()}>
        Add
      </Button>
    </form>
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
        Nothing here yet — connect a platform or add a to-do above.
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
    <div className="space-y-7">
      {GROUP_ORDER.map((group) => {
        const list = groups.get(group)!;
        if (!list.length) return null;
        return (
          <div key={group}>
            <h3
              className={`mb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] ${
                group === "overdue"
                  ? "text-red-400"
                  : group === "today"
                    ? "text-accent"
                    : "text-zinc-500"
              }`}
            >
              {GROUP_LABELS[group]}
              <span className="ml-2 font-mono text-[10px] text-zinc-600">{list.length}</span>
            </h3>
            <div>
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
          </div>
        );
      })}
    </div>
  );
}
