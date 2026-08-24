import { makeProxy } from "@/lib/proxy";

const proxy = makeProxy(process.env.API_URL ?? "http://localhost:8001");

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
