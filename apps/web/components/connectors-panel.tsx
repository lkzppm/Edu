"use client";

import { ComponentType, ReactNode, useCallback, useEffect, useState } from "react";
import {
  BookIcon,
  Button,
  CapIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LineInput,
  PlusIcon,
  RefreshIcon,
  StatusBadge,
  TrashIcon,
} from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Conn, ConnectorsResponse } from "@/lib/types";

type TypeKey = "classroom" | "moodle-ufrj" | "polimoodle" | "moodle";

const TYPES: Record<
  TypeKey,
  {
    title: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
    api: "classroom" | "moodle";
    baseUrl?: string;
  }
> = {
  classroom: {
    title: "Google Classroom",
    hint: "official API, read-only OAuth",
    icon: CapIcon,
    api: "classroom",
  },
  "moodle-ufrj": {
    title: "Moodle UFRJ",
    hint: "moodle.cos.ufrj.br",
    icon: BookIcon,
    api: "moodle",
    baseUrl: "https://moodle.cos.ufrj.br",
  },
  polimoodle: {
    title: "Polimoodle",
    // The polimoodle.* hostname serves a TLS cert that doesn't cover it —
    // moodle.poli.ufrj.br is the canonical name (same site).
    hint: "moodle.poli.ufrj.br",
    icon: BookIcon,
    api: "moodle",
    baseUrl: "https://moodle.poli.ufrj.br",
  },
  moodle: {
    title: "Other Moodle",
    hint: "any Moodle site by URL",
    icon: GlobeIcon,
    api: "moodle",
  },
};

function TextBtn({
  danger = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={`text-xs text-zinc-400 transition-colors disabled:cursor-not-allowed disabled:text-zinc-700 ${
        danger ? "hover:text-red-400" : "hover:text-cyan-300"
      } ${className}`}
      {...props}
    />
  );
}

