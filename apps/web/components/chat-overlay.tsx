"use client";

import { ComponentType, useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import {
  ArrowDownIcon,
  BoltIcon,
  BookIcon,
  BrainIcon,
  Button,
  CapIcon,
  CloseIcon,
  GlobeIcon,
  HistoryIcon,
  ListIcon,
  PercentIcon,
  PlugIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  StopIcon,
  TrashIcon,
} from "@/components/ui";
import { timeAgo } from "@/lib/format";

type ToolCall = {
  name: string;
  input?: Record<string, unknown>;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  tools: ToolCall[];
  // Data URLs of pasted images (user messages). Kept in memory for display;
  // stripped on persist so localStorage never fills with base64.
  images?: string[];
};

type Conversation = {
  id: string;
  title: string;
  messages: Msg[];
  session_id: string | null;
  updated_at: number;
};

type SseEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "tool_input"; name: string; input: Record<string, unknown> }
  | { type: "thinking" }
  | { type: "done"; session_id: string | null }
  | { type: "error"; message: string };

const TOOL_META: Record<
  string,
  { label: string; active: string; icon: ComponentType<{ className?: string }> }
> = {
  get_tasks: { label: "read your tasks", active: "reading your tasks", icon: ListIcon },
  get_grades: { label: "read your grades", active: "reading your grades", icon: PercentIcon },
  get_college: {
    label: "read your college data",
    active: "reading your college data",
    icon: CapIcon,
  },
  get_courses: { label: "read your courses", active: "reading your courses", icon: BookIcon },
  get_connectors: {
    label: "checked connector status",
    active: "checking connectors",
    icon: PlugIcon,
  },
  sync_connector: { label: "triggered a sync", active: "syncing", icon: RefreshIcon },
  WebSearch: { label: "searched the web", active: "searching the web", icon: SearchIcon },
  WebFetch: { label: "read a web page", active: "reading a web page", icon: GlobeIcon },
};

/**
 * Live status while the agent works — pulsing icon + shimmering label.
 * State changes (thinking → tool → tool…) cross-fade: the old line slips up
 * and out, then the new one rises in.
 */
function ActivityLine({ activity }: { activity: string }) {
  const [shown, setShown] = useState(activity);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (activity === shown) return;
    setExiting(true);
    const t = setTimeout(() => {
      setShown(activity);
      setExiting(false);
    }, 140);
    return () => clearTimeout(t);
  }, [activity, shown]);

  const meta = shown === "thinking" ? null : TOOL_META[shown];
  const Ico = meta?.icon ?? BrainIcon;
  const label = meta?.active ?? (shown === "thinking" ? "thinking" : shown);
  return (
    <div className="flex items-center py-0.5">
      <div
        key={shown}
        className={`animate-rise-in flex items-center gap-2 transition-all duration-150 ease-in ${
          exiting ? "-translate-y-1 opacity-0" : "opacity-100"
        }`}
      >
        <Ico className="h-3.5 w-3.5 animate-pulse text-zinc-400" />
        <span className="animate-shimmer font-mono text-xs">{label}…</span>
      </div>
    </div>
  );
}

