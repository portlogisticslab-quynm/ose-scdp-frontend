// Plan view along the quay: ship outline, bay groups, cranes at their logged (or interpolated) position.
import type { ReplayState } from "../lib/replay";
import { qcX } from "../lib/replay";
import type { ScdpDoc, SimEvent } from "../lib/types";

export default function QuayStrip({ doc, state, events }: { doc: ScdpDoc; state?: ReplayState; events: SimEvent[] }) {
  const s = doc.vessel.bow_direction === "QUAY_RIGHT" ? 1 : -1;
  const o = doc.scenario.vessel_origin_quay_x_m;
  const xs = doc.slots.map((sl) => o + s * sl.x_m);
  const qx0 = doc.quay_cranes.map((q) => q.initial_x_m);
  const lo = Math.min(...xs, ...qx0) - 25, hi = Math.max(...xs, ...qx0) + 25;
  const W = 960, H = 120, sx = (x: number) => ((x - lo) / (hi - lo)) * (W - 20) + 10;
  const bays = [...new Map(doc.slots.filter((sl) => sl.bay % 2 === 0).map((sl) => [sl.bay, o + s * sl.x_m])).entries()];
  const shipL = Math.min(...xs) - 12, shipR = Math.max(...xs) + 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-slate-200 bg-sky-50">
      <rect x={0} y={H - 22} width={W} height={22} fill="#e2e8f0" />
      <text x={6} y={H - 7} fontSize={10} fill="#475569">Bến</text>
      <path d={`M${sx(shipL)},${H - 30} L${sx(shipR)},${H - 30} L${sx(shipR) + (s > 0 ? 18 : 0)},${H - 52} L${sx(shipR)},${H - 74} L${sx(shipL)},${H - 74} L${sx(shipL) - (s < 0 ? 18 : 0)},${H - 52} Z`}
        fill="#fff" stroke="#334155" />
      {bays.map(([b, x]) => (
        <g key={b}>
          <rect x={sx(x) - 8} y={H - 70} width={16} height={36} fill="#dbeafe" stroke="#93c5fd" />
          <text x={sx(x)} y={H - 78} fontSize={9} textAnchor="middle" fill="#334155">{String(b).padStart(2, "0")}</text>
        </g>
      ))}
      {Object.keys(state?.qcs ?? {}).map((q) => {
        const x = sx(state ? qcX(state, q, events) : 0);
        const busy = !!state?.qcs[q].task;
        return (
          <g key={q}>
            <line x1={x} x2={x} y1={14} y2={H - 22} stroke={busy ? "#d97706" : "#64748b"} strokeWidth={3} />
            <rect x={x - 16} y={6} width={32} height={14} rx={2} fill={busy ? "#f59e0b" : "#94a3b8"} />
            <text x={x} y={16} fontSize={9} textAnchor="middle" fill="#fff" fontWeight={600}>{q}</text>
          </g>
        );
      })}
    </svg>
  );
}
