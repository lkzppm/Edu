import { makeProxy } from "@/lib/proxy";

const proxy = makeProxy(process.env.AGENT_URL ?? "http://localhost:8100");

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
