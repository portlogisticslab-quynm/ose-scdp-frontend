import { useEffect, useMemo, useRef, useState } from "react";
import BayPlan, { BayLegend } from "./components/BayPlan";
import Gantt from "./components/Gantt";
import LineChart from "./components/LineChart";
import QuayStrip from "./components/QuayStrip";
import ProjectsPanel, { type Current } from "./components/ProjectsPanel";
import View3D from "./components/View3D";
import { api, ApiError, download } from "./lib/api";
import { endTime, fmtTime, ganttBars, stateAt } from "./lib/replay";
import type { Issue, Me, RunResult, ScdpDoc } from "./lib/types";

const TABS = ["01 Dữ liệu", "02 Bay plan", "03 Thiết bị", "04 Ổn định", "05 Tối ưu & DES", "06 Lần lặp DES", "07 Replay 2D/3D", "08 KPI", "09 Kịch bản"] as const;
const NEEDS_RUN: Tab[] = ["04 Ổn định", "06 Lần lặp DES", "07 Replay 2D/3D", "08 KPI"];
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
  const [plan, setPlan] = useState<"B1" | "B1S" | "OPT">("B1");
  const [limit, setLimit] = useState(30);
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState<Current>({ project: null, versionId: null });

  useEffect(() => {
    api.health().then(setHealth).catch(() => setErr("Không kết nối được API – chạy backend: uvicorn app.main:app --app-dir backend"));
    api.cases().then(setCases).catch(() => undefined);
    api.me().then(setMe).catch(() => undefined);
  }, []);

  const fail = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}: ${JSON.stringify(e.detail).slice(0, 400)}` : String(e));

  async function load(d: ScdpDoc, versionId: string | null = null) {
    setDoc(d); setRun(null); setErr("");
    setCurrent((c) => ({ ...c, versionId }));
    try { setIssues((await api.validate(d)).issues); } catch (e) { fail(e); }
  }

  async function doRun() {
    if (!doc) return;
    setBusy(true); setErr("");
    try {
      const p = current.project;
      if (p && p.role !== "VIEWER") {
        // the version endpoint returns the existing version when the document is unchanged
        const v = await api.saveVersion(p.id, doc);
        setRun(await api.projectRun(p.id, v.id, { plan, time_limit_s: limit, stability_loop: loop }));
        setCurrent({ project: await api.project(p.id), versionId: v.id });
      } else {
        setRun(await api.run(doc, plan, limit, loop));
      }
      setTab("07 Replay 2D/3D");
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1280px] p-4 text-slate-800">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">OSE Smart Container Discharge Planner</h1>
          <p className="text-xs text-slate-500">Bản phát triển (G2a, G2b đạt) · engine {health?.engine_version ?? "?"} · solver {health ? (health.ortools ? "OR-Tools sẵn sàng" : "chưa có OR-Tools") : "?"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me?.login && (me.email
            ? <span className="text-xs text-slate-600">{me.email} · gói <b>{me.plan === "pro" ? "đầy đủ" : "Demo"}</b> · <a className="text-sky-700 underline" href={me.account_url}>tài khoản Hub</a></span>
            : <a className="rounded border border-sky-700 px-2 py-1 text-xs text-sky-700" href={me.account_url}>Đăng nhập Port &amp; Logistics Hub</a>)}
          {current.project && <span className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-800">Dự án {current.project.code}{current.versionId ? ` · v${current.project.versions.find((v) => v.id === current.versionId)?.n ?? "?"}` : " · dữ liệu chưa lưu"}</span>}
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Ổn định tàu: G2b – chưa đối chiếu loading computer, không có PASS – không dùng cho tác nghiệp</span>
        </div>
      </header>
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} disabled={t !== "01 Dữ liệu" && !doc}
            className={`rounded-t px-3 py-2 text-sm ${tab === t ? "border border-b-white border-slate-200 bg-white font-medium" : "text-slate-500 hover:text-slate-800 disabled:opacity-40"}`}>{t}</button>
        ))}
      </nav>
      {err && <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      {tab === "01 Dữ liệu" && (
        <div className="space-y-4">
          {me && (me.email || !me.login) && (
            <ProjectsPanel me={me} doc={doc} current={current} onCurrent={setCurrent} onError={fail}
              onDoc={(d, vid) => load(d, vid)}
              onRun={(r, d, vid) => { load(d, vid).then(() => { setRun(r); setTab("07 Replay 2D/3D"); }); }} />
          )}
          <DataTab cases={cases} doc={doc} issues={issues} onLoad={(d) => load(d)} onError={fail} plan={me?.plan ?? "pro"} />
        </div>
      )}
      {tab === "02 Bay plan" && doc && (<div className="space-y-3"><BayLegend /><BayPlan doc={doc} /></div>)}
      {tab === "05 Tối ưu & DES" && doc && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
            <label className="text-sm">Kế hoạch
              <select value={plan} onChange={(e) => setPlan(e.target.value as "B1" | "B1S" | "OPT")} className="ml-2 rounded border px-2 py-1">
                <option value="B1">B1 – theo quy tắc</option>
                <option value="B1S">B1S – chia đều, bay biên làm chung</option>
                <option value="OPT" disabled={!health?.ortools || me?.plan === "demo"}>Tối ưu CP-SAT{me?.plan === "demo" ? " (gói đầy đủ)" : ""}</option>
              </select>
            </label>
            <label className="text-sm">Giới hạn thời gian giải (s)
              <input type="number" min={1} max={600} value={limit} onChange={(e) => setLimit(+e.target.value)} className="ml-2 w-20 rounded border px-2 py-1" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />Vòng lặp ổn định (D-09)
            </label>
            <button onClick={doRun} disabled={busy || issues.some((i) => i.severity === "ERROR")}
              className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Đang chạy…" : "Lập lịch + mô phỏng"}</button>
            <span className="text-xs text-slate-500">DES {doc.scenario.des_mode === "STOCHASTIC" ? `ngẫu nhiên, ${doc.scenario.replications} lần lặp` : "tất định"}</span>
          </div>
          {run && <RunSummary run={run} />}
          {run && (
            <div className="flex gap-2">
              <button className="rounded border px-3 py-1 text-sm" onClick={() => download(JSON.stringify(run), `SCDP_${doc.meta.project_code}_${run.plan}_${run.run_hash.slice(0, 8)}.json`)}>Tải kết quả JSON</button>
              <button className="rounded border px-3 py-1 text-sm" disabled={busy}
                onClick={async () => { setBusy(true); try { await api.report(doc, plan, limit, loop); } catch (e) { fail(e); } finally { setBusy(false); } }}>Tải báo cáo Excel</button>
            </div>
          )}
        </section>
      )}
      {tab === "03 Thiết bị" && doc && <EquipmentTab doc={doc} />}
      {NEEDS_RUN.includes(tab) && doc && !run && <p className="text-sm text-slate-500">Chạy ở tab 05 trước.</p>}
      {tab === "04 Ổn định" && doc && run && <StabilityTab doc={doc} run={run} />}
      {tab === "06 Lần lặp DES" && doc && run && <ReplicationTab doc={doc} run={run} />}
      {tab === "07 Replay 2D/3D" && doc && run && <Replay doc={doc} run={run} />}
      {tab === "09 Kịch bản" && doc && <ScenarioTab doc={doc} ortools={!!health?.ortools} onError={fail} />}
      {tab === "08 KPI" && doc && run && <KpiTab run={run} />}
    </div>
  );
}

function DataTab({ cases, doc, issues, onLoad, onError, plan }: { cases: { id: string; title: string; containers: number; data_status: string }[];
  doc: ScdpDoc | null; issues: Issue[]; onLoad: (d: ScdpDoc) => void; onError: (e: unknown) => void; plan: "pro" | "demo" }) {
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
          <input ref={file} type="file" accept=".json,.xlsx" className="text-sm" disabled={plan === "demo"}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { const r = await api.importFile(f); onLoad(r.doc); } catch (er) { onError(er); }
            }} />
          <p className="mt-1 text-xs text-slate-500">JSON hoặc Excel mẫu (SCDP_input_template). {plan === "demo" ? "Nhập tệp cần gói đầy đủ." : "Dữ liệu chỉ được lưu khi đang mở một dự án."}</p>
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
      <Card label="Solver" value={run.solver ? run.solver.status : `${run.plan} (không giải)`}
        sub={run.solver ? `gap ${n(run.solver.gap * 100, 1)} % · ${n(run.solver.wall_s, 1)} s${run.chosen ? ` · dùng lịch ${run.chosen.kept} (DES: solver ${n(run.chosen.solver_des_s, 0)} s, B1S ${n(run.chosen.b1s_des_s, 0)} s)` : ""}` : `${run.plan}`} />
      <Card label="Bảo toàn container" value={run.conservation.length ? "LỖI" : "Đạt"} sub={run.conservation[0] ?? "mỗi container về bãi đúng 1 lần"} />
      {run.replications && (
        <Card label={`DES ngẫu nhiên (${run.replications.n} lần)`} value={fmtTime(run.replications.makespan_mean_s)}
          sub={`SD ${n(run.replications.makespan_sd_s, 0)} s · P90 ${fmtTime(run.replications.makespan_p90_s)}`} />
      )}
      <Card label="Ổn định (G2b)" value={run.stability.summary.fail ? `${run.stability.summary.fail} FAIL` : `${run.stability.summary.checkpoints} checkpoint`}
        sub={run.stability.summary.max_abs_heel_deg != null
          ? `nghiêng lớn nhất ${n(run.stability.summary.max_abs_heel_deg, 3)}° · GMcorr nhỏ nhất ${n(run.stability.summary.min_gmcorr_m, 3)} m`
          : "không có dữ liệu thủy tĩnh → NOT VERIFIED"} />
      {run.stability_loop && (
        <Card label="Vòng lặp ổn định (D-09)" value={({ NO_FAIL: "Không còn FAIL", NO_CUT: "Không sửa được", MAX_ITER: "Hết số vòng", DEADLOCK: "Kẹt trình tự" } as Record<string, string>)[run.stability_loop.status] ?? run.stability_loop.status}
          sub={`${run.stability_loop.iterations} vòng · ${run.stability_loop.cuts.length} ràng buộc thứ tự thêm vào`} />
      )}
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
  const [view, setView] = useState<"2D" | "3D">("2D");
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
        <div className="ml-auto flex overflow-hidden rounded border">
          {(["2D", "3D"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? "bg-slate-800 text-white" : ""}`}>{v}</button>
          ))}
        </div>
      </div>
      {view === "3D" && <View3D doc={doc} state={state} events={run.events} />}
      {view === "2D" && <QuayStrip doc={doc} state={state} events={run.events} />}
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <div className="space-y-2">{view === "2D" && <><BayLegend /><BayPlan doc={doc} state={state} activeGroups={active} /></>}</div>
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

