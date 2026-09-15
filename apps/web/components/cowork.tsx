"use client";

import { useState } from "react";
import { ClaudeIcon, RefreshIcon, StatusBadge, TrashIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Conn } from "@/lib/types";

/** The Claude Cowork connection lives beside the plug, not among the platform
 * connectors — it's the workspace, not a source of courses/tasks. */
export function CoworkButton({
  conn,
  classesCount,
  deliveries,
  onChanged,
}: {
  conn: Conn | null;
  classesCount: number;
  deliveries: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => act(() => api("/connectors/cowork", { method: "POST" }));
  const sync = () =>
    conn && act(() => api(`/connectors/accounts/${conn.id}/sync`, { method: "POST" }));
  const disconnect = () => {
    if (!conn || !window.confirm("Disconnect the Claude Cowork workspace?")) return;
    act(() => api(`/connectors/accounts/${conn.id}`, { method: "DELETE" }));
  };

  const dot =
    conn == null
      ? "bg-zinc-600"
      : conn.sync_status === "ok"
        ? "bg-emerald-400"
        : conn.sync_status === "syncing"
          ? "animate-pulse bg-accent"
          : "bg-red-400";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative rounded-lg p-2 transition-colors hover:bg-white/5 ${
          open ? "text-cyan-300" : "text-zinc-400 hover:text-zinc-100"
        }`}
        aria-label="Claude Cowork"
      >
        <ClaudeIcon className="h-5 w-5" />
        <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${dot}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-msg-in absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-[#06141a] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-display text-sm font-medium text-zinc-100">
                <ClaudeIcon className="h-4 w-4 text-zinc-400" />
                Claude Cowork
              </p>
              {conn && <StatusBadge status={conn.sync_status} />}
            </div>

            {conn ? (
              <>
                <p className="mt-3 font-mono text-xs text-zinc-400">
                  {classesCount} classes · {deliveries} deliver{deliveries === 1 ? "y" : "ies"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-600">
                  synced {timeAgo(conn.last_sync_at)} · read-only
                </p>
                {conn.last_error && <p className="mt-2 text-xs text-red-400">{conn.last_error}</p>}
                <div className="mt-4 flex items-center justify-end gap-1">
                  <button
                    onClick={sync}
                    disabled={busy || conn.sync_status === "syncing"}
                    aria-label="re-scan workspace"
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                  >
                    <RefreshIcon
                      className={`h-4 w-4 ${conn.sync_status === "syncing" ? "animate-spin" : ""}`}
                    />
                  </button>
                  <button
                    onClick={disconnect}
                    disabled={busy}
                    aria-label="disconnect workspace"
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-red-400"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  Connect the mounted UFRJ workspace — class registry from each{" "}
                  <code className="text-zinc-400">CONTEXT.md</code>, deliveries from{" "}
                  <code className="text-zinc-400">listas/</code>. Read-only, never written.
                </p>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                <button
                  onClick={connect}
                  disabled={busy}
                  className="mt-4 w-full rounded-lg bg-accent/15 py-2 font-display text-xs font-medium text-cyan-300 transition-colors hover:bg-accent/25 disabled:opacity-50"
                >
                  Connect workspace
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
