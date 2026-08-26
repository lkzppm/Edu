"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm ${className}`}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="font-display text-sm font-semibold tracking-wide text-zinc-100">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary:
      "bg-accent hover:bg-cyan-400 text-[#03191e] shadow-glow-sm disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none",
    ghost:
      "bg-transparent border border-white/10 hover:border-white/30 text-zinc-200 disabled:text-zinc-600",
    danger:
      "bg-transparent border border-red-900/60 hover:border-red-500/70 text-red-400 disabled:text-zinc-600",
  }[variant];
  return (
    <button
      className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function LineInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border-b border-white/10 bg-transparent py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-accent ${className}`}
      {...props}
    />
  );
}

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-400", text: "text-emerald-400", label: "connected" },
  syncing: { dot: "bg-accent animate-pulse", text: "text-cyan-300", label: "syncing…" },
  error: { dot: "bg-red-500", text: "text-red-400", label: "error" },
  never: { dot: "bg-zinc-600", text: "text-zinc-500", label: "not connected" },
  stale: { dot: "bg-amber-400", text: "text-amber-400", label: "stale" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? STATUS.never;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${s.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}

/* ── Inline icons (24×24 stroke) ─────────────────────────── */

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PlugIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 22v-4" />
    <path d="M9 7V2" />
    <path d="M15 7V2" />
    <path d="M6 7h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z" />
  </Icon>
);

export const CloseIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

export const PlusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

export const RefreshIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Icon>
);

export const TrashIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);

/** Graduation cap — Google Classroom. */
export const CapIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
    <path d="M22 10v6" />
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </Icon>
);

/** Open book — Moodle. */
export const BookIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </Icon>
);

export const GlobeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Icon>
);

export const ClaudeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 3v18" />
    <path d="M3 12h18" />
    <path d="M5.9 5.9l12.2 12.2" />
    <path d="M18.1 5.9L5.9 18.1" />
  </Icon>
);

export const CompassIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </Icon>
);

export const CalendarIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </Icon>
);

export const CheckIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const LinkOutIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
);

export const EyeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <path d="m2 2 20 20" />
  </Icon>
);
