import type { Issue, Me, Role, ProjectInfo, ProjectRow, RunOptions, RunResult, ScdpDoc, VersionRow } from "./types";

// G3: VITE_API_HOME = Worker ose-failover (VPS first, home server READ_ONLY second). VITE_API_BACKUP = the home server,
// used for ONE call only when the Worker itself cannot be reached (network error, 502, 504). 503 is not a server error
// (read-only backup), so it is never retried elsewhere. Development: VITE_API_BASE or http://127.0.0.1:8000.
const env = import.meta.env as Record<string, string | undefined>;
export const API = env.VITE_API_HOME ?? env.VITE_API_BASE ?? "http://127.0.0.1:8000";
export const API_BACKUP = env.VITE_API_BACKUP ?? null;

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "object" && detail && "code" in detail ? String((detail as { code: string }).code) : `HTTP ${status}`);
  }
}

// With the Hub login (VITE_OSE_PASS=1) the ose_pass cookie must travel to the API host.
const CRED: RequestCredentials = env.VITE_OSE_PASS === "1" ? "include" : "same-origin";

/** fetch with the layer-2 failover; returns the response and the base that answered (a job lives on one machine). */
async function send(path: string, init?: RequestInit, base?: string): Promise<{ r: Response; base: string }> {
  const b = base ?? API;
  const opts = { credentials: CRED, ...init };
  if (base || !API_BACKUP) return { r: await fetch(b + path, opts), base: b };
  try {
    const r = await fetch(b + path, opts);
    if (r.status !== 502 && r.status !== 504) return { r, base: b };
  } catch { /* network error: try the backup once */ }
  console.warn("[SCDP] Worker unreachable, this call goes to the backup (read-only)");
  return { r: await fetch(API_BACKUP + path, opts), base: API_BACKUP };
}

async function parse<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, body?.detail ?? body);
  return body as T;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  return parse<T>((await send(path, init)).r);
}

export interface JobState { job_id: string; status: "queued" | "running" | "done" | "error"; queued_ahead: number; elapsed_s: number;
  result?: RunResult & { run_id?: string; version_id?: string }; error?: { status_code: number; detail: unknown } }
export type Progress = (j: JobState) => void;
export interface FinishedJob { jobId: string; base: string; result: RunResult & { run_id?: string; version_id?: string } }

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** G3: the Worker waits 5 s at most, so every run is a background job polled on the machine that accepted it. */
async function job(path: string, body: unknown, onProgress?: Progress): Promise<FinishedJob> {
  const { r, base } = await send(path, json(body));
  let j = await parse<JobState>(r);
  for (let k = 0; ; k++) {
    onProgress?.(j);
    if (j.status === "done") return { jobId: j.job_id, base, result: j.result! };
    if (j.status === "error") throw new ApiError(j.error?.status_code ?? 500, j.error?.detail);
    await sleep(k < 5 ? 700 : 1500);
    j = await parse<JobState>((await send(`/api/v1/jobs/${j.job_id}`, undefined, base)).r);
  }
}

const json = (b: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

export const api = {
  cases: () => call<{ id: string; title: string; containers: number; data_status: string }[]>("/api/v1/cases"),
  case: (id: string) => call<ScdpDoc>(`/api/v1/cases/${encodeURIComponent(id)}`),
  importFile: async (f: File) =>
    call<{ doc: ScdpDoc; ok: boolean; issues: Issue[] }>(`/api/v1/import?filename=${encodeURIComponent(f.name)}`,
      { method: "POST", body: await f.arrayBuffer() }),
  validate: (doc: ScdpDoc) => call<{ ok: boolean; issues: Issue[] }>("/api/v1/validate", json(doc)),
  health: () => call<{ status: string; engine_version: string; ortools: boolean; gate: string; read_only?: boolean; instance?: string }>("/api/health"),
  runJob: (doc: ScdpDoc, options: RunOptions, onProgress?: Progress) => job("/api/v1/jobs", { doc, options }, onProgress),
  projectJob: (pid: string, version_id: string, options: RunOptions, onProgress?: Progress) =>
    job(`/api/v1/projects/${pid}/jobs`, { version_id, options }, onProgress),
  run: async (doc: ScdpDoc, plan: "B1" | "B1S" | "OPT", time_limit_s?: number, stability_loop = false) =>
    (await job("/api/v1/jobs", { doc, options: { plan, time_limit_s, stability_loop } })).result as RunResult,
  me: () => call<Me>("/api/v1/me"),
  projects: () => call<ProjectRow[]>("/api/v1/projects"),
  createProject: (code: string, name: string, doc?: ScdpDoc) =>
    call<{ id: string; version: VersionRow | null }>("/api/v1/projects", json({ code, name, doc })),
  project: (id: string) => call<ProjectInfo>(`/api/v1/projects/${id}`),
  saveVersion: (pid: string, doc: ScdpDoc, note = "") => call<VersionRow>(`/api/v1/projects/${pid}/versions`, json({ doc, note })),
  version: (vid: string) => call<VersionRow & { doc: ScdpDoc }>(`/api/v1/versions/${vid}`),
  storedRun: (rid: string) => call<RunResult & { run_id: string; version_id: string }>(`/api/v1/runs/${rid}`),
  addMember: (pid: string, email: string, role: Role) => call<{ user_id: string }>(`/api/v1/projects/${pid}/members`, json({ email, role })),
  removeMember: (pid: string, uid: string) => call<{ ok: boolean }>(`/api/v1/projects/${pid}/members/${uid}`, { method: "DELETE" }),
  /** Excel of a finished background run (same machine) or of a stored project run. */
  report: async (src: { job: FinishedJob } | { runId: string }) => {
    const { r } = "job" in src
      ? await send(`/api/v1/jobs/${src.job.jobId}/report`, undefined, src.job.base)
      : await send(`/api/v1/runs/${src.runId}/report`);
    if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => null))?.detail);
    const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "SCDP_report.xlsx";
    download(await r.blob(), name);
  },
};

export function download(data: Blob | string, name: string, type = "application/json") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
