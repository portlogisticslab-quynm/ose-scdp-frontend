// P3-3: projects, data versions, stored runs and members. Shown on tab 01 for a logged-in user with the full plan.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me, ProjectInfo, ProjectRow, RunResult, ScdpDoc } from "../lib/types";

export interface Current { project: ProjectInfo | null; versionId: string | null }

const fmt = (s: number | null) => (s == null ? "–" : new Date(s * 1000).toISOString().slice(11, 19));
const day = (iso: string) => iso.slice(0, 16).replace("T", " ");

export default function ProjectsPanel({ me, doc, current, onCurrent, onDoc, onRun, onError }: {
  me: Me; doc: ScdpDoc | null; current: Current; onCurrent: (c: Current) => void;
  onDoc: (d: ScdpDoc, versionId: string) => void; onRun: (r: RunResult, d: ScdpDoc, versionId: string) => void; onError: (e: unknown) => void;
}) {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"PLANNER" | "VIEWER">("PLANNER");
  const [busy, setBusy] = useState(false);
  const p = current.project;
  const canWrite = p != null && p.role !== "VIEWER";

  const refreshList = () => api.projects().then(setRows).catch(onError);
  useEffect(() => { refreshList(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function act(f: () => Promise<void>) {
    setBusy(true);
    try { await f(); } catch (e) { onError(e); } finally { setBusy(false); }
  }
  const reopen = async (id: string, versionId: string | null = current.versionId) => {
    onCurrent({ project: await api.project(id), versionId });
    refreshList();
  };

  if (me.plan !== "pro") {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Dự án và lưu trữ</b> cần gói đầy đủ. Bản Demo chạy B1/B1S trên ca mẫu, không lưu.{" "}
        <a className="text-sky-700 underline" href={me.account_url}>Tài khoản Port &amp; Logistics Hub</a>
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Dự án</h2>
        {p && <button className="text-xs text-slate-500 hover:underline" onClick={() => onCurrent({ project: null, versionId: null })}>Đóng dự án (chạy không lưu)</button>}
      </div>

      {!p && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            {rows.length === 0 ? <p className="text-slate-500">Chưa có dự án.</p> : (
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button className="text-left text-sky-700 hover:underline" onClick={() => act(() => reopen(r.id, null))}>{r.code} – {r.name}</button>
                    <span className="text-xs text-slate-400"> {r.role} · {r.versions} phiên bản · {r.runs} lần chạy</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const r = await api.createProject(code.trim(), name.trim(), doc ?? undefined);
              setCode(""); setName("");
              await reopen(r.id, r.version?.id ?? null);
            });
          }}>
            <input required placeholder="Mã" value={code} onChange={(e) => setCode(e.target.value)} className="w-24 rounded border px-2 py-1" />
            <input required placeholder="Tên dự án" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1" />
            <button disabled={busy} className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50">Tạo dự án</button>
            <p className="w-full text-xs text-slate-500">{doc ? "Dữ liệu đang mở được lưu làm phiên bản 1." : "Tạo dự án trống; mở dữ liệu rồi lưu phiên bản sau."}</p>
          </form>
        </div>
      )}

      {p && (
        <div className="space-y-3">
          <p><b>{p.code} – {p.name}</b> <span className="text-xs text-slate-500">vai trò {p.role}</span></p>

          <div>
            <h3 className="mb-1 font-medium">Phiên bản dữ liệu</h3>
            {canWrite && doc && (
              <div className="mb-2 flex flex-wrap gap-2">
                <input placeholder="Ghi chú phiên bản" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1" />
                <button disabled={busy} className="rounded border px-3 py-1" onClick={() => act(async () => {
                  const v = await api.saveVersion(p.id, doc, note);
                  setNote("");
                  await reopen(p.id, v.id);
                })}>Lưu dữ liệu đang mở</button>
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500"><tr><th>#</th><th>Ghi chú</th><th>SHA-256</th><th>Hợp lệ</th><th>Người tạo</th><th>Lúc</th><th /></tr></thead>
              <tbody>
                {p.versions.map((v) => (
                  <tr key={v.id} className={v.id === current.versionId ? "bg-sky-50" : ""}>
                    <td>v{v.n}</td><td>{v.note}</td><td className="font-mono">{v.input_sha256.slice(0, 12)}</td>
                    <td>{v.valid ? "✓" : "✗"}</td><td>{v.created_by ?? ""}</td><td>{day(v.created_at)}</td>
                    <td><button className="text-sky-700 hover:underline" onClick={() => act(async () => {
                      const x = await api.version(v.id);
                      onDoc(x.doc, v.id);
                      onCurrent({ project: p, versionId: v.id });
                    })}>Mở</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-1 font-medium">Lần chạy đã lưu</h3>
            {p.runs.length === 0 ? <p className="text-xs text-slate-500">Chưa có. Chạy ở tab 05 khi dự án đang mở: kết quả được lưu kèm phiên bản.</p> : (
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500"><tr><th>Phiên bản</th><th>Kế hoạch</th><th>C_max</th><th>GCR</th><th>Ổn định FAIL</th><th>Mã</th><th>Người chạy</th><th>Lúc</th><th /></tr></thead>
                <tbody>
                  {p.runs.map((r) => (
                    <tr key={r.id}>
                      <td>v{r.version}</td><td>{r.plan}</td><td>{fmt(r.makespan_s)}</td><td>{r.gcr?.toFixed(1) ?? "–"}</td>
                      <td>{r.stability_fail}</td><td className="font-mono">{r.run_hash.slice(0, 12)}</td><td>{r.created_by ?? ""}</td><td>{day(r.created_at)}</td>
                      <td><button className="text-sky-700 hover:underline" onClick={() => act(async () => {
                        const x = await api.storedRun(r.id);
                        const v = await api.version(x.version_id);
                        onCurrent({ project: p, versionId: x.version_id });
                        onRun(x, v.doc, x.version_id);
                      })}>Mở</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="mb-1 font-medium">Thành viên</h3>
            <ul className="mb-2 space-y-0.5 text-xs">
              {p.members.map((m) => (
                <li key={m.user_id}>{m.email} <span className="text-slate-500">{m.role}</span>
                  {p.role === "OWNER" && m.role !== "OWNER" && (
                    <button className="ml-2 text-red-600 hover:underline" onClick={() => act(async () => { await api.removeMember(p.id, m.user_id); await reopen(p.id); })}>xoá</button>
                  )}
                </li>
              ))}
            </ul>
            {p.role === "OWNER" && (
              <form className="flex flex-wrap gap-2" onSubmit={(e) => {
                e.preventDefault();
                act(async () => { await api.addMember(p.id, email.trim(), role); setEmail(""); await reopen(p.id); });
              }}>
                <input required type="email" placeholder="email tài khoản Hub" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1" />
                <select value={role} onChange={(e) => setRole(e.target.value as "PLANNER" | "VIEWER")} className="rounded border px-2 py-1">
                  <option value="PLANNER">PLANNER – lưu, chạy</option>
                  <option value="VIEWER">VIEWER – chỉ xem</option>
                </select>
                <button disabled={busy} className="rounded border px-3 py-1">Mời</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
