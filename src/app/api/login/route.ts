import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const user = String(b.user ?? "").trim().slice(0, 30) || "管理者";
  if (!checkPassword(String(b.password ?? ""))) {
    await new Promise((r) => setTimeout(r, 800)); // 総当たり対策で少し待たせる
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  const s = await createSession(user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.value, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: s.maxAge,
  });
  return res;
}