function Table({ head, rows }: { head: string[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <table className="w-full rounded border border-slate-200 bg-white text-xs">
      <thead><tr className="bg-slate-100 text-left">{head.map((h) => <th key={h} className="p-1.5">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="p-1.5">{c ?? "—"}</td>)}</tr>)}</tbody>
    </table>
  );
}

function EquipmentTab({ doc }: { doc: ScdpDoc }) {
  const d = doc as Record<string, any>;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Cẩu bờ (QC)</h2>
      <Table head={["QC", "Thứ tự", "Ray (m)", "Vị trí đầu (m)", "Sẵn sàng từ (s)", "δ (bay)", "Gantry (m/s)", "Twin", "Mô hình chu kỳ"]}
        rows={d.quay_cranes.map((q: any) => [q.qc_id, q.order, `${q.rail_min_x_m}–${q.rail_max_x_m}`, q.initial_x_m, q.available_from_s,
          q.safety_gap_bays, q.gantry_speed_m_s, q.twin_lift ? "có" : "không", q.time_model_id])} />
      <h2 className="text-sm font-semibold">Mô hình chu kỳ QC</h2>
      <Table head={["Mã", "Cơ sở (s)", "/row (s)", "/tier (s)", "Hầm (+s)", "Twin (+s)", "Đặc biệt (+s)", "Nguồn"]}
        rows={d.crane_time_models.map((m: any) => [m.time_model_id, m.base_cycle_s, m.per_row_s, m.per_tier_s, m.hold_extra_s, m.twin_extra_s,
          m.special_extra_s, m.source])} />
      <div className="grid gap-3 md:grid-cols-2">
        <div><h2 className="mb-1 text-sm font-semibold">Xe vận chuyển ngang</h2>
          <Table head={["Số xe", "Loại", "Chở 2×20'", "Điều xe"]} rows={[[d.trucks.count, d.trucks.type, d.trucks.twin_capable ? "có" : "không", d.trucks.dispatch_rule]]} /></div>
        <div><h2 className="mb-1 text-sm font-semibold">Lashing</h2>
          <Table head={["Số tổ", "Tháo chằng (s)", "Tháo twistlock (s)"]} rows={[[d.lashing?.gangs, d.lashing?.unlash_per_container_s, d.lashing?.decon_s]]} /></div>
      </div>
      <h2 className="text-sm font-semibold">Điểm nhận ở bãi</h2>
      <Table head={["Mã", "Đi (s)", "Về (s)", "Nhận (s)", "Song song", "Khoá"]}
        rows={d.yard_receivers.map((r: any) => [r.receiver_id, r.travel_from_quay_s, r.travel_to_quay_s, r.handling_s, r.parallel,
          r.blocked_from_s != null ? `${r.blocked_from_s}–${r.blocked_to_s} s` : "—"])} />
    </section>
  );
}

