import { NextRequest, NextResponse } from "next/server";

/** Streaming pass-through proxy to the api container. */
export function makeProxy(base: string) {
  return async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
    const { path } = await ctx.params;
    const url = `${base}/${path.join("/")}${req.nextUrl.search}`;
    const hasBody = !["GET", "HEAD"].includes(req.method);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
        body: hasBody ? await req.text() : undefined,
        cache: "no-store",
      });
      return new NextResponse(res.body, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    } catch {
      return NextResponse.json({ detail: "service unreachable" }, { status: 502 });
    }
  };
}