function IconBtn({
  label,
  icon: Ico,
  danger = false,
  spin = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      className={`group relative grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:text-zinc-700 ${
        danger ? "hover:text-red-400" : "hover:text-cyan-300"
      }`}
      aria-label={label}
      {...props}
    >
      <Ico className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />
      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-surface/95 px-2 py-0.5 font-mono text-[10px] text-zinc-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

/** One connected account instance. */
function AccountCard({
  conn,
  onSync,
  onDisconnect,
  busy,
}: {
  conn: Conn;
  onSync: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const Ico = conn.name === "classroom" ? CapIcon : BookIcon;
  return (
    <section className="animate-chip-in">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 font-display text-sm font-medium text-zinc-100">
          <Ico className="h-[18px] w-[18px] text-zinc-400" />
          {conn.display_name ?? conn.name}
          {conn.demo && (
            <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-400">
              demo
            </span>
          )}
        </h3>
        <StatusBadge status={conn.sync_status} />
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-2xl font-semibold">
            {conn.tasks_pending}
            <span className="ml-1.5 text-sm font-normal text-zinc-500">pending</span>
          </p>
          <p className="font-mono text-[11px] text-zinc-600">{conn.courses} course(s)</p>
        </div>
        {conn.base_url && (
          <p className="mt-1 truncate font-mono text-[11px] text-zinc-600">{conn.base_url}</p>
        )}
        {conn.last_error && <p className="mt-2 text-sm text-red-400">{conn.last_error}</p>}
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[11px] text-zinc-600">
            synced {timeAgo(conn.last_sync_at)}
          </span>
          <div className="flex items-center gap-1">
            <IconBtn
              label="sync now"
              icon={RefreshIcon}
              spin={conn.sync_status === "syncing"}
              onClick={onSync}
              disabled={busy || conn.sync_status === "syncing"}
            />
            <IconBtn
              label="disconnect"
              icon={TrashIcon}
              danger
              onClick={onDisconnect}
              disabled={busy}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ConnectorsPanel({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ConnectorsResponse | null>(null);
  const [adding, setAdding] = useState<"picker" | TypeKey | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState<"token" | "password">("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await api<ConnectorsResponse>("/connectors"));
    } catch (e) {
      setErrors((prev) => ({ ...prev, page: e instanceof Error ? e.message : "load failed" }));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 4_000);
    return () => clearInterval(id);
  }, [open, load]);

  // Lock the page behind the slide-over — only the panel scrolls.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const resetForm = () => {
    setAdding(null);
    setToken("");
    setUsername("");
    setPassword("");
    setBaseUrl("");
    setAuthMode("token");
  };

  const action = async (key: string, fn: () => Promise<unknown>, closeForm = false) => {
    setBusy(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      await fn();
      await load();
      onChanged();
      if (closeForm) resetForm();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e instanceof Error ? e.message : "failed" }));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = (conn: Conn) => {
    if (
      !window.confirm(
        `Disconnect ${conn.display_name}? Its courses and tasks will be removed from Edu.`
      )
    )
      return;
    action(`acc-${conn.id}`, () => api(`/connectors/accounts/${conn.id}`, { method: "DELETE" }));
  };

  const syncNow = (conn: Conn) =>
    action(`acc-${conn.id}`, () => api(`/connectors/accounts/${conn.id}/sync`, { method: "POST" }));

  const demo = (type: TypeKey) =>
    action(type, () => api(`/connectors/${TYPES[type].api}/demo`, { method: "POST" }), true);

  const connectClassroom = () =>
    action("classroom", async () => {
      const { url } = await api<{ url: string }>("/connectors/classroom/auth-url");
      window.location.href = url; // Google redirects back through /api/connectors/classroom/callback
    });

  const connectMoodle = (type: TypeKey) => {
    const site = TYPES[type].baseUrl ?? baseUrl;
    const body: Record<string, string> = { base_url: site };
    if (TYPES[type].baseUrl) body.display_name = TYPES[type].title;
    if (authMode === "token") body.token = token;
    else {
      body.username = username;
      body.password = password;
    }
    action(type, () => api("/connectors/moodle", { method: "POST", body: JSON.stringify(body) }), true);
  };

  const accounts = data?.connectors ?? [];

  const moodleForm = (type: TypeKey): ReactNode => {
    const preset = TYPES[type].baseUrl;
    const ready =
      (preset || baseUrl.length > 8) &&
      (authMode === "token" ? token.length > 8 : username.length > 0 && password.length > 0);
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          connectMoodle(type);
        }}
      >
        {!preset && (
          <LineInput
            placeholder="https://moodle.example.br"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
          />
        )}
        <div className="flex gap-4 font-mono text-[11px]">
          {(["token", "password"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAuthMode(mode)}
              className={`uppercase tracking-wider transition-colors ${
                authMode === mode ? "text-accent" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {mode === "token" ? "token" : "user + pass"}
            </button>
          ))}
        </div>
        {authMode === "token" ? (
          <LineInput
            type="password"
            placeholder="Web-service token (Preferences → Security keys)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        ) : (
          <>
            <LineInput
              placeholder="Moodle username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="relative">
              <LineInput
                type={showPassword ? "text" : "password"}
                placeholder="Password (exchanged for a token, never stored)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "hide password" : "show password"}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy === type || !ready}>
            Connect
          </Button>
          <TextBtn onClick={() => demo(type)} disabled={busy === type}>
            demo
          </TextBtn>
        </div>
      </form>
    );
  };

  const form = (type: TypeKey): ReactNode => {
    if (type === "classroom") {
      return (
        <div className="flex items-center gap-4">
          {data?.classroom_credentials_present ? (
            <Button onClick={connectClassroom} disabled={busy === "classroom"}>
              Sign in with Google
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">
              Add <code className="text-zinc-400">GOOGLE_CLIENT_ID</code> +{" "}
              <code className="text-zinc-400">GOOGLE_CLIENT_SECRET</code> to{" "}
              <code className="text-zinc-400">.env</code> to link the real account.
            </p>
          )}
          <TextBtn onClick={() => demo("classroom")} disabled={busy === "classroom"} className="shrink-0">
            demo
          </TextBtn>
        </div>
      );
    }
    return moodleForm(type);
  };

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#06141a] shadow-2xl transition-transform duration-300 ease-out sm:w-[480px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Connectors
          </h2>
          <div className="flex items-center gap-1">
            {data && (
              <button
                onClick={() => (adding === null ? setAdding("picker") : resetForm())}
                className={`rounded-lg p-2 transition-colors hover:bg-white/5 ${
                  adding !== null ? "text-accent" : "text-zinc-400 hover:text-zinc-100"
                }`}
                aria-label="Add connector"
              >
                <PlusIcon
                  className={`h-4 w-4 transition-transform duration-200 ${
                    adding !== null ? "rotate-45" : ""
                  }`}
                />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-9 overflow-y-auto overscroll-contain px-6 py-5">
          {errors.page && <p className="text-sm text-red-400">{errors.page}</p>}
          {!data && <p className="text-sm text-zinc-500">Loading…</p>}

          {data && accounts.length === 0 && !adding && (
            <p className="text-sm text-zinc-500">
              Nothing connected yet — add your first platform with the + button above.
            </p>
          )}

          {adding === "picker" && (
            <div className="animate-msg-in">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Choose a platform
                </p>
                <TextBtn onClick={resetForm}>cancel</TextBtn>
              </div>
              <div className="space-y-1">
                {(Object.keys(TYPES) as TypeKey[]).map((key) => {
                  const t = TYPES[key];
                  const Ico = t.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setAdding(key)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <Ico className="h-5 w-5 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-zinc-100">{t.title}</span>
                        <span className="block text-xs text-zinc-500">{t.hint}</span>
                      </span>
                      <PlusIcon className="h-4 w-4 shrink-0 text-zinc-600" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {adding !== null && adding !== "picker" && (
            <div className="animate-msg-in">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2.5 font-display text-sm font-medium text-zinc-100">
                  {(() => {
                    const Ico = TYPES[adding].icon;
                    return <Ico className="h-[18px] w-[18px] text-zinc-400" />;
                  })()}
                  {TYPES[adding].title}
                </h3>
                <TextBtn onClick={() => setAdding("picker")}>back</TextBtn>
              </div>
              {form(adding)}
              {errors[adding] && <p className="mt-2 text-sm text-red-400">{errors[adding]}</p>}
            </div>
          )}

          {accounts.map((conn) => (
            <AccountCard
              key={conn.id}
              conn={conn}
              onSync={() => syncNow(conn)}
              onDisconnect={() => disconnect(conn)}
              busy={busy === `acc-${conn.id}`}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
