// Small dependency-free SVG step chart (values hold between checkpoints) with optional horizontal limit lines and a time cursor.
import { fmtTime } from "../lib/replay";

export interface Series { name: string; color: string; points: [number, number][] }
export interface Limit { value: number; label: string }

export default function LineChart({ title, unit, series, limits = [], tMax, height = 180 }:
  { title: string; unit: string; series: Series[]; limits?: Limit[]; tMax: number; height?: number }) {
  const W = 960, L = 56, R = 12, T = 22, B = 22, H = height;
  const ys = [...series.flatMap((s) => s.points.map((p) => p[1])), ...limits.map((l) => l.value)];
  if (!ys.length) return null;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const sx = (t: number) => L + ((W - L - R) * t) / Math.max(1, tMax);
  const sy = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo);
  const yt = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-slate-200 bg-white">
      <text x={L} y={14} fontSize={11} fontWeight={600} fill="#0f172a">{title}</text>
      {yt.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="#f1f5f9" />
          <text x={L - 4} y={sy(v) + 3} fontSize={9} textAnchor="end" fill="#64748b">{v.toFixed(Math.abs(hi - lo) < 1 ? 3 : 2)}</text>
        </g>
      ))}
      <text x={6} y={T + 8} fontSize={9} fill="#64748b">{unit}</text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={sx(tMax * f)} y={H - 6} fontSize={9} textAnchor="middle" fill="#64748b">{fmtTime(tMax * f)}</text>
      ))}
      {limits.map((l) => (
        <g key={l.label + l.value}>
          <line x1={L} x2={W - R} y1={sy(l.value)} y2={sy(l.value)} stroke="#dc2626" strokeDasharray="5 3" />
          <text x={W - R - 2} y={sy(l.value) - 3} fontSize={9} textAnchor="end" fill="#dc2626">{l.label}</text>
        </g>
      ))}
      {series.map((s) => (
        <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={1.6}
          points={s.points.flatMap(([t, v], i) => (i ? [[t, s.points[i - 1][1]], [t, v]] : [[t, v]]))
            .map(([t, v]) => `${sx(t)},${sy(v)}`).join(" ")} />
      ))}
      {series.length > 1 && series.map((s, i) => (
        <text key={s.name} x={L + 140 + i * 120} y={14} fontSize={10} fill={s.color}>— {s.name}</text>
      ))}
    </svg>
  );
}
