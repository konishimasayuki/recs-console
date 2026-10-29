"use client";
// 車両一覧（地図＋表）。行かピンを押すと詳細画面へ
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapPoint } from "@/components/VehicleMap";
import Tag from "@/components/Tag";
import {
  type Vehicle, type OpLog, POLL_MS,
  statusOf, commBadge, posBadge, engineBadge, dt, dash,
} from "@/lib/view";

const VehicleMap = dynamic(() => import("@/components/VehicleMap"), {
  ssr: false,
  loading: () => <div className="empty">地図を読み込み中…</div>,
});

type Fil = "all" | "block" | "wait" | "off";

export default function Dashboard() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [offlineAfterMs, setOfflineAfterMs] = useState(900_000);
  const [logs, setLogs] = useState<OpLog[]>([]);
  const [q, setQ] = useState("");
  const [fil, setFil] = useState<Fil>("all");
  const [grp, setGrp] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch("/api/vehicles"), fetch("/api/logs")]);
    if (r1.status === 401) { location.href = "/login"; return; }
    const j = await r1.json();
    setVehicles(j.vehicles); setNow(j.now); setOfflineAfterMs(j.offlineAfterMs);
    if (r2.ok) setLogs((await r2.json()).logs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const groups = useMemo(
    () => [...new Set(vehicles.map((v) => v.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")),
    [vehicles],
  );

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return vehicles.filter((v) =>
      (fil === "all" || statusOf(v, now, offlineAfterMs).key === fil) &&
      (!grp || v.group === grp) &&
      (!k || `${v.name} ${v.customer} ${v.model} ${v.memo} ${v.id} ${v.group}`.toLowerCase().includes(k))
    );
  }, [vehicles, q, fil, grp, now, offlineAfterMs]);

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

  // 地図は一覧の絞り込みに合わせる
  const points: MapPoint[] = filtered
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v) => ({
      id: v.id,
      label: [v.name || v.id, v.customer].filter(Boolean).join("　"),
      lat: v.lat!, lng: v.lng!,
      color: statusOf(v, now, offlineAfterMs).color,
    }));

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  const demoCount = vehicles.filter((v) => v.demo).length;
  const filLabel = { block: "始動阻止中", wait: "反映待ち", off: "通信断" } as const;

  return (
    <>
      <header className="hdr">
        <h1>RECS <span>車両管理</span></h1>
        <div className="sp" />
        <button onClick={logout}>ログアウト</button>
      </header>

      {demoCount > 0 && (
        <div className="demo-bar">
          <span>デモ中の車両が {demoCount} 台あります（通信している扱いで動いています）。本番運用の前に各車両の詳細画面でOFFにしてください。</span>
        </div>
      )}

      <section className="summary">
        {([
          ["all", "", counts.all, "登録車両"],
          ["block", "block", counts.block, "始動阻止中"],
          ["wait", "wait", counts.wait, "反映待ち"],
          ["off", "off", counts.off, "通信断"],
        ] as const).map(([key, cls, n, label]) => (
          <button key={key} type="button" className={`stat ${cls} ${fil === key ? "on" : ""}`}
            aria-pressed={fil === key} onClick={() => setFil(key)}>
            <div className="n">{n}</div><div className="l">{label}</div>
          </button>
        ))}
      </section>

      <main className="page">
        <div className="toolbar">
          <input className="search" placeholder="🔍 検索（車台番号・利用者・車種・備考）" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="sel" value={grp} onChange={(e) => setGrp(e.target.value)}>
            <option value="">すべてのグループ</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {(fil !== "all" || grp) && (
            <div className="fil-chip">
              {[fil !== "all" ? filLabel[fil] : "", grp].filter(Boolean).join("・")}の車両だけ表示中（{filtered.length}台）
              <button type="button" onClick={() => { setFil("all"); setGrp(""); }}>全車両に戻す</button>
            </div>
          )}
        </div>

        <div className="map big">
          <VehicleMap points={points} selectedId={null} track={[]} onSelect={(id) => router.push(`/v/${encodeURIComponent(id)}`)} />
        </div>

        <div className="panel tbl-wrap">
          <table className="vtbl">
            <thead>
              <tr>
                <th>車台番号</th><th>グループ</th><th>車種</th><th>利用者</th>
                <th>通信</th><th>位置情報</th><th>エンジン</th><th>最終位置更新</th>
              </tr>
            </thead>
            <tbody>
              {loaded && filtered.length === 0 && (
                <tr><td colSpan={8} className="empty">
                  {vehicles.length === 0 ? "まだ車両がありません。車載器が最初に通信すると自動で表示されます。" : "該当する車両がありません"}
                </td></tr>
              )}
              {filtered.map((v) => (
                <tr key={v.id} onClick={() => router.push(`/v/${encodeURIComponent(v.id)}`)}>
                  <td>
                    <Link href={`/v/${encodeURIComponent(v.id)}`} className="vlink" onClick={(e) => e.stopPropagation()}>
                      {v.demo && <span className="demo-tag">デモ</span>}{v.name || `（未登録 ${v.id}）`}
                    </Link>
                  </td>
                  <td>{dash(v.group)}</td>
                  <td>{dash(v.model)}</td>
                  <td>{dash(v.customer)}</td>
                  <td><Tag b={commBadge(v, now, offlineAfterMs)} /></td>
                  <td><Tag b={posBadge(v, now, offlineAfterMs)} /></td>
                  <td><Tag b={engineBadge(v)} /></td>
                  <td className="num">{dt(v.fixAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>操作履歴（全車両）</h2>
          <div className="logs">
            {logs.length === 0 ? <div className="empty">まだ履歴がありません</div> : (
              <table><tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td className="t">{dt(l.ts)}</td>
                    <td>{l.name || l.id}</td>
                    <td>{l.action}{l.note ? `（${l.note}）` : ""}</td>
                    <td className="t">{l.by}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
