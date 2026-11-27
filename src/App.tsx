import { useEffect, useMemo, useRef, useState } from "react";
import BayPlan, { BayLegend } from "./components/BayPlan";
import Gantt from "./components/Gantt";
import QuayStrip from "./components/QuayStrip";
import { api, ApiError } from "./lib/api";
import { endTime, fmtTime, ganttBars, stateAt } from "./lib/replay";
import type { Issue, RunResult, ScdpDoc } from "./lib/types";

const TABS = ["01 Dữ liệu", "02 Bay plan", "05 Tối ưu & DES", "07 Replay 2D", "08 KPI"] as const;
type Tab = (typeof TABS)[number];
const groupOf = (bay: number) => Math.floor((bay - 1 - (bay % 2 === 0 ? 1 : 0)) / 4);
const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));

export default function App() {
  const [tab, setTab] = useState<Tab>("01 Dữ liệu");
  const [health, setHealth] = useState<{ engine_version: string; ortools: boolean } | null>(null);
  const [cases, setCases] = useState<{ id: string; title: string; containers: number; data_status: string }[]>([]);
  const [doc, setDoc] = useState<ScdpDoc | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [plan, setPlan] = useState<"B1" | "OPT">("B1");
  const [limit, setLimit] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.health().then(setHealth).catch(() => setErr("Không kết nối được API – chạy backend: uvicorn app.main:app --app-dir backend"));
    api.cases().then(setCases).catch(() => undefined);
  }, []);

  const fail = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}: ${JSON.stringify(e.detail).slice(0, 400)}` : String(e));

  async function load(d: ScdpDoc) {
    setDoc(d); setRun(null); setErr("");
    try { setIssues((await api.validate(d)).issues); } catch (e) { fail(e); }
  }

  async function doRun() {
    if (!doc) return;
    setBusy(true); setErr("");
    try { setRun(await api.run(doc, plan, limit)); setTab("07 Replay 2D"); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1280px] p-4 text-slate-800">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">OSE Smart Container Discharge Planner</h1>
          <p className="text-xs text-slate-500">Bản phát triển G2a · engine {health?.engine_version ?? "?"} · solver {health ? (health.ortools ? "OR-Tools sẵn sàng" : "chưa có OR-Tools") : "?"}</p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Ổn định tàu: G2b – chưa đối chiếu loading computer, không có PASS – không dùng cho tác nghiệp</span>
      </header>
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} disabled={t !== "01 Dữ liệu" && !doc}
            className={`rounded-t px-3 py-2 text-sm ${tab === t ? "border border-b-white border-slate-200 bg-white font-medium" : "text-slate-500 hover:text-slate-800 disabled:opacity-40"}`}>{t}</button>
        ))}
      </nav>
      {err && <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      {tab === "01 Dữ liệu" && <DataTab cases={cases} doc={doc} issues={issues} onLoad={load} onError={fail} />}
      {tab === "02 Bay plan" && doc && (<div className="space-y-3"><BayLegend /><BayPlan doc={doc} /></div>)}
      {tab === "05 Tối ưu & DES" && doc && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
            <label className="text-sm">Kế hoạch
              <select value={plan} onChange={(e) => setPlan(e.target.value as "B1" | "OPT")} className="ml-2 rounded border px-2 py-1">
                <option value="B1">B1 – theo quy tắc</option>
                <option value="OPT" disabled={!health?.ortools}>Tối ưu CP-SAT</option>
              </select>
            </label>
            <label className="text-sm">Giới hạn thời gian giải (s)
              <input type="number" min={1} max={600} value={limit} onChange={(e) => setLimit(+e.target.value)} className="ml-2 w-20 rounded border px-2 py-1" />
            </label>
            <button onClick={doRun} disabled={busy || issues.some((i) => i.severity === "ERROR")}
              className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Đang chạy…" : "Lập lịch + mô phỏng"}</button>
            <span className="text-xs text-slate-500">DES {doc.scenario.des_mode === "STOCHASTIC" ? `ngẫu nhiên, ${doc.scenario.replications} lần lặp` : "tất định"}</span>
          </div>
          {run && <RunSummary run={run} />}
        </section>
      )}
      {tab === "07 Replay 2D" && doc && (run ? <Replay doc={doc} run={run} /> : <p className="text-sm text-slate-500">Chạy ở tab 05 trước.</p>)}
      {tab === "08 KPI" && doc && (run ? <KpiTab run={run} /> : <p className="text-sm text-slate-500">Chạy ở tab 05 trước.</p>)}
    </div>
  );
}

function DataTab({ cases, doc, issues, onLoad, onError }: { cases: { id: string; title: string; containers: number; data_status: string }[];
  doc: ScdpDoc | null; issues: Issue[]; onLoad: (d: ScdpDoc) => void; onError: (e: unknown) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => {
    if (!doc) return null;
    const c: Record<string, number> = {};
    for (const x of doc.containers) c[x.action] = (c[x.action] ?? 0) + 1;
    return c;
  }, [doc]);
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Ca tham chiếu</h2>
          <ul className="space-y-1">
            {cases.map((c) => (
              <li key={c.id}><button className="text-left text-sm text-sky-700 hover:underline" onClick={() => api.case(c.id).then(onLoad).catch(onError)}>
                {c.title} <span className="text-slate-400">({c.containers} container, {c.data_status})</span></button></li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Nhập tệp scdp-input/0.1</h2>
          <input ref={file} type="file" accept=".json,.xlsx" className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { const r = await api.importFile(f); onLoad(r.doc); } catch (er) { onError(er); }
            }} />
          <p className="mt-1 text-xs text-slate-500">JSON hoặc Excel mẫu (SCDP_input_template). Dữ liệu không được lưu trên máy chủ.</p>
        </div>
      </div>
      {doc && counts && (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm">
          <h2 className="mb-1 font-semibold">{doc.meta.title}</h2>
          <p className="text-slate-600">{doc.vessel.name} · {doc.slots.length} slot · {doc.containers.length} container
            ({Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}) · {doc.scenario.qc_ids.length} QC · {doc.trucks.count} xe ·
            dữ liệu <b>{doc.meta.data_status}</b></p>
          <IssuesTable issues={issues} />
        </div>
      )}
    </section>
  );
}

function IssuesTable({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <p className="mt-2 text-green-700">Kiểm tra V001–V018: không có vấn đề.</p>;
  const color = { ERROR: "text-red-700", WARNING: "text-amber-700", INFO: "text-slate-500" };
  return (
    <table className="mt-2 w-full text-xs">
      <thead><tr className="bg-slate-100 text-left"><th className="p-1">Mã</th><th className="p-1">Mức</th><th className="p-1">Bảng</th><th className="p-1">Dòng</th><th className="p-1">Trường</th><th className="p-1">Nội dung</th></tr></thead>
      <tbody>{issues.map((i, k) => (
        <tr key={k} className="border-t"><td className="p-1">{i.code}</td><td className={`p-1 ${color[i.severity]}`}>{i.severity}</td>
          <td className="p-1">{i.table}</td><td className="p-1">{i.row ?? "—"}</td><td className="p-1">{i.field}</td><td className="p-1">{i.message}</td></tr>
      ))}</tbody>
    </table>
  );
}

function RunSummary({ run }: { run: RunResult }) {
  const k = run.kpi;
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card label="C_max (DES)" value={fmtTime(k.makespan_s)} sub={`${n(k.makespan_s, 0)} s`} />
      <Card label="Cận dưới LB" value={fmtTime(run.lower_bound.lb)} sub={`khoảng cách ${n(((k.makespan_s - run.lower_bound.lb) / run.lower_bound.lb) * 100, 1)} %`} />
      <Card label="Solver" value={run.solver ? run.solver.status : "B1 (không giải)"} sub={run.solver ? `gap ${n(run.solver.gap * 100, 1)} % · ${n(run.solver.wall_s, 1)} s` : `${run.plan}`} />
      <Card label="Bảo toàn container" value={run.conservation.length ? "LỖI" : "Đạt"} sub={run.conservation[0] ?? "mỗi container về bãi đúng 1 lần"} />
      {run.replications && (
        <Card label={`DES ngẫu nhiên (${run.replications.n} lần)`} value={fmtTime(run.replications.makespan_mean_s)}
          sub={`SD ${n(run.replications.makespan_sd_s, 0)} s · P90 ${fmtTime(run.replications.makespan_p90_s)}`} />
      )}
      <Card label="Ổn định (G2b)" value={run.stability.summary.fail ? `${run.stability.summary.fail} FAIL` : `${run.stability.summary.checkpoints} checkpoint`}
        sub={run.stability.summary.max_abs_heel_deg != null
          ? `nghiêng lớn nhất ${n(run.stability.summary.max_abs_heel_deg, 3)}° · GMcorr nhỏ nhất ${n(run.stability.summary.min_gmcorr_m, 3)} m`
          : "không có dữ liệu thủy tĩnh → NOT VERIFIED"} />
      <Card label="Mã lần chạy" value={run.run_hash.slice(0, 12)} sub={`engine ${run.engine_version}`} />
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Replay({ doc, run }: { doc: ScdpDoc; run: RunResult }) {
  const end = endTime(run.events);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const state = useMemo(() => stateAt(doc, run.events, t), [doc, run.events, t]);
  const bars = useMemo(() => ganttBars(run.events), [run.events]);
  const active = useMemo(() => {
    const m: Record<number, string> = {};
    for (const [q, s] of Object.entries(state.qcs)) {
      const slot = s.task && run.events.find((e) => e.type === "QC_START" && e.task === s.task)?.slot;
      const sl = slot && doc.slots.find((x) => x.slot_id === slot);
      if (sl) m[groupOf(sl.bay)] = q;
    }
    return m;
  }, [state, run.events, doc]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      setT((v) => {
        const nv = Math.min(end, v + ((now - last) / 1000) * speed);
        if (nv >= end) setPlaying(false);
        return nv;
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);
  const nextEvent = () => { const e = run.events.find((x) => x.t_s > t + 1e-9); if (e) setT(e.t_s); };
  const recent = run.events.filter((e) => e.t_s <= t).slice(-6).reverse();
  const cp = [...run.stability.checkpoints].reverse().find((c) => c.t_s <= t);
  const counts = Object.values(state.boxes).reduce<Record<string, number>>((a, b) => ({ ...a, [b.status]: (a[b.status] ?? 0) + 1 }), {});
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-2 text-sm">
        <button onClick={() => { if (t >= end) setT(0); setPlaying(!playing); }} className="w-20 rounded bg-sky-700 px-3 py-1 text-white">{playing ? "Dừng" : "Chạy"}</button>
        <button onClick={nextEvent} className="rounded border px-2 py-1">Sự kiện tiếp ▸</button>
        <button onClick={() => { setPlaying(false); setT(0); }} className="rounded border px-2 py-1">⏮ Đầu</button>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="rounded border px-2 py-1">
          {[10, 30, 60, 120, 300, 600].map((v) => <option key={v} value={v}>× {v}</option>)}
        </select>
        <input type="range" min={0} max={end} step={1} value={t} onChange={(e) => { setPlaying(false); setT(+e.target.value); }} className="min-w-[240px] flex-1" />
        <span className="font-mono">{fmtTime(t)} / {fmtTime(end)}</span>
      </div>
      <QuayStrip doc={doc} state={state} events={run.events} />
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <div className="space-y-2"><BayLegend /><BayPlan doc={doc} state={state} activeGroups={active} /></div>
        <aside className="space-y-2 text-xs">
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 font-semibold">Trạng thái container</div>
            {["ON_SHIP", "LIFTED", "ON_TRUCK", "ON_QUAY", "AT_YARD"].map((k) => (
              <div key={k} className="flex justify-between"><span>{({ ON_SHIP: "Trên tàu", LIFTED: "Đang nhấc", ON_TRUCK: "Trên xe", ON_QUAY: "Tạm trên bến", AT_YARD: "Đã về bãi" } as Record<string, string>)[k]}</span><b>{counts[k] ?? 0}</b></div>
            ))}
          </div>
          <div className={`rounded border p-2 ${cp?.status === "FAIL" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
            <div className="mb-1 font-semibold">Ổn định tại thời điểm này</div>
            {!cp && <div className="text-slate-500">Chưa có thay đổi tải trọng</div>}
            {cp && (<>
              <div className={cp.status === "FAIL" ? "font-semibold text-red-700" : "text-amber-700"}>{cp.status}</div>
              {cp.values?.heel_deg != null && <div className="flex justify-between"><span>Nghiêng</span><b>{n(cp.values.heel_deg, 3)}°</b></div>}
              {cp.values?.gmcorr_m != null && <div className="flex justify-between"><span>GMcorr</span><b>{n(cp.values.gmcorr_m, 3)} m</b></div>}
              {cp.values?.trim_m != null && <div className="flex justify-between"><span>Chúi</span><b>{n(cp.values.trim_m * 100, 1)} cm</b></div>}
              {cp.failed?.map((f) => <div key={f.limit_id} className="text-red-700">{f.limit_id}: {n(f.value, 3)} / {n(f.limit, 3)}</div>)}
              <div className="mt-1 text-[10px] text-slate-500">{cp.reasons[0]}</div>
            </>)}
          </div>
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 font-semibold">Sự kiện gần nhất</div>
            {recent.map((e) => <div key={e.event_id} className="truncate font-mono text-[11px]">{fmtTime(e.t_s)} {e.type} {e.qc ?? e.truck ?? ""} {e.container ?? e.object ?? ""}</div>)}
          </div>
        </aside>
      </div>
      <Gantt bars={bars} qcs={Object.keys(run.sequences)} t={t} end={end} onSeek={(v) => { setPlaying(false); setT(v); }} />
    </section>
  );
}

