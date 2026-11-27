import { describe, expect, it } from "vitest";
import fx from "./replay.fixture.json";
import { endTime, stateAt } from "./replay";
import { boxVisual, quaySign, visibleBoxes, worldOfShip } from "./scene";
import type { ScdpDoc, SimEvent } from "./types";

const doc = fx.doc as unknown as ScdpDoc;
const events = fx.events as SimEvent[];
const slots = new Map(doc.slots.map((s) => [s.slot_id, s]));

describe("3D view uses the same event log (AC-08, T15)", () => {
  it("ship x maps to the quay coordinate used by the cranes", () => {
    expect(quaySign(doc)).toBe(1);
    const s = slots.get("060182")!;
    expect(worldOfShip(doc, s.x_m, s.y_m, s.z_bottom_m)[0]).toBe(80);     // QC1 works bay 06 at quay x = 80
  });

  it("starboard (alongside) is on the quay side", () => {
    const stbd = slots.get("060182")!, port = slots.get("060282")!;
    expect(worldOfShip(doc, stbd.x_m, stbd.y_m, 0)[2]).toBeGreaterThan(worldOfShip(doc, port.x_m, port.y_m, 0)[2]);
  });

  it("box count on board follows the replay at 50 instants and ends with only the restowed box", () => {
    const T = endTime(events);
    let prev = doc.containers.length + 1;
    for (let k = 0; k <= 50; k++) {
      const n = visibleBoxes(doc, stateAt(doc, events, (T * k) / 50));
      expect(n <= prev + 1).toBe(true);          // only a restow can bring a box back
      prev = n;
    }
    const end = stateAt(doc, events, T);
    expect(visibleBoxes(doc, end)).toBe(1);
    const r = doc.containers.find((c) => c.action === "RESTOW_QUAY")!;
    const v = boxVisual(doc, slots, r, end.boxes[r.container_id]);
    const tgt = slots.get(r.restow_slot_id!)!;
    expect(v.visible).toBe(true);
    expect(v.position[0]).toBe(worldOfShip(doc, tgt.x_m, tgt.y_m, tgt.z_bottom_m)[0]);
  });

  it("colours match the 2D legend", () => {
    const c = doc.containers.find((x) => x.action === "DISCHARGE")!;
    expect(boxVisual(doc, slots, c, { status: "ON_SHIP", slot: c.slot_id }).color).toBe("#3b82f6");
    expect(boxVisual(doc, slots, c, { status: "LIFTED", slot: c.slot_id }).color).toBe("#facc15");
    expect(boxVisual(doc, slots, c, { status: "AT_YARD", slot: c.slot_id }).visible).toBe(false);
  });
});
