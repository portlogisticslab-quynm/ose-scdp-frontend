import type { GanttBar } from "../lib/replay";
import { fmtTime } from "../lib/replay";

const COLORS: Record<string, string> = { DISCH: "#3b82f6", SHIFT_OUT: "#fb923c", SHIFT_IN: "#fb923c", SHIFT_SHIP: "#fb923c",
  HATCH_OPEN: "#475569", HATCH_CLOSE: "#475569" };

export default function Gantt({ bars, qcs, t, end, onSeek }: { bars: GanttBar[]; qcs: string[]; t?: number; end: number; onSeek?: (t: number) => void }) {
  const W = 960, L = 46, row = 26, H = qcs.length * row + 26;
  const sx = (v: number) => L + ((W - L - 8) * v) / Math.max(1, end);
  const ticks = Array.from({ length: 7 }, (_, i) => (end * i) / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-slate-200 bg-white"
      onClick={(e) => {
        if (!onSeek) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        onSeek(Math.max(0, Math.min(end, ((x - L) / (W - L - 8)) * end)));
      }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={4} y2={H - 18} stroke="#f1f5f9" />
          <text x={sx(v)} y={H - 6} fontSize={9} textAnchor="middle" fill="#64748b">{fmtTime(v)}</text>
        </g>
      ))}
      {qcs.map((q, i) => (
        <g key={q}>
          <text x={4} y={i * row + 20} fontSize={11} fontWeight={600} fill="#0f172a">{q}</text>
          {bars.filter((b) => b.qc === q).map((b) => (
            <rect key={b.task} x={sx(b.start)} y={i * row + 7} width={Math.max(0.8, sx(b.end) - sx(b.start) - 0.4)} height={row - 10}
              fill={COLORS[b.type] ?? "#94a3b8"} opacity={t !== undefined && b.start > t ? 0.35 : 1}>
              <title>{b.task} · {fmtTime(b.start)} → {fmtTime(b.end)}</title>
            </rect>
          ))}
        </g>
      ))}
      {t !== undefined && <line x1={sx(t)} x2={sx(t)} y1={2} y2={H - 18} stroke="#dc2626" strokeWidth={1.5} />}
    </svg>
  );
}