function StabilityTab({ doc, run }: { doc: ScdpDoc; run: RunResult }) {
  const cps = run.stability.checkpoints;
  const end = endTime(run.events);
  const heel = cps.filter((c) => c.values?.heel_deg != null).map((c) => [c.t_s, c.values!.heel_deg!] as [number, number]);
  const gm = cps.filter((c) => c.values?.gmcorr_m != null).map((c) => [c.t_s, c.values!.gmcorr_m!] as [number, number]);
  const trim = cps.filter((c) => c.values?.trim_m != null).map((c) => [c.t_s, c.values!.trim_m! * 100] as [number, number]);
  const lims = ((doc as Record<string, any>).limits ?? []) as { quantity: string; value: number; limit_id: string }[];
  const heelLim = lims.filter((l) => l.quantity === "HEEL_ABS_MAX").flatMap((l) => [{ value: l.value, label: l.limit_id }, { value: -l.value, label: "" }]);
  const gmLim = lims.filter((l) => l.quantity === "GM_CORR_MIN").map((l) => ({ value: l.value, label: l.limit_id }));
  const fails = cps.filter((c) => c.status === "FAIL");
  const reasons = [...new Set(cps.flatMap((c) => c.reasons))];
  return (
    <section className="space-y-3">
      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
        Kết quả ổn định chỉ là FAIL hoặc NOT VERIFIED cho tới khi đối chiếu loading computer được duyệt (G2c). Không dùng để ra quyết định khai thác.
      </div>
      {!heel.length && <p className="text-sm text-slate-500">Bộ dữ liệu không có bảng thủy tĩnh – không tính được giá trị, mọi checkpoint NOT VERIFIED.</p>}
      {heel.length > 0 && <LineChart title="Góc nghiêng theo thời gian" unit="độ" tMax={end} series={[{ name: "nghiêng", color: "#2563eb", points: heel }]} limits={heelLim} />}
      {gm.length > 0 && <LineChart title="GMcorr theo thời gian" unit="m" tMax={end} series={[{ name: "GMcorr", color: "#059669", points: gm }]} limits={gmLim} />}
      {trim.length > 0 && <LineChart title="Chúi theo thời gian (+ về lái)" unit="cm" tMax={end} series={[{ name: "chúi", color: "#7c3aed", points: trim }]} height={150} />}
      <h2 className="text-sm font-semibold">Checkpoint FAIL ({fails.length}/{cps.length})</h2>
      {fails.length ? (
        <Table head={["#", "Thời điểm", "Đối tượng", "Giới hạn", "Giá trị", "Ngưỡng"]}
          rows={fails.flatMap((c) => (c.failed ?? []).map((f) => [c.checkpoint, fmtTime(c.t_s), c.object, f.limit_id, n(f.value, 3), n(f.limit, 3)]))} />
      ) : <p className="text-sm text-slate-600">Không có checkpoint FAIL.</p>}
      <h2 className="text-sm font-semibold">Lý do chưa xác nhận</h2>
      <ul className="list-disc pl-5 text-xs text-slate-600">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    </section>
  );
}

