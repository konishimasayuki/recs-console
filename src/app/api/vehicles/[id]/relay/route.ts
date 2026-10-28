// 阻止ON/OFFの指示。 POST {"relay":1,"note":"3ヶ月滞納のため"}
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { setRelay } from "@/lib/vehicles";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (b.relay !== 0 && b.relay !== 1) return NextResponse.json({ error: "bad relay" }, { status: 400 });
  try {
    const v = await setRelay(id, b.relay, user, typeof b.note === "string" ? b.note : undefined);
    return NextResponse.json({ vehicle: v });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
