import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { listVehicles, updateInfo, tickDemoVehicles, OFFLINE_AFTER_MS, REPORT_INTERVAL_SEC } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getUser(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await tickDemoVehicles(); // デモONの車両がなければ何もしない
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

// 車両情報の更新 POST {"id":"sim001","name":"JF1-2204248","customer":"…",…}（送った項目だけ変わる）
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const v = await updateInfo(b.id, b, user);
    return NextResponse.json({ vehicle: v });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