function ReplicationTab({ doc, run }: { doc: ScdpDoc; run: RunResult }) {
  const rp = run.replications;
  if (!rp) return <p className="text-sm text-slate-500">Bộ dữ liệu chạy DES tất định ({doc.scenario.des_mode}); đổi scenario.des_mode = STOCHASTIC để chạy nhiều lần lặp.</p>;
  const vals = rp.makespans_s, lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 960, H = 160, bw = (W - 60) / vals.length;
  const sy = (v: number) => H - 24 - ((H - 44) * (v - lo * 0.98)) / Math.max(1, hi - lo * 0.98);
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Card label="Số lần lặp" value={String(rp.n)} sub={`seed ${doc.scenario.seed}`} />
        <Card label="C_max trung bình" value={fmtTime(rp.makespan_mean_s)} sub={`${n(rp.makespan_mean_s, 0)} s`} />
        <Card label="Độ lệch chuẩn" value={`${n(rp.makespan_sd_s, 0)} s`} />
        <Card label="P90" value={fmtTime(rp.makespan_p90_s)} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-slate-200 bg-white">
        {vals.map((v, i) => (
          <g key={i}><rect x={50 + i * bw + 2} y={sy(v)} width={bw - 4} height={H - 24 - sy(v)} fill="#38bdf8"><title>Lần {i + 1}: {fmtTime(v)}</title></rect>
            <text x={50 + i * bw + bw / 2} y={H - 8} fontSize={9} textAnchor="middle" fill="#64748b">{i + 1}</text></g>
        ))}
        <text x={46} y={sy(hi) + 3} fontSize={9} textAnchor="end" fill="#64748b">{fmtTime(hi)}</text>
        <text x={46} y={H - 24} fontSize={9} textAnchor="end" fill="#64748b">{fmtTime(lo * 0.98)}</text>
        <line x1={50} x2={W - 8} y1={sy(rp.makespan_mean_s)} y2={sy(rp.makespan_mean_s)} stroke="#0f172a" strokeDasharray="4 3" />
        <text x={W - 10} y={sy(rp.makespan_mean_s) - 4} fontSize={10} textAnchor="end">trung bình</text>
      </svg>
      <p className="text-xs text-slate-500">Trục đứng không bắt đầu từ 0 (bắt đầu ở 98 % giá trị nhỏ nhất) để thấy rõ khác biệt giữa các lần lặp.</p>
      <p className="text-xs text-slate-500">Hệ số biến thiên chu kỳ (stochastic_cv) là giả định ESTIMATED cho tới khi hiệu chỉnh bằng log thực (A7).</p>
    </section>
  );
}

