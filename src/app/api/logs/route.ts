import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { listLogs } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getUser(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? undefined;
  return NextResponse.json({ logs: await listLogs(200, id) });
}
