// 管理画面のログイン。署名付きクッキー（Web Crypto のHMAC。middlewareでも動く）
export const SESSION_COOKIE = "recs_session";
const SESSION_DAYS = 7;

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 未設定");
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(user: string): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${encodeURIComponent(user)}.${exp}`;
  return { value: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

/** クッキーを検証してユーザー名を返す。無効なら null */
export async function verifySession(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  try {
    if (!safeEqual(sig, await hmac(`${user}.${exp}`))) return null;
  } catch {
    return null;
  }
  return decodeURIComponent(user);
}

export function checkPassword(pw: string): boolean {
  const ok = process.env.ADMIN_PASSWORD;
  if (!ok) return false; // 未設定ならログイン不可（安全側）
  return safeEqual(pw, ok);
}

export function checkDeviceKey(key: string | null): boolean {
  const ok = process.env.DEVICE_KEY;
  if (!ok || !key) return false;
  return safeEqual(key, ok);
}
