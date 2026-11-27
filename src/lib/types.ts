// scdp-input/0.1 (subset used by the UI) and API results.

export interface Slot { slot_id: string; bay: number; row: number; tier: number; deck: "DECK" | "HOLD"; x_m: number; y_m: number;
  z_bottom_m: number; max_length_ft: number; hatch_cover_id?: string }
export interface Container { container_id: string; slot_id: string; length_ft: number; gross_mass_t: number; pod: string;
  action: "DISCHARGE" | "STAY" | "RESTOW_SHIP" | "RESTOW_QUAY"; restow_slot_id?: string; empty: boolean; reefer?: boolean;
  dg_class?: string; oog?: boolean; mass_source: string }
export interface HatchCover { cover_id: string; bays: number[]; rows: number[]; x_m: number; landing: string; landing_cover_id?: string }
export interface QuayCrane { qc_id: string; order: number; initial_x_m: number; twin_lift: boolean; gantry_speed_m_s: number }
export interface ScdpDoc {
  meta: { format: string; project_code: string; title: string; data_status: string; source: string };
  coordinate_system: Record<string, string>;
  vessel: { vessel_id: string; name: string; loa_m: number; beam_m: number; bow_direction: string };
  slots: Slot[]; containers: Container[]; hatch_covers?: HatchCover[]; quay_cranes: QuayCrane[];
  trucks: { count: number; type: string; twin_capable: boolean };
  scenario: { scenario_id: string; qc_ids: string[]; vessel_origin_quay_x_m: number; des_mode: string; replications: number;
    seed: number; solver_time_limit_s: number };
  [k: string]: unknown;
}

export interface SimEvent { event_id: number; t_s: number; type: string; qc?: string; task?: string; container?: string;
  slot?: string; truck?: string; receiver?: string; from_x?: number; to_x?: number; x?: number; task_type?: string;
  object?: string; target?: string }

export interface Issue { code: string; severity: "ERROR" | "WARNING" | "INFO"; table: string; row: number | null; field: string; message: string }

export interface Kpi { makespan_s: number; container_moves: number; hatch_moves: number; qc_hours: Record<string, number>;
  qc_hours_total: number; hatch_hours: number; truck_wait_hours: Record<string, number>; gcr: number | null; ncr: number | null;
  vessel_rate: number | null; crane_intensity: number | null }

export interface RunResult {
  run_hash: string; engine_version: string; plan: "B1" | "OPT";
  lower_bound: { lb: number; lb_work: number; lb_bay: number; lb_path: number; work_s: number };
  solver: null | { status: string; makespan: number; bound: number; gap: number; wall_s: number };
  sequences: Record<string, string[]>; kpi: Kpi; events: SimEvent[]; vessel_end_s: number; conservation: string[];
  stability: { summary: { checkpoints: number; by_status: Record<string, number>; pass: number; fail: number;
      max_abs_heel_deg?: number; min_gmcorr_m?: number };
    checkpoints: Checkpoint[] };
  stability_loop?: null | { status: string; iterations: number;
    cuts: { iteration: number; before: string; after: string; t_s: number; limit: string | null }[] };
  replications?: { n: number; makespan_mean_s: number; makespan_sd_s: number; makespan_p90_s: number; makespans_s: number[] };
  wall_s: number;
}

export interface Checkpoint { checkpoint: number; t_s: number; cause: string; object: string; status: string; reasons: string[];
  values?: { heel_deg?: number | null; gmcorr_m?: number; trim_m?: number; draft_m?: number; disp_t?: number };
  failed?: { limit_id: string; value: number; limit: number }[]; binding?: { limit_id: string; utilisation: number | null } | null }
