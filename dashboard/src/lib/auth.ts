import { NextRequest } from "next/server";
import { env } from "./env";

// Guards background jobs (cron, sync). Header: `x-cron-secret`.
export function assertCron(req: NextRequest) {
  const got = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (got !== env.cronSecret()) {
    throw new Response("unauthorized", { status: 401 });
  }
}
