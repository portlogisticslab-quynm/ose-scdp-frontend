// 3D replay (Three.js, procedural geometry): hull outline, containers, hatch covers, cranes. It only redraws the
// state the event log gives at time t – no motion is invented (Đề cương 9.2). Not a stability evidence.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ReplayState } from "../lib/replay";
import { qcX } from "../lib/replay";
import { boxVisual, shipBounds, worldOfShip } from "../lib/scene";
import type { ScdpDoc, SimEvent } from "../lib/types";

interface Scene3 { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  boxes: Map<string, THREE.Mesh>; covers: Map<string, THREE.Mesh>; cranes: Map<string, THREE.Group> }

export default function View3D({ doc, state, events }: { doc: ScdpDoc; state: ReplayState; events: SimEvent[] }) {
  const host = useRef<HTMLDivElement>(null);
  const s3 = useRef<Scene3 | null>(null);
  const slots = useMemo(() => new Map(doc.slots.map((s) => [s.slot_id, s])), [doc]);

  useEffect(() => {
    const el = host.current!;
    const W = el.clientWidth, H = 460;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e0f2fe");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-80, 120, 60);
    scene.add(sun);
    const b = shipBounds(doc);
    const cx = (b.x0 + b.x1) / 2;
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 5000);
    camera.position.set(cx - (b.x1 - b.x0) * 0.35, 70, b.z1 + 110);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 8, (b.z0 + b.z1) / 2);
    controls.update();
    // water, quay apron
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: "#7dd3fc" }));
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 200, 2, 60), new THREE.MeshLambertMaterial({ color: "#cbd5e1" }));
    quay.position.set(cx, 1, b.z1 + 32);
    scene.add(quay);
    // hull (schematic box from the slot extents, top at the lowest deck tier)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.deck, b.z1 - b.z0),
      new THREE.MeshLambertMaterial({ color: "#334155", transparent: true, opacity: 0.35 }));
    hull.position.set(cx, b.deck / 2, (b.z0 + b.z1) / 2);
    scene.add(hull);
    const boxes = new Map<string, THREE.Mesh>();
    for (const c of doc.containers) {
      const v = boxVisual(doc, slots, c, undefined);
      const m = new THREE.Mesh(new THREE.BoxGeometry(v.size[0] - 0.15, v.size[1] - 0.1, v.size[2] - 0.15),
        new THREE.MeshLambertMaterial({ color: v.color }));
      m.position.set(...v.position);
      scene.add(m);
      boxes.set(c.container_id, m);
    }
    const covers = new Map<string, THREE.Mesh>();
    for (const h of doc.hatch_covers ?? []) {
      const rows = doc.slots.filter((s) => h.bays.includes(s.bay) && h.rows.includes(s.row));
      if (!rows.length) continue;
      const zs = rows.map((s) => worldOfShip(doc, s.x_m, s.y_m, 0)[2]);
      const [x] = worldOfShip(doc, h.x_m, 0, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.6, Math.max(...zs) - Math.min(...zs) + 2.6),
        new THREE.MeshLambertMaterial({ color: "#475569" }));
      m.position.set(x, b.deck - 0.4, (Math.max(...zs) + Math.min(...zs)) / 2);
      scene.add(m);
      covers.set(h.cover_id, m);
    }
    const cranes = new Map<string, THREE.Group>();
    const mat = new THREE.MeshLambertMaterial({ color: "#f59e0b" });
    for (const q of Object.keys(state.qcs)) {
      const g = new THREE.Group();
      for (const dz of [b.z1 + 12, b.z1 + 40]) for (const dx of [-8, 8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 45, 1.2), mat);
        leg.position.set(dx, 22.5, dz);
        g.add(leg);
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, b.z1 - b.z0 + 75), mat);
      boom.position.set(0, 46, (b.z0 + b.z1 + 50) / 2 - 8);
      g.add(boom);
      scene.add(g);
      cranes.set(q, g);
    }
    s3.current = { renderer, scene, camera, controls, boxes, covers, cranes };
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); s3.current = null; };
  }, [doc, slots]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = s3.current;
    if (!s) return;
    for (const c of doc.containers) {
      const v = boxVisual(doc, slots, c, state.boxes[c.container_id]);
      const m = s.boxes.get(c.container_id)!;
      m.visible = v.visible;
      m.position.set(...v.position);
      if (state.boxes[c.container_id]?.status === "LIFTED") m.position.y += 3;
      (m.material as THREE.MeshLambertMaterial).color.set(v.color);
    }
    for (const [id, m] of s.covers) m.visible = state.hatches[id] === "CLOSED" || state.hatches[id] === "CLOSING";
    for (const [q, g] of s.cranes) {
      g.position.x = qcX(state, q, events);
      for (const ch of g.children) ((ch as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(state.qcs[q]?.task ? "#d97706" : "#94a3b8");
    }
  }, [state, doc, slots, events]);

  return (
    <div>
      <div ref={host} className="w-full overflow-hidden rounded border border-slate-200" />
      <p className="mt-1 text-xs text-slate-500">3D dựng từ toạ độ slot (thân tàu là khối sơ đồ, không theo bản vẽ thật). Kéo để xoay, cuộn để phóng to. Hình chỉ phát lại event log, không phải bằng chứng an toàn.</p>
    </div>
  );
}
