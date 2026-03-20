export interface ValidationStage {
  stage: number
  name: string
  severity: 'PASS' | 'WARNING' | 'BLOCKED' | 'INFO'
}

export interface Batch {
  batch_id: number
  batch_name: string
  plan_cycle_date: string
  status: 'DRAFT' | 'VALIDATING' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED'
  notes: string | null
  created_by: string | null
  created_at: string
  published_at: string | null
  published_by: string | null
  files?: BatchFile[]
  validation_stages?: ValidationStage[]
}

export interface BatchFile {
  batch_file_id: number
  batch_id: number
  file_type: FileType
  original_filename: string
  stored_file_path: string
  file_size_bytes: number
  upload_version: number
  is_current_version: boolean
  validation_status: ValidationStatus | null
  uploaded_by: string | null
  uploaded_at: string
  blocked_count?: number
  warning_count?: number
  info_count?: number
  top_issues?: string[]
  total_issue_count?: number
}

export type FileType =
  | 'master_stock'
  | 'demand_plan'
  | 'line_capacity_calendar'
  | 'headcount_plan'
  | 'portfolio_changes'
  | 'production_orders'

export type ValidationStatus = 'PENDING' | 'PASS' | 'WARNING' | 'BLOCKED'

export interface Baseline {
  version_id: number
  batch_id: number
  version_name: string
  version_type: string
  is_active_baseline: boolean
  created_by: string | null
  created_at: string
  locked_at: string
}

// ─── RCCP Dashboard types ─────────────────────────────────────────────────────

export type UnitMode = 'L' | 'h'
export type PeriodSlice = '18M' | '12M' | '6M' | '3M'
export type WeekSlice = '12W' | '8W' | '4W'
export type Granularity = 'monthly' | 'weekly'

export interface RCCPKPIs {
  critical_lines: number
  high_lines: number
  overall_utilisation_pct: number | null
  total_gap_litres: number | null
  lines_with_labour_shortfall: number
  lines_with_no_data: number
  total_gap_hours: number | null
  peak_util_pct: number | null
  peak_util_period: string | null
}

export interface RCCPMonthlyBucket {
  period: string
  working_days: number
  // litres
  available_litres: number | null
  demand_litres: number
  firm_litres: number
  planned_litres: number
  production_litres: number
  utilisation_pct: number | null
  gap_litres: number | null
  labour_status: 'OK' | 'SHORTFALL' | 'NO_DATA'
  // hours
  available_hours: number | null
  firm_hours: number | null
  planned_hours: number | null
  production_hours: number | null
  demand_hours: number | null
  gap_hours: number | null
  // headcount
  hc_required: number | null
  hc_planned_avg: number | null
  hc_shortfall: number | null
}

export interface RCCPWeeklyBucket {
  period: string           // "2026-W12"
  working_days: number
  available_litres: number | null
  firm_litres: number
  planned_litres: number
  production_litres: number
  utilisation_pct: number | null
  gap_litres: number | null
  available_hours: number | null
  firm_hours: number | null
  planned_hours: number | null
  production_hours: number | null
  gap_hours: number | null
}

export interface RCCPHCRole {
  role_code: string
  required: number
}

export interface RCCPPlantSupportMonthly {
  period: string
  hc_planned_avg: number | null
  hc_shortfall: number | null
}

export interface RCCPPlantSupportRole {
  role_code: string
  required: number
  monthly: RCCPPlantSupportMonthly[]
}

export interface RCCPLine {
  line_code: string
  line_name: string
  plant_code: string
  pool_code: string | null
  pool_max_concurrent: number | null
  risk_status: 'Critical' | 'High' | 'Watch' | 'Stable' | 'No data'
  risk_score: number
  primary_driver: 'CAPACITY' | 'LABOUR' | 'STABLE' | 'NO_DATA'
  labour_status: 'OK' | 'SHORTFALL' | 'NO_DATA'
  hc_roles: RCCPHCRole[]
  monthly: RCCPMonthlyBucket[]
  weekly: RCCPWeeklyBucket[]
}

export interface RCCPUnassignedOrder {
  item_code: string
  period: string
  order_type: string
  total_litres: number
  order_count: number
}

export interface RCCPDashboard {
  batch_id: number
  plan_cycle_date: string
  generated_at: string
  horizon_start: string
  horizon_months: string[]
  horizon_weeks: string[]
  kpis: RCCPKPIs
  lines: RCCPLine[]
  unassigned_orders: RCCPUnassignedOrder[]
  plant_support_requirements: Record<string, RCCPPlantSupportRole[]>
}

export interface User {
  username: string
  role: 'admin' | 'user'
}

export interface LoginResponse {
  access_token: string
  token_type: string
  role: 'admin' | 'user'
}