/** Row of small icons above the answer — one per tool call; click to see its params. */
function ToolIcons({
  tools,
  selected,
  onSelect,
}: {
  tools: ToolCall[];
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-0.5 px-1">
      {tools.map((t, j) => {
        const meta = TOOL_META[t.name];
        const Ico = meta?.icon ?? BoltIcon;
        return (
          <button
            key={j}
            onClick={() => onSelect(selected === j ? null : j)}
            className={`animate-tool-in group relative grid h-6 w-6 place-items-center rounded-md transition-colors ${
              selected === j
                ? "bg-white/[0.08] text-cyan-300"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-300"
            }`}
            aria-label={meta?.label ?? t.name}
          >
            <Ico className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#08161b]/95 px-2 py-0.5 font-mono text-[10px] text-zinc-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {meta?.label ?? t.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Friendly view of one tool call's parameters. */
function ToolParams({ call }: { call: ToolCall }) {
  const entries = Object.entries(call.input ?? {});
  return (
    <div className="mb-1.5 max-w-[85%] rounded-lg bg-white/[0.04] px-3 py-2">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {TOOL_META[call.name]?.label ?? call.name}
      </p>
      {entries.length === 0 ? (
        <p className="font-mono text-[11px] text-zinc-500">
          {call.input ? "no parameters" : "parameters unavailable"}
        </p>
      ) : (
        entries.map(([k, v]) => (
          <p key={k} className="break-all font-mono text-[11px] leading-relaxed text-zinc-300">
            <span className="text-zinc-500">{k}:</span>{" "}
            {typeof v === "string" ? v : JSON.stringify(v)}
          </p>
        ))
      )}
    </div>
  );
}

/**
 * Collapsible wrapper for the params panel — expands and collapses smoothly
 * instead of popping in/out; the last call stays rendered while closing.
 */
function ToolParamsPanel({ call, switchKey }: { call: ToolCall | null; switchKey: number }) {
  const [shown, setShown] = useState<{ call: ToolCall; key: number } | null>(
    call ? { call, key: switchKey } : null
  );

  useEffect(() => {
    if (call) setShown({ call, key: switchKey });
  }, [call, switchKey]);

  return (
    <div
      className={`grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out ${
        call ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        {shown && (
          <div key={shown.key} className="animate-chip-in">
            <ToolParams call={shown.call} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reveals streamed text at a steady rate (catching up faster when behind) so
 * big SSE chunks don't pop in as blocks; words fade via the markdown plugin.
 */
function StreamingMarkdown({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState(active ? "" : text);
  // Stays true briefly after the stream ends so the tail reveals at speed
  // and the last words finish their fade — instead of dumping in at once.
  const [settling, setSettling] = useState(false);
  const animating = active || settling;
  const target = useRef(text);
  target.current = text;
  const lenRef = useRef(shown.length);
  // Words already on screen last frame — they must never re-run the fade.
  const stableWords = useRef(0);

  useEffect(() => {
    stableWords.current = animating ? shown.split(/\s+/).filter(Boolean).length : 0;
  }, [shown, animating]);

  useEffect(() => {
    if (active) setSettling(true);
  }, [active]);

  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const full = target.current;
      if (lenRef.current < full.length) {
        const remaining = full.length - lenRef.current;
        // Steady drip with a capped catch-up so big SSE bursts never land as blocks.
        const step = active
          ? Math.min(24, Math.max(2, Math.ceil(remaining / 40)))
          : Math.max(8, Math.ceil(remaining / 6));
        lenRef.current = Math.min(full.length, lenRef.current + step);
        setShown(full.slice(0, lenRef.current));
      } else if (!active) {
        // Fully revealed — give the newest words time to finish fading in
        // before the plugin unwraps their spans.
        timer = setTimeout(() => setSettling(false), 600);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [animating, active]);

  return (
    <Markdown animated={animating} stableWords={stableWords.current}>
      {animating ? shown : text}
    </Markdown>
  );
}

const MODELS = [
  { value: "claude-sonnet-5", label: "Sonnet 5" },
  { value: "claude-fable-5", label: "Fable 5" },
  { value: "claude-opus-5", label: "Opus 5" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
const EFFORTS = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
];

const STORAGE_KEY = "edu.chats";
const ACTIVE_KEY = "edu.activeChat";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    // Older conversations stored tools as plain name strings.
    for (const c of parsed)
      for (const m of c.messages)
        m.tools = (m.tools ?? []).map((t) => (typeof t === "string" ? { name: t } : t));
    return parsed.sort((a, b) => b.updated_at - a.updated_at);
  } catch {
    return [];
  }
}

function persistConversations(convs: Conversation[]) {
  try {
    const slim = convs.slice(0, 50).map((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.images?.length ? { ...m, images: undefined, content: m.content || "(image)" } : m
      ),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* storage full/blocked — history is best-effort */
  }
}

export function ChatOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [model, setModel] = useState(MODELS[0].value);
  const [effort, setEffort] = useState("high");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [openTool, setOpenTool] = useState<{ msg: number; idx: number } | null>(null);
  const [needsSetup, setNeedsSetup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors atBottom for the auto-scroll effects — scrolling up releases the
  // pin so the user can read back while the agent keeps working.
  const stickRef = useRef(true);
  const lastPersist = useRef(0);
  // Live snapshot for the beforeunload flush — a refresh mid-stream must not
  // lose what already streamed in.
  const liveRef = useRef({ messages, convId, sessionId });
  liveRef.current = { messages, convId, sessionId };

  // Restore the conversation that was on screen before the last refresh.
  useEffect(() => {
    const convs = loadConversations();
    setConversations(convs);
    try {
      const activeId = localStorage.getItem(ACTIVE_KEY);
      const active = activeId ? convs.find((c) => c.id === activeId) : null;
      if (active) {
        let msgs = active.messages;
        // A stream cut before any text left an empty assistant tail — drop it.
        if (msgs.length && msgs[msgs.length - 1].role === "assistant" && !msgs[msgs.length - 1].content)
          msgs = msgs.slice(0, -1);
        setMessages(msgs);
        setSessionId(active.session_id);
        setConvId(active.id);
      }
    } catch {
      /* start fresh */
    }
  }, []);

  // Remember which conversation is on screen.
  useEffect(() => {
    try {
      if (convId) localStorage.setItem(ACTIVE_KEY, convId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* best-effort */
    }
  }, [convId]);

  // Persist continuously: immediately when idle, throttled to ~1s while
  // streaming so partial answers survive a refresh or crash.
  useEffect(() => {
    if (messages.length === 0 || !convId) return;
    const delay = streaming ? Math.max(0, 1_000 - (Date.now() - lastPersist.current)) : 0;
    const t = setTimeout(() => {
      lastPersist.current = Date.now();
      setConversations((prev) => {
        const title =
          messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "conversation";
        const next: Conversation = {
          id: convId,
          title,
          messages,
          session_id: sessionId,
          updated_at: Date.now(),
        };
        const rest = prev.filter((c) => c.id !== convId);
        const all = [next, ...rest].sort((a, b) => b.updated_at - a.updated_at);
        persistConversations(all);
        return all;
      });
    }, delay);
    return () => clearTimeout(t);
  }, [messages, streaming, convId, sessionId]);

  // Synchronous flush on refresh/close — catches whatever the throttle hasn't.
  useEffect(() => {
    const flush = () => {
      const { messages, convId, sessionId } = liveRef.current;
      if (!convId || messages.length === 0) return;
      const title =
        messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "conversation";
      const next: Conversation = {
        id: convId,
        title,
        messages,
        session_id: sessionId,
        updated_at: Date.now(),
      };
      persistConversations([next, ...loadConversations().filter((c) => c.id !== convId)]);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      stickRef.current = true;
      setAtBottom(true);
      bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    } else {
      setShowHistory(false);
    }
  }, [open]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // The smoothed reveal grows the last bubble between state updates — keep it
  // in view, but only while the user is pinned to the bottom.
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      if (stickRef.current)
        bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    }, 300);
    return () => clearInterval(id);
  }, [streaming]);

  // Lock the page behind the overlay — only the chat scrolls.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes the history sidebar first, then the chat.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showHistory) setShowHistory(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showHistory, onClose]);

  const newChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setConvId(null);
    setError(null);
    setOpenTool(null);
    setShowHistory(false);
    inputRef.current?.focus();
  }, []);

  const openConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setSessionId(conv.session_id);
    setConvId(conv.id);
    setError(null);
    setOpenTool(null);
    setShowHistory(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => {
      const all = prev.filter((c) => c.id !== id);
      persistConversations(all);
      return all;
    });
    if (id === convId) newChat();
  };

  const send = async (text: string) => {
    const message = text.trim();
    const images = pendingImages;
    if ((!message && images.length === 0) || streaming) return;
    if (!convId) setConvId(crypto.randomUUID());
    setInput("");
    setPendingImages([]);
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setStreaming(true);
    setActivity("thinking");
    stickRef.current = true;
    setAtBottom(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: message, tools: [], images: images.length ? images : undefined },
      { role: "assistant", content: "", tools: [] },
    ]);

    const patchLast = (fn: (m: Msg) => Msg) =>
      setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          model,
          effort,
          images: images.length
            ? images
                .map((url) => {
                  const m = url.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/);
                  return m ? { media_type: m[1], data: m[2] } : null;
                })
                .filter(Boolean)
            : undefined,
        }),
        signal: controller.signal,
      });
      if (res.status === 409) {
        const body = await res.json();
        setNeedsSetup(body.detail ?? "Agent not authenticated.");
        setMessages((all) => all.slice(0, -2));
        return;
      }
      if (!res.ok || !res.body) throw new Error(`agent error (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (event.type === "text") {
            setActivity(null);
            patchLast((m) => ({ ...m, content: m.content + event.delta }));
          } else if (event.type === "tool") {
            setActivity(event.name);
            patchLast((m) => ({ ...m, tools: [...m.tools, { name: event.name }] }));
          } else if (event.type === "tool_input") {
            patchLast((m) => {
              const tools = [...m.tools];
              for (let j = tools.length - 1; j >= 0; j--) {
                if (tools[j].name === event.name && tools[j].input === undefined) {
                  tools[j] = { ...tools[j], input: event.input };
                  break;
                }
              }
              return { ...m, tools };
            });
          } else if (event.type === "thinking") {
            setActivity("thinking");
          } else if (event.type === "done") {
            if (event.session_id) setSessionId(event.session_id);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (e) {
      // A user-initiated stop is not an error — keep whatever streamed in.
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "chat failed");
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setActivity(null);
      setMessages((all) =>
        all.length && all[all.length - 1].role === "assistant" && !all[all.length - 1].content
          ? all.slice(0, -1)
          : all
      );
    }
  };

  const stopGeneration = () => abortRef.current?.abort();

  // Pasted images become pending attachments (max 4, 8 MB each).
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? []).filter(
      (it) => it.kind === "file" && it.type.startsWith("image/")
    );
    if (!files.length) return;
    e.preventDefault();
    for (const item of files) {
      const file = item.getAsFile();
      if (!file || file.size > 8 * 1024 * 1024) continue;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string")
          setPendingImages((prev) =>
            prev.length >= 4 ? prev : [...prev, reader.result as string]
          );
      };
      reader.readAsDataURL(file);
    }
  };

  const empty = messages.length === 0;

  // Edgeless — plain text that melts into the backdrop until hovered.
  const selectClass =
    "cursor-pointer appearance-none bg-transparent px-2 py-1 text-center font-mono text-[11px] text-zinc-600 outline-none transition-colors hover:text-zinc-300 focus:text-zinc-200 [&>option]:bg-[#08161b]";

  return (
    <div
      onClick={() => (showHistory ? setShowHistory(false) : onClose())}
      className={`fixed inset-0 z-40 bg-[#030b0e]/60 backdrop-blur-xl transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* history toggle — single button that rides the sidebar's right edge */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowHistory((v) => !v);
        }}
        className={`absolute top-4 z-30 rounded-lg p-2 transition-all duration-300 ease-out hover:bg-white/5 ${
          showHistory
            ? "left-[18.5rem] text-zinc-100"
            : "left-4 text-zinc-400 hover:text-zinc-100"
        }`}
        aria-label={showHistory ? "Close conversations" : "Past conversations"}
        title={showHistory ? "Close conversations" : "Past conversations"}
      >
        <HistoryIcon />
      </button>

      {/* top bar */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end px-5 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-auto flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={newChat}
              className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              new chat
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            aria-label="Close chat"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* history sidebar */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-y-0 left-0 z-20 flex w-72 flex-col bg-[#061217]/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-5">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Conversations
          </span>
          <button
            onClick={newChat}
            className="rounded-md px-2 py-0.5 text-[11px] text-cyan-400 transition-colors hover:bg-white/5"
          >
            + new
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-4">
          {conversations.length === 0 && (
            <p className="px-2 pt-2 text-xs text-zinc-600">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => openConversation(c)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                c.id === convId ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-zinc-200">{c.title}</p>
                <p className="font-mono text-[10px] text-zinc-600">
                  {timeAgo(new Date(c.updated_at).toISOString())}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
                className="rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {needsSetup ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-6"
        >
          <h3 className="font-display text-sm font-semibold">One-time setup</h3>
          <p className="mt-1 text-xs text-zinc-500">
            The chat runs on your Claude subscription — no API key.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
            <li>
              Run{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                claude setup-token
              </code>{" "}
              in a terminal and follow the login.
            </li>
            <li>
              Put the token in{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">.env</code> as{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">
                CLAUDE_CODE_OAUTH_TOKEN=…
              </code>
            </li>
            <li>
              Restart:{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                docker compose up -d agent
              </code>
            </li>
          </ol>
          <p className="mt-3 text-xs text-zinc-600">{needsSetup}</p>
          <div className="mt-4">
            <Button onClick={() => setNeedsSetup(null)}>Try again</Button>
          </div>
        </div>
      ) : (
        <>
          {/* messages */}
          {!empty && (
            <div
              onClick={(e) => e.stopPropagation()}
              onScroll={(e) => {
                const el = e.currentTarget;
                const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                stickRef.current = near;
                setAtBottom(near);
              }}
              className="absolute inset-x-0 bottom-36 top-0 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent_0.5rem,black_4.5rem,black_calc(100%-3rem),transparent_100%)]"
            >
              <div className="mx-auto w-full max-w-2xl space-y-4 px-5 pb-10 pt-20">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="animate-msg-in flex flex-col items-end gap-1.5">
                      {m.images && m.images.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {m.images.map((src, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={j}
                              src={src}
                              alt="attached"
                              className="max-h-40 max-w-[240px] rounded-xl object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {m.content && (
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white shadow-glow-sm">
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={i} className="animate-msg-in flex flex-col items-start">
                      {m.tools.length > 0 && (
                        <ToolIcons
                          tools={m.tools}
                          selected={openTool?.msg === i ? openTool.idx : null}
                          onSelect={(idx) => setOpenTool(idx === null ? null : { msg: i, idx })}
                        />
                      )}
                      {m.tools.length > 0 && (
                        <ToolParamsPanel
                          call={openTool?.msg === i ? m.tools[openTool.idx] ?? null : null}
                          switchKey={openTool?.msg === i ? openTool.idx : 0}
                        />
                      )}
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.05] px-4 py-2.5 text-sm text-zinc-100 backdrop-blur-sm">
                        <StreamingMarkdown
                          text={m.content}
                          active={streaming && i === messages.length - 1}
                        />
                        {streaming && i === messages.length - 1 && !activity && (
                          <span className="animate-caret ml-0.5 inline-block text-accent">▍</span>
                        )}
                        {streaming && i === messages.length - 1 && activity && (
                          <ActivityLine activity={activity} />
                        )}
                      </div>
                    </div>
                  )
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          {/* jump back to the latest message once the bottom drifts out of view */}
          {!empty && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                stickRef.current = true;
                setAtBottom(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`absolute bottom-40 left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-white/10 bg-[#08161b]/90 text-zinc-300 shadow-xl backdrop-blur-xl transition-all duration-200 hover:border-white/25 hover:text-white ${
                atBottom ? "pointer-events-none translate-y-2 opacity-0" : "opacity-100"
              }`}
              aria-label="Jump to latest"
            >
              <ArrowDownIcon className="h-4 w-4" />
            </button>
          )}

          {/* input — centered when empty (spotlight), pinned bottom in conversation */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-x-0 px-5 transition-all duration-300 ${
              empty ? "top-1/2 -translate-y-1/2" : "bottom-8"
            }`}
          >
            <div className="mx-auto w-full max-w-2xl">
              {empty && (
                <div className="mb-6 text-center">
                  <p className="font-display text-lg text-zinc-300">
                    Ask Edu anything about your classes.
                  </p>
                </div>
              )}
              {error && <p className="mb-2 text-center text-xs text-red-400">{error}</p>}
              <form
                className="rounded-[26px] border border-white/10 bg-[#08161b]/80 p-1.5 pl-5 shadow-2xl backdrop-blur-xl transition-colors focus-within:border-accent/60"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-2 pt-2.5">
                    {pendingImages.map((src, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt="pending attachment"
                          className="h-14 w-14 rounded-lg border border-white/10 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPendingImages((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
                          aria-label="Remove image"
                        >
                          <CloseIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    onPaste={onPaste}
                    placeholder="Ask about your classes…"
                    className="max-h-40 w-full resize-none bg-transparent py-1.5 text-sm leading-6 text-zinc-100 placeholder-zinc-600 outline-none"
                    disabled={streaming}
                  />
                {/* One button that morphs: send (accent) ⇄ stop (light) with a
                    rotate/scale crossfade between the stacked icons. */}
                <button
                  type={streaming ? "button" : "submit"}
                  onClick={streaming ? stopGeneration : undefined}
                  disabled={!streaming && !input.trim() && pendingImages.length === 0}
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-out ${
                    streaming
                      ? "bg-zinc-200 text-zinc-900 hover:bg-white"
                      : "bg-accent text-white shadow-glow-sm hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
                  }`}
                  aria-label={streaming ? "Stop generating" : "Send"}
                  title={streaming ? "Stop generating" : "Send"}
                >
                  <SendIcon
                    className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
                      streaming ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"
                    }`}
                  />
                  <StopIcon
                    className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
                      streaming ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
                    }`}
                  />
                </button>
                </div>
              </form>

              {/* model + effort */}
              <div className="mt-1.5 flex items-center justify-center gap-1">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={selectClass}
                  aria-label="Model"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  className={selectClass}
                  aria-label="Effort"
                >
                  {EFFORTS.map((e) => (
                    <option key={e.value} value={e.value}>
                      effort: {e.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
