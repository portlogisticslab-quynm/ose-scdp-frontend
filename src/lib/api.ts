import type { Issue, RunResult, ScdpDoc } from "./types";

export const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "object" && detail && "code" in detail ? String((detail as { code: string }).code) : `HTTP ${status}`);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, init);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, body?.detail ?? body);
  return body as T;
}

const json = (b: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

export const api = {
  health: () => call<{ status: string; engine_version: string; ortools: boolean; gate: string }>("/api/health"),
  cases: () => call<{ id: string; title: string; containers: number; data_status: string }[]>("/api/v1/cases"),
  case: (id: string) => call<ScdpDoc>(`/api/v1/cases/${encodeURIComponent(id)}`),
  importFile: async (f: File) =>
    call<{ doc: ScdpDoc; ok: boolean; issues: Issue[] }>(`/api/v1/import?filename=${encodeURIComponent(f.name)}`,
      { method: "POST", body: await f.arrayBuffer() }),
  validate: (doc: ScdpDoc) => call<{ ok: boolean; issues: Issue[] }>("/api/v1/validate", json(doc)),
  run: (doc: ScdpDoc, plan: "B1" | "B1S" | "OPT", time_limit_s?: number, stability_loop = false) =>
    call<RunResult>("/api/v1/run", json({ doc, options: { plan, time_limit_s, stability_loop } })),
  report: async (doc: ScdpDoc, plan: "B1" | "B1S" | "OPT", time_limit_s?: number, stability_loop = false) => {
    const r = await fetch(API + "/api/v1/report", json({ doc, options: { plan, time_limit_s, stability_loop } }));
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
