"use client";
// 地図（OpenStreetMap、APIキー不要）。全車両の位置と、選択中車両の軌跡を表示
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";

export type MapPoint = { id: string; label: string; lat: number; lng: number; color: string };

function FitView({ points, focus }: { points: MapPoint[]; focus: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
    } else if (points.length > 1) {
      map.fitBounds(points.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [30, 30] });
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
  return (
    <MapContainer center={[33.2, 130.4]} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitView points={points} focus={focus} />
      {track.length > 1 && <Polyline positions={track} pathOptions={{ color: "#e8730c", weight: 3, opacity: 0.8 }} />}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.id === selectedId ? 11 : 8}
          pathOptions={{ color: "#fff", weight: 2, fillColor: p.color, fillOpacity: 1 }}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{p.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
