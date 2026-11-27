// 2D bay plan: one cross-section per 40' bay group, deck above / hold below, viewed from aft (port left).
import { useMemo } from "react";
import type { BoxState, ReplayState } from "../lib/replay";
import type { Container, ScdpDoc, Slot } from "../lib/types";

const CW = 26, CH = 15, GAP = 6;

// port (even rows) on the left, centre row 00, starboard (odd rows) on the right
const rowKey = (r: number) => (r === 0 ? 0 : r % 2 === 0 ? -r : r);
const groupOf = (bay: number) => Math.floor((bay - 1 - (bay % 2 === 0 ? 1 : 0)) / 4);

function fill(c: Container, b: BoxState | undefined): { fill: string; stroke: string; dash?: string; label: string } {
  const st = b?.status ?? "ON_SHIP";
  if (st === "AT_YARD") return { fill: "transparent", stroke: "#cbd5e1", dash: "2 2", label: "đã về bãi" };
  if (st === "ON_TRUCK" || st === "LIFTED") return { fill: "#facc15", stroke: "#a16207", label: st === "LIFTED" ? "đang nhấc" : "trên xe" };
  if (st === "ON_QUAY") return { fill: "transparent", stroke: "#f97316", dash: "3 2", label: "tạm trên bến" };
  if (c.action === "STAY") return { fill: "#cbd5e1", stroke: "#94a3b8", label: "ở lại tàu" };
  if (c.action.startsWith("RESTOW")) return { fill: "#fb923c", stroke: "#c2410c", label: "restow" };
  return { fill: "#3b82f6", stroke: "#1d4ed8", label: "dỡ" };
}

export default function BayPlan({ doc, state, activeGroups }: { doc: ScdpDoc; state?: ReplayState; activeGroups?: Record<number, string> }) {
  const groups = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of doc.slots) {
      const g = groupOf(s.bay);
      m.set(g, [...(m.get(g) ?? []), s]);
    }
    // same left-to-right order as the quay strip
    const sgn = doc.vessel.bow_direction === "QUAY_RIGHT" ? 1 : -1;
    return [...m.entries()].sort((a, b) => sgn * (a[1][0].x_m - b[1][0].x_m));
  }, [doc]);
  // boxes currently in each slot (a box re-landed on the ship is drawn at its new slot)
  const bySlot = useMemo(() => {
    const m = new Map<string, Container>();
    for (const c of doc.containers) m.set(state?.boxes[c.container_id]?.slot ?? c.slot_id, c);
    return m;
  }, [doc, state]);

  return (
    <div className="flex flex-wrap gap-4">
      {groups.map(([g, slots]) => {
        const bays = [...new Set(slots.map((s) => s.bay))].sort((a, b) => a - b);
        const rows = [...new Set(slots.map((s) => s.row))].sort((a, b) => rowKey(a) - rowKey(b));
        const deckT = [...new Set(slots.filter((s) => s.deck === "DECK").map((s) => s.tier))].sort((a, b) => b - a);
        const holdT = [...new Set(slots.filter((s) => s.deck === "HOLD").map((s) => s.tier))].sort((a, b) => b - a);
        const W = rows.length * CW + 30, H = (deckT.length + holdT.length) * CH + GAP * 2 + 34;
        const y0 = 20, yHatch = y0 + deckT.length * CH + GAP;
        const covers = (doc.hatch_covers ?? []).filter((h) => h.bays.some((b) => groupOf(b) === g));
        const qc = activeGroups?.[g];
        const evenBay = bays.find((b) => b % 2 === 0) ?? bays[0];
        return (
          <svg key={g} width={W} height={H} className={`rounded border bg-white ${qc ? "border-amber-500 ring-2 ring-amber-300" : "border-slate-200"}`}>
            <text x={4} y={13} fontSize={11} fontWeight={600} fill="#0f172a">Bay {String(evenBay).padStart(2, "0")}</text>
            {qc && <text x={W - 4} y={13} fontSize={10} textAnchor="end" fill="#b45309">{qc}</text>}
            {[...deckT.map((t, i) => ({ t, y: y0 + i * CH })), ...holdT.map((t, i) => ({ t, y: yHatch + GAP + i * CH }))].map(({ t, y }) => (
              <text key={t} x={W - 3} y={y + CH - 4} fontSize={8} textAnchor="end" fill="#94a3b8">{String(t).padStart(2, "0")}</text>
            ))}
            {covers.map((h) => {
              const cols = rows.map((r, i) => (h.rows.includes(r) ? i : -1)).filter((i) => i >= 0);
              if (!cols.length) return null;
              const st = state?.hatches[h.cover_id] ?? "CLOSED";
              return <rect key={h.cover_id} x={4 + Math.min(...cols) * CW} y={yHatch} width={(Math.max(...cols) - Math.min(...cols) + 1) * CW - 2}
                height={GAP - 1} fill={st === "CLOSED" ? "#475569" : st === "OPEN" ? "transparent" : "#f59e0b"} stroke="#475569"
                strokeDasharray={st === "OPEN" ? "3 2" : undefined}><title>{h.cover_id}: {st}</title></rect>;
            })}
            {rows.map((r, ri) => (
              <text key={r} x={4 + ri * CW + CW / 2 - 1} y={H - 4} fontSize={8} textAnchor="middle" fill="#94a3b8">{String(r).padStart(2, "0")}</text>
            ))}
            {slots.map((s) => {
              const ri = rows.indexOf(s.row);
              const ti = s.deck === "DECK" ? deckT.indexOf(s.tier) : holdT.indexOf(s.tier);
              const y = s.deck === "DECK" ? y0 + ti * CH : yHatch + GAP + ti * CH;
              const half = s.bay % 2 === 1 ? (s.bay === Math.min(...bays.filter((b) => b % 2 === 1)) ? 0 : 1) : -1;
              const x = 4 + ri * CW + (half === 1 ? (CW - 2) / 2 : 0);
              const w = half === -1 ? CW - 2 : (CW - 2) / 2;
              const c = bySlot.get(s.slot_id);
              const f = c ? fill(c, state?.boxes[c.container_id]) : null;
              return (
                <rect key={s.slot_id} x={x} y={y} width={w} height={CH - 2} rx={1.5}
                  fill={f?.fill ?? "transparent"} stroke={f?.stroke ?? (half === -1 && !c ? "#e2e8f0" : "transparent")}
                  strokeDasharray={f?.dash}>
                  <title>{s.slot_id}{c ? ` · ${c.container_id} · ${c.gross_mass_t} t · ${c.pod} · ${f?.label}` : " · trống"}</title>
                </rect>
              );
            })}
          </svg>
        );
      })}
    </div>
  );
}

export function BayLegend() {
  const items: [string, string, string?][] = [["#3b82f6", "Dỡ"], ["#fb923c", "Restow"], ["#cbd5e1", "Ở lại tàu"],
    ["#facc15", "Đang nhấc / trên xe"], ["transparent", "Đã về bãi", "2 2"]];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
      {items.map(([c, l, d]) => (
        <span key={l} className="flex items-center gap-1">
          <svg width={14} height={10}><rect x={1} y={1} width={12} height={8} fill={c} stroke="#64748b" strokeDasharray={d} /></svg>{l}
        </span>
      ))}
      <span className="flex items-center gap-1"><svg width={14} height={10}><rect x={1} y={3} width={12} height={4} fill="#475569" /></svg>Nắp hầm đóng</span>
    </div>
  );
}
