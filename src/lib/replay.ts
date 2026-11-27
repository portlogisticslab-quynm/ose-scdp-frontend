// Replay core (T15): the picture at time t is a pure function of the executed event log.
// Animation may interpolate between two events (crane travel) but never creates an event (Đề cương 9.2).
import type { ScdpDoc, SimEvent } from "./types";

export type BoxStatus = "ON_SHIP" | "LIFTED" | "ON_TRUCK" | "ON_QUAY" | "AT_YARD";
export interface BoxState { status: BoxStatus; slot: string; truck?: string }
export interface QcState { x: number; task?: string; moving?: { from: number; to: number; t0: number } }
export type HatchState = "CLOSED" | "OPENING" | "OPEN" | "CLOSING";
export type TruckState = "QUAY" | "LOADED" | "TO_YARD" | "AT_YARD" | "TO_QUAY";

export interface ReplayState {
  t: number; index: number;                      // events[0..index) applied
  boxes: Record<string, BoxState>;
  qcs: Record<string, QcState>;
  hatches: Record<string, HatchState>;
  trucks: Record<string, TruckState>;
}

export class ReplayError extends Error {}

export function checkEvents(events: SimEvent[]): void {
  const ids = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    if (ids.has(events[i].event_id)) throw new ReplayError(`event_id ${events[i].event_id} bị trùng`);
    ids.add(events[i].event_id);
    if (i && events[i].t_s < events[i - 1].t_s) throw new ReplayError(`thời gian giảm tại event_id ${events[i].event_id}`);
  }
}

export function initialState(doc: ScdpDoc): ReplayState {
  const boxes: Record<string, BoxState> = {};
  for (const c of doc.containers) boxes[c.container_id] = { status: "ON_SHIP", slot: c.slot_id };
  const qcs: Record<string, QcState> = {};
  for (const q of doc.quay_cranes) if (doc.scenario.qc_ids.includes(q.qc_id)) qcs[q.qc_id] = { x: q.initial_x_m };
  const hatches: Record<string, HatchState> = {};
  for (const h of doc.hatch_covers ?? []) hatches[h.cover_id] = "CLOSED";
  const trucks: Record<string, TruckState> = {};
  for (let i = 1; i <= doc.trucks.count; i++) trucks[`T${String(i).padStart(2, "0")}`] = "QUAY";
  return { t: 0, index: 0, boxes, qcs, hatches, trucks };
}

function clone(s: ReplayState): ReplayState {
  return { t: s.t, index: s.index, boxes: { ...s.boxes }, qcs: { ...s.qcs }, hatches: { ...s.hatches }, trucks: { ...s.trucks } };
}

const kind = (task?: string) => (task ?? "").split(":")[0];
const obj = (task?: string) => (task ?? "").split(":").slice(1).join(":");

function apply(s: ReplayState, e: SimEvent): void {
  const q = e.qc;
  switch (e.type) {
    case "QC_MOVE_START": if (q) s.qcs[q] = { ...s.qcs[q], moving: { from: e.from_x!, to: e.to_x!, t0: e.t_s } }; break;
    case "QC_MOVE_END": if (q) s.qcs[q] = { x: e.x!, task: s.qcs[q].task }; break;
    case "QC_START":
      if (q) s.qcs[q] = { ...s.qcs[q], task: e.task };
      if (kind(e.task) === "HATCH_OPEN") s.hatches[obj(e.task)] = "OPENING";
      if (kind(e.task) === "HATCH_CLOSE") s.hatches[obj(e.task)] = "CLOSING";
      break;
    case "LIFT_OFF": s.boxes[e.container!] = { ...s.boxes[e.container!], status: "LIFTED" }; break;
    case "TRANSFER_TO_TRUCK":
      s.boxes[e.container!] = { ...s.boxes[e.container!], status: "ON_TRUCK", truck: e.truck };
      s.trucks[e.truck!] = "LOADED"; break;
    case "TRUCK_DEPART": s.trucks[e.truck!] = "TO_YARD"; break;
    case "TRUCK_ARRIVE_YARD": s.trucks[e.truck!] = "AT_YARD"; break;
    case "YARD_ACCEPT": s.boxes[e.container!] = { status: "AT_YARD", slot: s.boxes[e.container!].slot }; s.trucks[e.truck!] = "TO_QUAY"; break;
    case "TRUCK_RETURN": s.trucks[e.truck!] = "QUAY"; break;
    case "LAND_ON_QUAY": s.boxes[e.object ?? e.container!] = { ...s.boxes[e.object ?? e.container!], status: "ON_QUAY" }; break;
    case "LAND_ON_SHIP": s.boxes[e.container!] = { status: "ON_SHIP", slot: e.slot! }; break;
    case "TASK_COMPLETE":
      if (q) s.qcs[q] = { ...s.qcs[q], task: undefined };
      if (kind(e.task) === "HATCH_OPEN") s.hatches[obj(e.task)] = "OPEN";
      if (kind(e.task) === "HATCH_CLOSE") s.hatches[obj(e.task)] = "CLOSED";
      break;
    default: break;
  }
}

/** Advance a state to time t (events with t_s <= t). Returns a new state; the input is not changed. */
export function advance(s0: ReplayState, events: SimEvent[], t: number): ReplayState {
  if (t < s0.t) throw new ReplayError("advance chỉ đi tiến; dùng stateAt để lùi");
  const s = clone(s0);
  while (s.index < events.length && events[s.index].t_s <= t) apply(s, events[s.index++]);
  s.t = t;
  return s;
}

/** Seek: state at time t computed from the start. */
export function stateAt(doc: ScdpDoc, events: SimEvent[], t: number): ReplayState {
  return advance(initialState(doc), events, t);
}

/** Crane position for drawing: interpolated only while a logged move is in progress. */
export function qcX(s: ReplayState, qc: string, events: SimEvent[]): number {
  const st = s.qcs[qc];
  if (!st.moving) return st.x;
  const end = events.find((e, i) => i >= s.index && e.type === "QC_MOVE_END" && e.qc === qc);
  if (!end) return st.moving.from;
  const f = Math.min(1, Math.max(0, (s.t - st.moving.t0) / Math.max(1e-9, end.t_s - st.moving.t0)));
  return st.moving.from + (st.moving.to - st.moving.from) * f;
}

export function endTime(events: SimEvent[]): number {
  return events.length ? events[events.length - 1].t_s : 0;
}

export interface GanttBar { qc: string; task: string; type: string; start: number; end: number }
export function ganttBars(events: SimEvent[]): GanttBar[] {
  const start = new Map<string, number>();
  const out: GanttBar[] = [];
  for (const e of events) {
    if (e.type === "QC_START" && e.task) start.set(e.task, e.t_s);
    if (e.type === "TASK_COMPLETE" && e.task && e.qc)
      out.push({ qc: e.qc, task: e.task, type: kind(e.task), start: start.get(e.task) ?? e.t_s, end: e.t_s });
  }
  return out;
}

export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
