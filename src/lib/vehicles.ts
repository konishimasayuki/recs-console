// 車両データのロジック。キー設計:
//   veh:{id}   ハッシュ … 車両の状態
//   vehs       セット   … 全車両ID
//   trk:{id}   リスト   … 位置履歴 "ts,lat,lng"（新しい順、最大500件）
//   oplog      リスト   … 操作履歴（JSON、新しい順、最大2000件）
import { store } from "./store";

export const REPORT_INTERVAL_SEC = Number(process.env.REPORT_INTERVAL_SEC ?? 300);
// この時間以上通信がなければ「通信途絶」
export const OFFLINE_AFTER_MS = REPORT_INTERVAL_SEC * 3 * 1000;

export type Vehicle = {
  id: string;
  name: string;
  memo: string;
  desired: 0 | 1;      // サーバーが指示している状態（1=始動阻止）
  actual: 0 | 1 | -1;  // 車両が最後に報告した状態（-1=未報告）
  pending: 0 | 1;      // 指示がまだ車両に反映されていない
  lat: number | null;
  lng: number | null;
  fixAt: number | null; // 最後に測位できた時刻
  rssi: number | null;
  seen: number | null;  // 最終通信時刻
  fw: string;
  changedAt: number | null;
  demo: boolean;        // デモ車両（画面のスイッチでON。通信している扱いになる）
};

export type OpLog = {
  ts: number;
  id: string;
  name: string;
  action: string;
  by: string;
  note?: string;
};

function toVehicle(id: string, h: Record<string, string> | null): Vehicle {
  const num = (v?: string) => (v === undefined || v === "" ? null : Number(v));
  return {
    id,
    name: h?.name ?? "",
    memo: h?.memo ?? "",
    desired: h?.desired === "1" ? 1 : 0,
    actual: h?.actual === "1" ? 1 : h?.actual === "0" ? 0 : -1,
    pending: h?.pending === "1" ? 1 : 0,
    lat: num(h?.lat),
    lng: num(h?.lng),
    fixAt: num(h?.fixAt),
    rssi: num(h?.rssi),
    seen: num(h?.seen),
    fw: h?.fw ?? "",
    changedAt: num(h?.changedAt),
    demo: h?.demo === "1",
  };
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const h = await store().hgetall(`veh:${id}`);
  return h ? toVehicle(id, h) : null;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const ids = await store().smembers("vehs");
  const list = await Promise.all(ids.map(async (id) => toVehicle(id, await store().hgetall(`veh:${id}`))));
  return list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ja"));
}

async function addLog(e: OpLog) {
  await store().lpush("oplog", JSON.stringify(e));
  await store().ltrim("oplog", 0, 1999);
}

