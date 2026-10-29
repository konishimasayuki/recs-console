"use client";
// 地図（OpenStreetMap、APIキー不要）。全車両の位置をピンで表示し、選択中車両の軌跡を描く
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";

export type MapPoint = { id: string; label: string; lat: number; lng: number; color: string };

// 状態の色のピン（白い縁と影で地図の上でも見やすく）
function pinIcon(color: string, big: boolean) {
  const w = big ? 36 : 28;
  const h = big ? 50 : 40;
  return L.divIcon({
    className: "recs-pin",
    html:
      `<svg width="${w}" height="${h}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M14 1.5C7 1.5 1.5 7 1.5 14c0 9.5 12.5 24.5 12.5 24.5S26.5 23.5 26.5 14C26.5 7 21 1.5 14 1.5z" ` +
      `fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
      `<circle cx="14" cy="14" r="5" fill="#ffffff"/></svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    tooltipAnchor: [0, -h + 6],
  });
}

function FitView({ points, focus }: { points: MapPoint[]; focus: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
    } else if (points.length > 1) {
      map.fitBounds(points.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [40, 40] });
    }
    // 選択が変わった時だけ動かす（定期更新のたびに地図が跳ねないように）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, points.length]);
  return null;
}

export default function VehicleMap({
  points, selectedId, track, onSelect,
}: {
  points: MapPoint[];
  selectedId: string | null;
  track: [number, number][];
  onSelect: (id: string) => void;
}) {
  const focus = points.find((p) => p.id === selectedId) ?? null;
  // 色と選択状態が同じなら同じアイコンを使い回す（更新のたびに作り直さない）
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const p of points) {
      const key = `${p.color}|${p.id === selectedId}`;
      if (!m.has(key)) m.set(key, pinIcon(p.color, p.id === selectedId));
    }
    return m;
  }, [points, selectedId]);

  return (
    <MapContainer center={[33.2, 130.4]} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitView points={points} focus={focus} />
      {track.length > 1 && <Polyline positions={track} pathOptions={{ color: "#e8730c", weight: 3, opacity: 0.8 }} />}
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={icons.get(`${p.color}|${p.id === selectedId}`)!}
          zIndexOffset={p.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top">{p.label}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
