"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Wraps each word in a span, fading in only words past `skip` — words already
 * revealed in a previous frame never re-animate, even when a mid-stream
 * re-parse recreates their DOM nodes (that re-animation showed as flicker).
 */
function rehypeFadeWords(options?: { skip?: number }) {
  const skip = options?.skip ?? 0;
  return (tree: HastNode) => {
    let word = 0;
    const walk = (node: HastNode) => {
      if (!node.children || node.tagName === "code" || node.tagName === "pre") return;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && child.value?.trim()) {
          for (const part of child.value.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              next.push({ type: "text", value: part });
            } else {
              word += 1;
              next.push({
                type: "element",
                tagName: "span",
                properties: { className: word > skip ? ["fade-seg"] : [] },
                children: [{ type: "text", value: part }],
              });
            }
          }
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}

/** Dark-theme markdown for Edu's chat bubbles (GFM: tables, strikethrough…). */
export function Markdown({
  children,
  animated = false,
  stableWords = 0,
}: {
  children: string;
  animated?: boolean;
  stableWords?: number;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={animated ? [[rehypeFadeWords, { skip: stableWords }]] : []}
      components={{
        p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-zinc-500">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-zinc-500">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => (
          <h1 className="mb-1 mt-3 font-display text-base font-semibold first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 mt-3 font-display text-sm font-semibold first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-2.5 font-display text-sm font-semibold text-zinc-200 first:mt-0">
            {children}
          </h3>
        ),
        code: ({ className, children }) => {
          const isBlock = /language-/.test(className ?? "");
          return isBlock ? (
            <code className="font-mono text-xs">{children}</code>
          ) : (
            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[12px] text-cyan-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-lg bg-black/40 p-3">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-white/15 px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-white/[0.06] px-2 py-1.5 align-top tabular-nums">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-accent/50 pl-3 text-zinc-400">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-white/10" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