export async function listLogs(limit = 200): Promise<OpLog[]> {
  const rows = await store().lrange("oplog", 0, limit - 1);
  return rows.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

export type Report = {
  relay?: number;
  lat?: number;
  lng?: number;
  fix?: number;
  rssi?: number;
  fw?: string;
};

/** 車両からの定期報告を保存し、あるべきリレー状態を返す */
export async function handleReport(id: string, rep: Report) {
  const now = Date.now();
  const key = `veh:${id}`;
  const prev = await store().hgetall(key);
  const isNew = !prev;
  const v = toVehicle(id, prev);

  const upd: Record<string, string | number> = { seen: now };
  if (isNew) {
    upd.desired = 0; // 新しい車両は必ず「阻止なし」から始める
    upd.pending = 0;
    upd.name = "";
    await store().sadd("vehs", id);
    await addLog({ ts: now, id, name: "", action: "新規車両を検出", by: "車両" });
  }

  const actual = rep.relay === 1 ? 1 : rep.relay === 0 ? 0 : null;
  if (actual !== null) upd.actual = actual;
  if (typeof rep.rssi === "number") upd.rssi = rep.rssi;
  if (rep.fw) upd.fw = rep.fw.slice(0, 32);

  const validFix =
    rep.fix === 1 &&
    typeof rep.lat === "number" && typeof rep.lng === "number" &&
    Math.abs(rep.lat) <= 90 && Math.abs(rep.lng) <= 180 &&
    !(rep.lat === 0 && rep.lng === 0);
  if (validFix) {
    upd.lat = rep.lat!;
    upd.lng = rep.lng!;
    upd.fixAt = now;
    await store().lpush(`trk:${id}`, `${now},${rep.lat},${rep.lng}`);
    await store().ltrim(`trk:${id}`, 0, 499);
  }

  // 指示が車両で反映されたかを確認
  const desired = isNew ? 0 : v.desired;
  if (v.pending === 1 && actual !== null && actual === desired) {
    upd.pending = 0;
    await addLog({
      ts: now, id, name: v.name,
      action: desired === 1 ? "阻止ONを車両で確認" : "阻止解除を車両で確認",
      by: "車両",
    });
  }

  await store().hset(key, upd);
  return { r: desired, i: REPORT_INTERVAL_SEC };
}

/** 管理画面からの阻止ON/OFF指示 */
export async function setRelay(id: string, relay: 0 | 1, by: string, note?: string) {
  const v = await getVehicle(id);
  if (!v) throw new Error("not found");
  const now = Date.now();
  const pending = v.actual === relay ? 0 : 1;
  await store().hset(`veh:${id}`, { desired: relay, pending, changedAt: now });
  await addLog({
    ts: now, id, name: v.name,
    action: relay === 1 ? "阻止ONを指示" : "阻止解除を指示",
    by, note: note?.slice(0, 200),
  });
  return getVehicle(id);
}

export async function updateInfo(id: string, name: string, memo: string, by: string) {
  const v = await getVehicle(id);
  if (!v) throw new Error("not found");
  await store().hset(`veh:${id}`, { name: name.slice(0, 50), memo: memo.slice(0, 200) });
  if (v.name !== name) {
    await addLog({ ts: Date.now(), id, name, action: `車両名を変更（旧: ${v.name || "未設定"}）`, by });
  }
  return getVehicle(id);
}

export async function getTrack(id: string, limit = 200) {
  const rows = await store().lrange(`trk:${id}`, 0, limit - 1);
  return rows.map((r) => {
    const [ts, lat, lng] = String(r).split(",").map(Number);
    return { ts, lat, lng };
  });
}

// ===== デモ機能 =====
// 管理画面の詳細欄のスイッチで車両ごとにON/OFFする（設定はRedisに保存）。
// ONの車両は、管理画面を開いている間ずっと通信している扱いになり、
// 阻止の指示も約10秒で反映された扱いになる。実際の車載器がなくても説明・練習ができる。
// 実際の車載器から報告が来ても動くが、デモの疑似報告と混ざるので本番車両ではONにしないこと。
const DEMO_GAP_MS = 8_000;    // 疑似報告の最短間隔
const DEMO_APPLY_MS = 8_000;  // 阻止の指示を車両が反映するまでの疑似時間
const DEMO_LOOP_SEC = 600;    // 1周10分で近所をぐるっと回る
const DEMO_RADIUS = 0.004;    // 約400m

export async function setDemo(id: string, on: boolean, by: string) {
  const v = await getVehicle(id);
  if (!v) throw new Error("not found");
  if (v.demo === on) return v;
  // OFFにする時は回る中心も消す（次にONにした時は、その時の位置から回り始める）
  await store().hset(`veh:${id}`, on ? { demo: 1 } : { demo: 0, demoLat: "", demoLng: "" });
  await addLog({ ts: Date.now(), id, name: v.name, action: on ? "デモをON" : "デモをOFF", by });
  return getVehicle(id);
}

export async function tickDemoVehicles() {
  const now = Date.now();
  const demos = (await listVehicles()).filter((v) => v.demo);
  for (const [i, v] of demos.entries()) {
    if (v.seen && now - v.seen < DEMO_GAP_MS) continue;
    const id = v.id;
    const h = (await store().hgetall(`veh:${id}`)) ?? {};

    // 回る中心を最初の位置で固定（遠くへ流れていかないように）
    let aLat = Number(h.demoLat), aLng = Number(h.demoLng);
    if (!h.demoLat || !h.demoLng) {
      aLat = v.lat ?? 33.2063;
      aLng = v.lng ?? 130.3836;
      await store().hset(`veh:${id}`, { demoLat: aLat, demoLng: aLng });
    }
    const ang = ((now / 1000) / DEMO_LOOP_SEC) * 2 * Math.PI + i * 2.1;
    const lat = aLat + DEMO_RADIUS * Math.sin(ang);
    const lng = aLng + DEMO_RADIUS * 1.2 * Math.cos(ang);

    const relay =
      v.pending === 1 && v.changedAt !== null && now - v.changedAt >= DEMO_APPLY_MS
        ? v.desired
        : v.actual === -1 ? 0 : v.actual;

    await handleReport(id, {
      relay, lat: +lat.toFixed(6), lng: +lng.toFixed(6), fix: 1,
      rssi: 18 + ((Math.floor(now / 10_000) + i) % 8), fw: "demo",
    });
  }
}
