import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { getTrack } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ track: await getTrack(id, 200) });
}
