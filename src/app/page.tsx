"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapPoint } from "@/components/VehicleMap";

const VehicleMap = dynamic(() => import("@/components/VehicleMap"), {
  ssr: false,
  loading: () => <div className="empty">地図を読み込み中…</div>,
});

type Vehicle = {
  id: string; name: string; memo: string;
  desired: 0 | 1; actual: 0 | 1 | -1; pending: 0 | 1;
  lat: number | null; lng: number | null; fixAt: number | null;
  rssi: number | null; seen: number | null; fw: string; changedAt: number | null; demo?: boolean;
};
type OpLog = { ts: number; id: string; name: string; action: string; by: string; note?: string };
type Status = { key: "ok" | "block" | "wait" | "off"; label: string; color: string };

const POLL_MS = 10_000;

function statusOf(v: Vehicle, now: number, offlineAfterMs: number): Status {
  if (!v.seen || now - v.seen > offlineAfterMs) return { key: "off", label: "通信途絶", color: "#6b7280" };
  if (v.pending) return {
    key: "wait", label: v.desired === 1 ? "阻止ON 反映待ち" : "解除 反映待ち", color: "#e09400",
  };
  if (v.desired === 1 && v.actual === 1) return { key: "block", label: "始動阻止中", color: "#c62828" };
  return { key: "ok", label: "通常", color: "#1e8e4e" };
}

