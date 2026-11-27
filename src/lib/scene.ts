// Pure geometry for the 3D view (no three.js here, so it can be tested).
// World axes: X along the quay (same as the quay coordinate), Y up (= ship z), Z towards the quay.
import type { BoxState, ReplayState } from "./replay";
import type { Container, ScdpDoc, Slot } from "./types";

export const FT = 0.3048;
export const BOX_W = 2.438;

export function quaySign(doc: ScdpDoc): number {
  const fwd = (doc.coordinate_system.x_positive ?? "FORWARD") === "FORWARD";
  const bowRight = doc.vessel.bow_direction === "QUAY_RIGHT";
  return fwd === bowRight ? 1 : -1;
}

/** +1 when the ship's +y axis points away from the quay (so world z = −y puts the quay side at +z). */
function ySign(doc: ScdpDoc): number {
  const portPositive = (doc.coordinate_system.y_positive ?? "PORT") === "PORT";
  const starboardAlongside = (doc.scenario as unknown as { side_alongside?: string }).side_alongside !== "PORT";
  return portPositive === starboardAlongside ? -1 : 1;
}

export function worldOfShip(doc: ScdpDoc, x: number, y: number, z: number): [number, number, number] {
  return [doc.scenario.vessel_origin_quay_x_m + quaySign(doc) * x, z, ySign(doc) * y];
}

export function boxSize(c: Container): [number, number, number] {
  const len = c.length_ft >= 45 ? 13.716 : c.length_ft >= 40 ? 12.192 : 6.058;
  const h = ((c as unknown as { height_ft?: number }).height_ft ?? 8.5) * FT;
  return [len, h, BOX_W];
}

export interface BoxVisual { visible: boolean; color: string; position: [number, number, number]; size: [number, number, number] }

/** Same colour code as the 2D bay plan. Boxes away from the ship (truck, apron, yard) are not drawn on the ship. */
export function boxVisual(doc: ScdpDoc, slots: Map<string, Slot>, c: Container, b: BoxState | undefined): BoxVisual {
  const st = b?.status ?? "ON_SHIP";
  const slot = slots.get(b?.slot ?? c.slot_id)!;
  const size = boxSize(c);
  const [x, y, z] = worldOfShip(doc, slot.x_m, slot.y_m, slot.z_bottom_m);
  const position: [number, number, number] = [x, y + size[1] / 2, z];
  const color = st === "LIFTED" ? "#facc15" : c.action === "STAY" ? "#cbd5e1" : c.action.startsWith("RESTOW") ? "#fb923c" : "#3b82f6";
  return { visible: st === "ON_SHIP" || st === "LIFTED", color, position, size };
}

export function shipBounds(doc: ScdpDoc) {
  const pts = doc.slots.map((s) => worldOfShip(doc, s.x_m, s.y_m, s.z_bottom_m));
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
  return { x0: Math.min(...xs) - 10, x1: Math.max(...xs) + 10, z0: Math.min(...zs) - 3, z1: Math.max(...zs) + 3,
    deck: Math.min(...doc.slots.filter((s) => s.deck === "DECK").map((s) => s.z_bottom_m), 12) };
}

export function visibleBoxes(doc: ScdpDoc, s: ReplayState): number {
  return doc.containers.filter((c) => {
    const st = s.boxes[c.container_id]?.status ?? "ON_SHIP";
    return st === "ON_SHIP" || st === "LIFTED";
  }).length;
}
