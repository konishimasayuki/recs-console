"use client";
import { useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    if (r.ok) { location.href = "/"; return; }
    const j = await r.json().catch(() => ({}));
    setErr(j.error ?? "ログインできませんでした");
    setBusy(false);
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>RECS <span>管理コンソール</span></h1>
        <input placeholder="担当者名（操作履歴に記録されます）" value={user} onChange={(e) => setUser(e.target.value)} required />
        <input type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
      </form>
    </div>
  );
}
