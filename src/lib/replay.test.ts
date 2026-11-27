import { describe, expect, it } from "vitest";
import fx from "./replay.fixture.json";
import { advance, checkEvents, endTime, ganttBars, initialState, qcX, ReplayError, stateAt } from "./replay";
import type { ScdpDoc, SimEvent } from "./types";

const doc = fx.doc as unknown as ScdpDoc;
const events = fx.events as SimEvent[];

describe("T15 – replay is a pure function of the event log", () => {
  it("event log is ordered and unique", () => {
    expect(() => checkEvents(events)).not.toThrow();
    const bad = [...events];
    [bad[3], bad[60]] = [bad[60], bad[3]];
    expect(() => checkEvents(bad)).toThrow(ReplayError);
  });

  it("seek and step give the same picture at 50 instants", () => {
    const T = endTime(events);
    let stepped = initialState(doc);
    for (let k = 0; k <= 50; k++) {
      const t = (T * k) / 50;
      stepped = advance(stepped, events, t);
      const seek = stateAt(doc, events, t);
      expect(seek).toEqual(stepped);
    }
  });

  it("start and end states", () => {
    const s0 = stateAt(doc, events, 0);
    expect(Object.values(initialState(doc).boxes).every((b) => b.status === "ON_SHIP")).toBe(true);
    expect(s0.t).toBe(0);
    const end = stateAt(doc, events, endTime(events));
    for (const c of doc.containers) {
      if (c.action === "DISCHARGE") expect(end.boxes[c.container_id].status).toBe("AT_YARD");
      if (c.action === "RESTOW_QUAY") expect(end.boxes[c.container_id]).toEqual({ status: "ON_SHIP", slot: c.restow_slot_id });
    }
    expect(Object.values(end.hatches).every((h) => h === "CLOSED")).toBe(true);
    expect(Object.values(end.trucks).every((t) => t === "QUAY")).toBe(true);
  });

  it("hatch HC06 is open while the hold is worked", () => {
    const open = events.find((e) => e.type === "TASK_COMPLETE" && e.task === "HATCH_OPEN:HC06")!;
    expect(stateAt(doc, events, open.t_s).hatches.HC06).toBe("OPEN");
    expect(stateAt(doc, events, open.t_s - 1).hatches.HC06).toBe("OPENING");
  });

  it("Gantt bars match the KPI makespan and one bar per QC task", () => {
    const bars = ganttBars(events);
    expect(bars.length).toBe(25);
    expect(Math.max(...bars.map((b) => b.end))).toBe(fx.kpi.makespan_s);
  });

  it("crane stays put when no move is logged", () => {
    const s = stateAt(doc, events, 1000);
    expect(qcX(s, "QC1", events)).toBe(80);
    expect(qcX(s, "QC2", events)).toBe(110);
  });

  it("moving backwards with advance is refused", () => {
    const s = stateAt(doc, events, 500);
    expect(() => advance(s, events, 100)).toThrow(ReplayError);
  });
});
