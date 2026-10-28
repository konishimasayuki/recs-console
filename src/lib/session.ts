import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth";

export async function getUser(req: NextRequest): Promise<string | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}