function ago(ts: number | null, now: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}
const fmt = (ts: number) =>
  new Date(ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// SIM7080Gの電波強度(CSQ 0〜31)を目安表示に
function signal(rssi: number | null) {
  if (rssi === null || rssi === 99) return "—";
  if (rssi >= 20) return `強 (${rssi})`;
  if (rssi >= 10) return `中 (${rssi})`;
  return `弱 (${rssi})`;
}

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [offlineAfterMs, setOfflineAfterMs] = useState(900_000);
  const [intervalSec, setIntervalSec] = useState(300);
  const [logs, setLogs] = useState<OpLog[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [track, setTrack] = useState<[number, number][]>([]);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<null | { relay: 0 | 1 }>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ name: "", memo: "" });

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch("/api/vehicles"), fetch("/api/logs")]);
    if (r1.status === 401) { location.href = "/login"; return; }
    const j = await r1.json();
    setVehicles(j.vehicles); setNow(j.now); setOfflineAfterMs(j.offlineAfterMs); setIntervalSec(j.intervalSec);
    if (r2.ok) setLogs((await r2.json()).logs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const selected = vehicles.find((v) => v.id === sel) ?? null;

  useEffect(() => {
    if (!sel) { setTrack([]); return; }
    fetch(`/api/vehicles/${encodeURIComponent(sel)}/track`).then((r) => r.json()).then((j) =>
      setTrack((j.track ?? []).map((p: { lat: number; lng: number }) => [p.lat, p.lng]))
    );
  }, [sel, selected?.fixAt]);

  useEffect(() => {
    if (selected) setEdit({ name: selected.name, memo: selected.memo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return vehicles;
    return vehicles.filter((v) => `${v.name} ${v.memo} ${v.id}`.toLowerCase().includes(k));
  }, [vehicles, q]);

  const counts = useMemo(() => {
    const c = { all: vehicles.length, block: 0, wait: 0, off: 0 };
    for (const v of vehicles) {
      const s = statusOf(v, now, offlineAfterMs).key;
      if (s === "block") c.block++;
      if (s === "wait") c.wait++;
      if (s === "off") c.off++;
    }
    return c;
  }, [vehicles, now, offlineAfterMs]);

  const points: MapPoint[] = vehicles
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v) => ({
      id: v.id, label: v.name || v.id, lat: v.lat!, lng: v.lng!,
      color: statusOf(v, now, offlineAfterMs).color,
    }));

  async function doRelay() {
    if (!selected || !confirm) return;
    setBusy(true);
    await fetch(`/api/vehicles/${encodeURIComponent(selected.id)}/relay`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ relay: confirm.relay, note }),
    });
    setBusy(false); setConfirm(null); setNote("");
    load();
  }

  async function saveInfo() {
    if (!selected) return;
    setBusy(true);
    await fetch("/api/vehicles", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selected.id, ...edit }),
    });
    setBusy(false);
    load();
  }

  async function setDemo(id: string, on: boolean) {
    setBusy(true);
    await fetch(`/api/vehicles/${encodeURIComponent(id)}/demo`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setBusy(false);
    load();
  }

  async function allDemoOff() {
    setBusy(true);
    for (const v of vehicles.filter((x) => x.demo)) {
      await fetch(`/api/vehicles/${encodeURIComponent(v.id)}/demo`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: false }),
      });
    }
    setBusy(false);
    load();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  const demoCount = vehicles.filter((v) => v.demo).length;
  const st = selected ? statusOf(selected, now, offlineAfterMs) : null;
  const minutes = Math.round(intervalSec / 60);

  return (
    <>
      <header className="hdr">
        <h1>RECS <span>管理コンソール</span></h1>
        <div className="sp" />
        <button onClick={logout}>ログアウト</button>
      </header>

      {demoCount > 0 && (
        <div className="demo-bar">
          <span>デモ中の車両が {demoCount} 台あります（通信している扱いで動いています）。本番運用の前にOFFにしてください。</span>
          <button className="btn" disabled={busy} onClick={allDemoOff}>すべてOFF</button>
        </div>
      )}

      <section className="summary">
        <div className="stat"><div className="n">{counts.all}</div><div className="l">登録車両</div></div>
        <div className="stat block"><div className="n">{counts.block}</div><div className="l">始動阻止中</div></div>
        <div className="stat wait"><div className="n">{counts.wait}</div><div className="l">反映待ち</div></div>
        <div className="stat off"><div className="n">{counts.off}</div><div className="l">通信途絶</div></div>
      </section>

      <main className="main">
        <div className="col">
          <input className="search" placeholder="🔍 検索（名前・メモ・ID）" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="vlist">
            {loaded && filtered.length === 0 && (
              <div className="panel empty">
                {vehicles.length === 0 ? "まだ車両がありません。車載器が最初に通信すると自動で表示されます。" : "該当する車両がありません"}
              </div>
            )}
            {filtered.map((v) => {
              const s = statusOf(v, now, offlineAfterMs);
              return (
                <button key={v.id} className={`vcard ${sel === v.id ? "sel" : ""}`} onClick={() => {
                  setSel(v.id);
                  // スマホ（1列表示）では詳細欄までスクロール
                  if (window.innerWidth <= 900) {
                    setTimeout(() => document.getElementById("detail")?.scrollIntoView({ behavior: "smooth" }), 50);
                  }
                }}>
                  <div className="nm">{v.demo && <span className="demo-tag">デモ</span>}{v.name || "（名前未設定）"}</div>
                  <span className={`badge ${s.key}`}>{s.label}</span>
                  <div className="meta">ID {v.id}・最終通信 {ago(v.seen, now)}{v.memo ? `・${v.memo}` : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="col">
          <div className="map">
            <VehicleMap points={points} selectedId={sel} track={track} onSelect={setSel} />
          </div>

          <div className="panel" id="detail">
            <h2>車両の詳細と操作</h2>
            {!selected ? (
              <div className="empty">一覧か地図のピンから車両を選んでください</div>
            ) : (
              <div className="detail">
                <div className="actions">
                  <strong style={{ fontSize: 16 }}>{selected.demo && <span className="demo-tag">デモ</span>}{selected.name || "（名前未設定）"}</strong>
                  <span className={`badge ${st!.key}`}>{st!.label}</span>
                </div>
                <div className="drow">
                  <div className="kv"><div className="k">最終通信</div><div className="v">{ago(selected.seen, now)}</div></div>
                  <div className="kv"><div className="k">位置の測位</div><div className="v">{ago(selected.fixAt, now)}</div></div>
                  <div className="kv"><div className="k">電波</div><div className="v">{signal(selected.rssi)}</div></div>
                  <div className="kv"><div className="k">車両側リレー</div><div className="v">
                    {selected.actual === -1 ? "未報告" : selected.actual === 1 ? "阻止ON" : "OFF"}
                  </div></div>
                </div>
                {selected.lat !== null && (
                  <div className="hint">
                    位置 {selected.lat.toFixed(5)}, {selected.lng!.toFixed(5)}
                    <a style={{ marginLeft: 10 }} href={`https://maps.google.com/?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">Googleマップで開く</a>
                  </div>
                )}

                <div className="actions">
                  <button className="btn danger" disabled={selected.desired === 1} onClick={() => setConfirm({ relay: 1 })}>
                    始動阻止ON
                  </button>
                  <button className="btn safe" disabled={selected.desired === 0} onClick={() => setConfirm({ relay: 0 })}>
                    阻止を解除
                  </button>
                  <span className="hint">{selected.demo ? "デモのため約10秒で反映された扱いになります" : `車両が次に通信した時（最大約${minutes}分後）に反映されます`}</span>
                </div>

                <div className="edit">
                  <input placeholder="車両名（例: プリウス 久留米500あ1234）" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input placeholder="メモ（契約者名・契約番号など）" value={edit.memo} onChange={(e) => setEdit({ ...edit, memo: e.target.value })} />
                  <button className="btn" disabled={busy} onClick={saveInfo}>保存</button>
                </div>
                <label className="demo-switch">
                  <input type="checkbox" checked={!!selected.demo} disabled={busy}
                    onChange={(e) => setDemo(selected.id, e.target.checked)} />
                  デモ（通信している扱い）
                  <span className="hint">説明・練習用。ONにすると約10秒ごとに疑似報告し、阻止の指示も約10秒で反映された扱いになります。本物の車両ではONにしないでください</span>
                </label>
                <div className="hint">ID {selected.id}{selected.fw ? `・ファーム ${selected.fw}` : ""}</div>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>操作履歴</h2>
            <div className="logs">
              {logs.length === 0 ? <div className="empty">まだ履歴がありません</div> : (
                <table><tbody>
                  {logs.map((l, i) => (
                    <tr key={i}>
                      <td className="t">{fmt(l.ts)}</td>
                      <td>{l.name || l.id}</td>
                      <td>{l.action}{l.note ? `（${l.note}）` : ""}</td>
                      <td className="t">{l.by}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          </div>
        </div>
      </main>

      {confirm && selected && (
        <div className="modal-bg" onClick={() => !busy && setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm.relay === 1 ? "始動阻止をONにしますか？" : "始動阻止を解除しますか？"}</h3>
            <div><strong>{selected.name || selected.id}</strong></div>
            {confirm.relay === 1 ? (
              <div className="warn">
                次にエンジンをかける時から始動できなくなります。<b>走行中の車が止まることはありません。</b><br />
                車両が次に通信した時点（最大約{minutes}分後）で反映されます。
              </div>
            ) : (
              <div className="warn ok">車両が次に通信した時点（最大約{minutes}分後）で、エンジンを始動できるようになります。</div>
            )}
            <textarea placeholder="理由・メモ（履歴に残ります）" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>やめる</button>
              <button className={`btn ${confirm.relay === 1 ? "danger" : "safe"}`} disabled={busy} onClick={doRelay}>
                {busy ? "送信中…" : confirm.relay === 1 ? "阻止ONにする" : "解除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
