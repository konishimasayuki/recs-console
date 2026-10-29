// 画面側で使う型と表示用の小さな関数（ブラウザで動く。サーバー専用のものは入れない）

export type Vehicle = {
  id: string; name: string; memo: string;
  model: string; customer: string; firstReg: string; katashiki: string;
  group: string; staff: string; payment: string;
  desired: 0 | 1; actual: 0 | 1 | -1; pending: 0 | 1;
  lat: number | null; lng: number | null; fixAt: number | null;
  rssi: number | null; seen: number | null; fw: string; changedAt: number | null; demo?: boolean;
};
export type OpLog = { ts: number; id: string; name: string; action: string; by: string; note?: string };

export const POLL_MS = 10_000;

/** 一覧の絞り込みや地図のピン色に使う総合状態 */
export type Status = { key: "ok" | "block" | "wait" | "off"; label: string; color: string };
export function statusOf(v: Vehicle, now: number, offlineAfterMs: number): Status {
  if (!v.seen || now - v.seen > offlineAfterMs) return { key: "off", label: "通信断", color: "#6b7280" };
  if (v.pending) return {
    key: "wait", label: v.desired === 1 ? "阻止ON 反映待ち" : "解除 反映待ち", color: "#e09400",
  };
  if (v.desired === 1 && v.actual === 1) return { key: "block", label: "始動阻止中", color: "#c62828" };
  return { key: "ok", label: "正常", color: "#1e8e4e" };
}

/** バッジ1つ分（文字と色の種類） */
export type Badge = { text: string; tone: "ok" | "ng" | "warn" | "info" | "mute" };

export function commBadge(v: Vehicle, now: number, offlineAfterMs: number): Badge {
  if (!v.seen) return { text: "未通信", tone: "mute" };
  return now - v.seen > offlineAfterMs ? { text: "通信断", tone: "ng" } : { text: "正常", tone: "ok" };
}

export function posBadge(v: Vehicle, now: number, offlineAfterMs: number): Badge {
  if (!v.fixAt) return { text: "なし", tone: "mute" };
  return now - v.fixAt > offlineAfterMs ? { text: "古い", tone: "ng" } : { text: "正常", tone: "ok" };
}

export function engineBadge(v: Vehicle): Badge {
  if (v.pending) return v.desired === 1 ? { text: "阻止 反映待ち", tone: "warn" } : { text: "解除 反映待ち", tone: "warn" };
  if (v.desired === 1) return { text: "阻止中", tone: "ng" };
  return { text: "始動可", tone: "info" };
}

export function ago(ts: number | null, now: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

/** 2026/10/27 13:00 */
export function dt(ts: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// SIM7080Gの電波強度(CSQ 0〜31)を目安表示に
export function signal(rssi: number | null) {
  if (rssi === null || rssi === 99) return "—";
  if (rssi >= 20) return `強 (${rssi})`;
  if (rssi >= 10) return `中 (${rssi})`;
  return `弱 (${rssi})`;
}

export const dash = (s: string) => s || "—";
