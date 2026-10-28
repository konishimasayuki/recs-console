// 車両からの定期報告を受ける口。
// 例: POST /api/device/report  ヘッダ x-device-key: <DEVICE_KEY>
//     {"id":"car001","relay":0,"lat":33.2,"lng":130.3,"fix":1,"rssi":18,"fw":"0.1"}
// 返り値: {"r":0,"i":300}  r=あるべきリレー状態(1=阻止) / i=次の報告までの秒数
// SORACOM Beam経由なら X-Soracom-Imsi ヘッダのIMSIを車両IDとして使う。
import { NextRequest, NextResponse } from "next/server";
import { checkDeviceKey } from "@/lib/auth";
import { handleReport } from "@/lib/vehicles";

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-device-key") ?? req.nextUrl.searchParams.get("k");
  if (!checkDeviceKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const id = req.headers.get("x-soracom-imsi") ?? String(body.id ?? "");
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : undefined);
  const res = await handleReport(id, {
    relay: n(body.relay),
    lat: n(body.lat),
    lng: n(body.lng),
    fix: n(body.fix),
    rssi: n(body.rssi),
    fw: typeof body.fw === "string" ? body.fw : undefined,
  });
  return NextResponse.json(res);
}
