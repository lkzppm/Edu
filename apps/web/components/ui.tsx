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
  // The official Claude sunburst mark (Simple Icons path), filled.
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
  </svg>
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

export const SendIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </Icon>
);

export const StopIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Icon>
);

export const HistoryIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </Icon>
);

export const ArrowDownIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Icon>
);

export const BrainIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
  </Icon>
);

export const BoltIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </Icon>
);

export const SearchIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const ListIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </Icon>
);

export const PercentIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M19 5 5 19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </Icon>
);
