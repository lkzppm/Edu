"use client";

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
