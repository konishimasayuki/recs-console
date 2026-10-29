// デモのON/OFF。 POST {"on":true}
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { setDemo } from "@/lib/vehicles";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (typeof b.on !== "boolean") return NextResponse.json({ error: "bad on" }, { status: 400 });
  try {
    return NextResponse.json({ vehicle: await setDemo(id, b.on, user) });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