function KpiTab({ run }: { run: RunResult }) {
  const k = run.kpi;
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Card label="Move container" value={n(k.container_moves, 0)} sub={`nắp hầm ${k.hatch_moves} move (báo riêng)`} />
        <Card label="GCR" value={`${n(k.gcr, 2)} move/h`} sub="move / giờ QC" />
        <Card label="NCR" value={`${n(k.ncr, 2)} move/h`} sub="trừ nắp hầm, chờ xe" />
        <Card label="Năng suất tàu" value={`${n(k.vessel_rate, 2)} move/h`} sub={`crane intensity ${n(k.crane_intensity, 2)}`} />
      </div>
      <table className="w-full rounded border border-slate-200 bg-white text-sm">
        <thead><tr className="bg-slate-100 text-left"><th className="p-2">QC</th><th className="p-2">Giờ làm việc</th><th className="p-2">Chờ xe (h)</th><th className="p-2">Số task</th></tr></thead>
        <tbody>{Object.keys(k.qc_hours).map((q) => (
          <tr key={q} className="border-t"><td className="p-2">{q}</td><td className="p-2">{n(k.qc_hours[q], 3)}</td>
            <td className="p-2">{n(k.truck_wait_hours[q] ?? 0, 3)}</td><td className="p-2">{run.sequences[q]?.length ?? 0}</td></tr>
        ))}</tbody>
      </table>
      <p className="text-xs text-slate-500">KPI tính lại từ event log (AC-08). Định nghĩa GCR/NCR theo G1-08 và Phần 1 mục 4.3.</p>
    </section>
  );
}
