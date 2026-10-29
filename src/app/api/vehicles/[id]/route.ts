// 1台分の情報（詳細画面用）
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { getVehicle, tickDemoVehicles, OFFLINE_AFTER_MS, REPORT_INTERVAL_SEC } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try { await tickDemoVehicles(); } catch (e) { console.error("demo tick failed", e); }
  const v = await getVehicle(id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ now: Date.now(), offlineAfterMs: OFFLINE_AFTER_MS, intervalSec: REPORT_INTERVAL_SEC, vehicle: v });
}
