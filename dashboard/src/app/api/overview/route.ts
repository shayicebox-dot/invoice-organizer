import { NextRequest, NextResponse } from "next/server";
import { overviewKpis, defaultRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const store = req.nextUrl.searchParams.get("store") || undefined;
  const range = from && to ? { from, to } : defaultRange();
  try {
    const data = await overviewKpis(range, store);
    return NextResponse.json({ ok: true, range, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