type Plan = "B1" | "B1S" | "OPT";
interface ScenarioRow { label: string; plan: Plan; trucks: number; r?: RunResult; err?: string }

function ScenarioTab({ doc, ortools, onError }: { doc: ScdpDoc; ortools: boolean; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<ScenarioRow[]>([]);
  const [busy, setBusy] = useState(false);
  const base = doc.trucks.count;
  async function go() {
    const plan: ScenarioRow[] = [
      { label: "B1 – theo quy tắc", plan: "B1", trucks: base },
      { label: "B1S – chia đều", plan: "B1S", trucks: base },
      ...(ortools ? [{ label: "Tối ưu CP-SAT", plan: "OPT" as Plan, trucks: base }] : []),
      { label: `B1S – xe × 0,5 (${Math.max(1, Math.round(base / 2))})`, plan: "B1S", trucks: Math.max(1, Math.round(base / 2)) },
      { label: `B1S – xe × 1,5 (${Math.round(base * 1.5)})`, plan: "B1S", trucks: Math.round(base * 1.5) },
    ];
    setRows(plan); setBusy(true);
    const out: ScenarioRow[] = [];
    for (const row of plan) {
      const d = { ...doc, trucks: { ...doc.trucks, count: row.trucks }, scenario: { ...doc.scenario, des_mode: "DETERMINISTIC", replications: 1 } };
      try { out.push({ ...row, r: await api.run(d as ScdpDoc, row.plan, 30) }); } catch (e) { out.push({ ...row, err: String(e) }); onError(e); }
      setRows([...out, ...plan.slice(out.length)]);
    }
    setBusy(false);
  }
  const ok = rows.filter((x) => x.r);
  const best = ok.length ? Math.min(...ok.map((x) => x.r!.kpi.makespan_s)) : 0;
  const W = 960, bh = 22;
  const maxv = ok.length ? Math.max(...ok.map((x) => x.r!.kpi.makespan_s)) : 1;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={go} disabled={busy} className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Đang chạy…" : "Chạy so sánh"}</button>
        <span className="text-xs text-slate-500">Cùng một bộ dữ liệu (cùng hash đầu vào), DES tất định; độ nhạy theo số xe (AC-10, AC-11).</span>
      </div>
      {rows.length > 0 && (
        <table className="w-full rounded border border-slate-200 bg-white text-sm">
          <thead><tr className="bg-slate-100 text-left"><th className="p-2">Kịch bản</th><th className="p-2">C_max</th><th className="p-2">So với tốt nhất</th>
            <th className="p-2">GCR</th><th className="p-2">NCR</th><th className="p-2">Chờ xe (h)</th><th className="p-2">Ổn định FAIL</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.label} className="border-t">
              <td className="p-2">{x.label}</td>
              <td className="p-2">{x.r ? fmtTime(x.r.kpi.makespan_s) : x.err ? "lỗi" : "…"}</td>
              <td className="p-2">{x.r ? (x.r.kpi.makespan_s === best ? "tốt nhất" : `+${n((x.r.kpi.makespan_s / best - 1) * 100, 1)} %`) : ""}</td>
              <td className="p-2">{x.r ? n(x.r.kpi.gcr) : ""}</td><td className="p-2">{x.r ? n(x.r.kpi.ncr) : ""}</td>
              <td className="p-2">{x.r ? n(Object.values(x.r.kpi.truck_wait_hours).reduce((a, b) => a + b, 0), 2) : ""}</td>
              <td className="p-2">{x.r ? x.r.stability.summary.fail : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {ok.length > 0 && (
        <svg viewBox={`0 0 ${W} ${ok.length * (bh + 8) + 10}`} className="w-full rounded border border-slate-200 bg-white">
          {ok.map((x, i) => (
            <g key={x.label}>
              <text x={6} y={i * (bh + 8) + 20} fontSize={11} fill="#0f172a">{x.label}</text>
              <rect x={260} y={i * (bh + 8) + 6} width={((W - 360) * x.r!.kpi.makespan_s) / maxv} height={bh}
                fill={x.r!.kpi.makespan_s === best ? "#059669" : "#38bdf8"} />
              <text x={266 + ((W - 360) * x.r!.kpi.makespan_s) / maxv} y={i * (bh + 8) + 21} fontSize={10} fill="#334155">{fmtTime(x.r!.kpi.makespan_s)}</text>
            </g>
          ))}
        </svg>
      )}
    </section>
  );
}
