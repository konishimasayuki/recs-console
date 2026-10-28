// 車載器シミュレータ（実機がなくても管理画面の動作確認ができる）
// 使い方:
//   node scripts/sim-car.mjs --url http://localhost:3000 --key <DEVICE_KEY> --cars 3 --every 5
//   --every は報告間隔(秒)。本番の車載器は300秒だが、テストでは短くして反映を早く見る。
// 動き: 各車が少しずつ移動しながら報告し、サーバーの返事(r)に合わせてリレーを切り替える。

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const URL = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = args.key ?? process.env.DEVICE_KEY;
const CARS = Number(args.cars ?? 3);
const EVERY = Number(args.every ?? 5) * 1000;
if (!KEY) { console.error("--key が必要です（サーバーの DEVICE_KEY と同じ値）"); process.exit(1); }

// 福岡県大川市あたりを起点に配置
const base = [33.2063, 130.3836];
const cars = Array.from({ length: CARS }, (_, i) => ({
  id: `sim${String(i + 1).padStart(3, "0")}`,
  lat: base[0] + (Math.random() - 0.5) * 0.08,
  lng: base[1] + (Math.random() - 0.5) * 0.08,
  relay: 0,
}));

async function tick(c) {
  c.lat += (Math.random() - 0.5) * 0.002;
  c.lng += (Math.random() - 0.5) * 0.002;
  const body = { id: c.id, relay: c.relay, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), fix: 1, rssi: 12 + Math.floor(Math.random() * 15), fw: "sim-0.1" };
  try {
    const r = await fetch(`${URL}/api/device/report`, {
      method: "POST", headers: { "content-type": "application/json", "x-device-key": KEY }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) { console.log(`${c.id}  エラー ${r.status} ${JSON.stringify(j)}`); return; }
    if (j.r !== c.relay) {
      console.log(`${c.id}  指令受信 → リレー ${j.r === 1 ? "ON（始動阻止）" : "OFF（解除）"} に切替`);
      c.relay = j.r; // 実機ならここで GPIO4 を切り替え、フラッシュに保存する
    } else {
      console.log(`${c.id}  報告OK  リレー=${c.relay}  (${body.lat}, ${body.lng})`);
    }
  } catch (e) {
    console.log(`${c.id}  通信失敗 ${e.message}`);
  }
}

console.log(`シミュレータ開始: ${CARS}台 / ${EVERY / 1000}秒ごと → ${URL}`);
for (const c of cars) tick(c);
setInterval(() => cars.forEach(tick), EVERY);
