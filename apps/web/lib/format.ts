const DAY_MS = 86_400_000;

/** "seg., 25 de ago." — pt-BR habits (spec/ui.md). */
export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** "25 de ago., 14:00" — time included only when it carries meaning
 * (23:59/23:00 end-of-day defaults are noise). */
export function fmtDue(iso: string): string {
  const date = new Date(iso);
  const day = fmtDay(iso);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const endOfDay = (hours === 23 && minutes >= 55) || (hours === 0 && minutes === 0);
  if (endOfDay) return day;
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    date
  );
  return `${day}, ${time}`;
}

/** Mono relative chip: "em 3 d" / "em 5 h" / "há 2 d". */
export function fmtRelative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const unit =
    abs >= DAY_MS * 2
      ? `${Math.round(abs / DAY_MS)} d`
      : abs >= 3_600_000
        ? `${Math.round(abs / 3_600_000)} h`
        : `${Math.max(1, Math.round(abs / 60_000))} min`;
  return diff >= 0 ? `em ${unit}` : `há ${unit}`;
}

/** "3d 07h" countdown for the next-test hero card. */
export function fmtCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "agora";
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / 3_600_000);
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export type DueGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export const GROUP_LABELS: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  none: "No due date",
};

export const GROUP_ORDER: DueGroup[] = ["overdue", "today", "tomorrow", "week", "later", "none"];

export function dueGroup(iso: string | null): DueGroup {
  if (!iso) return "none";
  const due = new Date(iso);
  const now = new Date();
  if (due.getTime() < now.getTime()) return "overdue";
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((due.getTime() - startOfDay.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return "week";
  return "later";
}
