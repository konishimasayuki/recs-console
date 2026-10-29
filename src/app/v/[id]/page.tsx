"use client";
// 車両の詳細画面：基本情報の編集／位置情報／エンジン制御／この車両の操作履歴
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Tag from "@/components/Tag";
import {
  type Vehicle, type OpLog, POLL_MS,
  statusOf, commBadge, posBadge, engineBadge, dt, ago, signal,
} from "@/lib/view";

const VehicleMap = dynamic(() => import("@/components/VehicleMap"), {
  ssr: false,
  loading: () => <div className="empty">地図を読み込み中…</div>,
});

type Info = {
  name: string; model: string; customer: string; firstReg: string; katashiki: string;
  group: string; staff: string; payment: string; memo: string;
};
const pick = (v: Vehicle): Info => ({
  name: v.name, model: v.model, customer: v.customer, firstReg: v.firstReg, katashiki: v.katashiki,
  group: v.group, staff: v.staff, payment: v.payment, memo: v.memo,
});

export default function VehicleDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = decodeURIComponent(rawId);
  const [v, setV] = useState<Vehicle | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offlineAfterMs, setOfflineAfterMs] = useState(900_000);
  const [intervalSec, setIntervalSec] = useState(300);
  const [logs, setLogs] = useState<OpLog[]>([]);
  const [track, setTrack] = useState<[number, number][]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [form, setForm] = useState<Info | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { relay: 0 | 1 }>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/vehicles/${encodeURIComponent(id)}`);
    if (r.status === 401) { location.href = "/login"; return; }
    if (r.status === 404) { setMissing(true); return; }
    const j = await r.json();
    setV(j.vehicle); setNow(j.now); setOfflineAfterMs(j.offlineAfterMs); setIntervalSec(j.intervalSec);
    const rl = await fetch(`/api/logs?id=${encodeURIComponent(id)}`);
    if (rl.ok) setLogs((await rl.json()).logs);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // 入力中に定期更新で書き換わらないよう、フォームは最初の1回と保存後だけ車両データから作る
  useEffect(() => {
    if (v && !dirty) setForm(pick(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id, v?.name, v?.customer, v?.model, v?.group, v?.memo, v?.staff, v?.payment, v?.katashiki, v?.firstReg]);

  // 所属グループの候補（他の車両で使われているもの）
  useEffect(() => {
    fetch("/api/vehicles").then((r) => r.ok ? r.json() : null).then((j) => {
      if (!j) return;
      const g = new Set<string>(["エンジン", "スリーエイト"]);
      for (const x of j.vehicles as Vehicle[]) if (x.group) g.add(x.group);
      setGroups([...g]);
    });
  }, []);

  useEffect(() => {
    fetch(`/api/vehicles/${encodeURIComponent(id)}/track`).then((r) => r.json()).then((j) =>
      setTrack((j.track ?? []).map((p: { lat: number; lng: number }) => [p.lat, p.lng]))
    ).catch(() => {});
  }, [id, v?.fixAt]);

  function set<K extends keyof Info>(k: K, val: string) {
    setForm((f) => (f ? { ...f, [k]: val } : f));
    setDirty(true); setSaved(false);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    const r = await fetch("/api/vehicles", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...form }),
    });
    setBusy(false);
    if (r.ok) {
      const j = await r.json();
      setV(j.vehicle); setForm(pick(j.vehicle)); setDirty(false); setSaved(true);
      load();
    }
  }

  async function doRelay() {
    if (!confirm) return;
    setBusy(true);
    await fetch(`/api/vehicles/${encodeURIComponent(id)}/relay`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ relay: confirm.relay, note }),
    });
    setBusy(false); setConfirm(null); setNote("");
    load();
  }

  async function setDemo(on: boolean) {
    setBusy(true);
    await fetch(`/api/vehicles/${encodeURIComponent(id)}/demo`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setBusy(false);
    load();
  }

  if (missing) {
    return (
      <>
        <Header />
        <main className="page"><div className="panel empty">この車両は見つかりません。<Link href="/">一覧に戻る</Link></div></main>
      </>
    );
  }
  if (!v || !form) {
    return (<><Header /><main className="page"><div className="panel empty">読み込み中…</div></main></>);
  }

  const st = statusOf(v, now, offlineAfterMs);
  const minutes = Math.round(intervalSec / 60);
  const title = v.name || `未登録 ${v.id}`;
  const point = v.lat !== null && v.lng !== null
    ? [{ id: v.id, label: title, lat: v.lat, lng: v.lng, color: st.color }]
    : [];

  return (
    <>
      <Header />
      <main className="page">
        <div className="crumb">
          <Link href="/">← 車両一覧</Link>
          <h2 className="vtitle">{v.demo && <span className="demo-tag">デモ</span>}{title}</h2>
          <span className="sp" />
          <Tag b={commBadge(v, now, offlineAfterMs)} />
          <Tag b={engineBadge(v)} />
        </div>

        <div className="dgrid">
          {/* ===== 基本情報 ===== */}
          <section className="panel card">
            <h3 className="card-h">基本情報</h3>
            <div className="form">
              <Field label="車台番号" req>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例: JF1-2204248" />
              </Field>
              <Field label="機材（車載器ID）">
                <input value={v.id} readOnly className="ro" />
              </Field>
              <Field label="車種">
                <input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="例: Nボックス" />
              </Field>
              <Field label="利用者">
                <input value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="例: 山田 太郎 様" />
              </Field>
              <Field label="初年度登録年月">
                <input type="month" value={form.firstReg} onChange={(e) => set("firstReg", e.target.value)} />
              </Field>
              <Field label="型式">
                <input value={form.katashiki} onChange={(e) => set("katashiki", e.target.value)} placeholder="例: DBA-JF1" />
              </Field>
              <Field label="所属グループ" req>
                <input list="grp-list" value={form.group} onChange={(e) => set("group", e.target.value)} placeholder="エンジン / スリーエイト" />
                <datalist id="grp-list">{groups.map((g) => <option key={g} value={g} />)}</datalist>
              </Field>
              <Field label="担当者">
                <input value={form.staff} onChange={(e) => set("staff", e.target.value)} placeholder="未設定" />
              </Field>
              <Field label="支払方法" req>
                <input list="pay-list" value={form.payment} onChange={(e) => set("payment", e.target.value)} placeholder="例: 48回払い" />
                <datalist id="pay-list">
                  {["12回払い", "24回払い", "36回払い", "48回払い", "60回払い", "72回払い", "84回払い"].map((p) => <option key={p} value={p} />)}
                </datalist>
              </Field>
              <div />
              <Field label="備考" wide>
                <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={4} />
              </Field>
            </div>
            <div className="form-foot">
              {saved && !dirty && <span className="hint ok-text">保存しました</span>}
              {dirty && <span className="hint">未保存の変更があります</span>}
              <button className="btn primary" disabled={busy || !dirty} onClick={save}>保存</button>
            </div>
          </section>

          <div className="dside">
            {/* ===== 位置情報 ===== */}
            <section className="panel card">
              <h3 className="card-h">位置情報 <span className="sp" /><Tag b={posBadge(v, now, offlineAfterMs)} /></h3>
              <div className="map small">
                {point.length ? (
                  <VehicleMap points={point} selectedId={v.id} track={track} onSelect={() => {}} />
                ) : <div className="empty">まだ位置情報がありません</div>}
              </div>
              <dl className="kvlist">
                <dt>最終通信</dt><dd>{dt(v.seen)}<small>{v.seen ? `（${ago(v.seen, now)}）` : ""}</small></dd>
                <dt>最終測位</dt><dd>{dt(v.fixAt)}<small>{v.fixAt ? `（${ago(v.fixAt, now)}）` : ""}</small></dd>
                <dt>緯度/経度</dt>
                <dd>
                  {v.lat !== null ? (
                    <a href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">
                      {v.lat.toFixed(4)}° N, {v.lng!.toFixed(4)}° E
                    </a>
                  ) : "—"}
                </dd>
                <dt>電波</dt><dd>{signal(v.rssi)}</dd>
                <dt>ファーム</dt><dd>{v.fw || "—"}</dd>
              </dl>
            </section>

            {/* ===== エンジン制御 ===== */}
            <section className="panel card">
              <h3 className="card-h">エンジン制御</h3>
              <div className={`engine-box ${st.key}`}>
                <span className="dot" />
                <div>
                  <div className="eb-t">
                    {v.pending
                      ? v.desired === 1 ? "始動阻止を指示済み（車両の反映待ち）" : "解除を指示済み（車両の反映待ち）"
                      : v.desired === 1 ? "始動阻止中" : "エンジン始動可"}
                  </div>
                  <div className="eb-s">
                    車両側リレー：{v.actual === -1 ? "未報告" : v.actual === 1 ? "阻止ON" : "OFF"}
                    {v.changedAt ? `・最終操作 ${dt(v.changedAt)}` : ""}
                  </div>
                </div>
              </div>
              {v.desired === 0 ? (
                <button className="btn danger wide" onClick={() => setConfirm({ relay: 1 })}>⏻ 始動阻止ON</button>
              ) : (
                <button className="btn safe wide" onClick={() => setConfirm({ relay: 0 })}>阻止を解除</button>
              )}
              <div className="hint">
                {v.demo ? "デモのため約10秒で反映された扱いになります" : `車両が次に通信した時（最大約${minutes}分後）に反映されます。走行中に止まることはありません`}
              </div>
              <label className="demo-switch">
                <input type="checkbox" checked={!!v.demo} disabled={busy} onChange={(e) => setDemo(e.target.checked)} />
                デモ（通信している扱い）
                <span className="hint">説明・練習用。本物の車両ではONにしないでください</span>
              </label>
            </section>
          </div>
        </div>

        <div className="panel">
          <h2>この車両の操作履歴</h2>
          <div className="logs">
            {logs.length === 0 ? <div className="empty">まだ履歴がありません</div> : (
              <table><tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td className="t">{dt(l.ts)}</td>
                    <td>{l.action}{l.note ? `（${l.note}）` : ""}</td>
                    <td className="t">{l.by}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      </main>

      {confirm && (
        <div className="modal-bg" onClick={() => !busy && setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm.relay === 1 ? "始動阻止をONにしますか？" : "始動阻止を解除しますか？"}</h3>
            <div><strong>{title}</strong>{v.customer ? `（${v.customer}）` : ""}</div>
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

function Header() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }
  return (
    <header className="hdr">
      <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>RECS <span>車両管理</span></Link></h1>
      <div className="sp" />
      <button onClick={logout}>ログアウト</button>
    </header>
  );
}

function Field({ label, req, wide, children }: { label: string; req?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="fl">{label}{req && <b className="req">*</b>}</span>
      {children}
    </label>
  );
}
