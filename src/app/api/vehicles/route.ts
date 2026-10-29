import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { listVehicles, updateInfo, tickDemoVehicles, OFFLINE_AFTER_MS, REPORT_INTERVAL_SEC } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getUser(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await tickDemoVehicles(); // DEMO_IDS が空なら何もしない
  } catch (e) {
    console.error("demo tick failed", e);
  }
  return NextResponse.json({
    now: Date.now(),
    offlineAfterMs: OFFLINE_AFTER_MS,
    intervalSec: REPORT_INTERVAL_SEC,
    vehicles: await listVehicles(),
  });
}

// 車両名・メモの更新
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const v = await updateInfo(b.id, String(b.name ?? ""), String(b.memo ?? ""), user);
    return NextResponse.json({ vehicle: v });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
