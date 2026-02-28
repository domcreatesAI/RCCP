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
  top_issue_message?: string | null
  total_issue_count?: number
}

export type FileType =
  | 'master_stock'
  | 'demand_plan'
  | 'line_capacity_calendar'
  | 'headcount_plan'
  | 'portfolio_changes'
  | 'oee_daily'

export type ValidationStatus = 'PENDING' | 'PASS' | 'WARNING' | 'BLOCKED'

export interface User {
  username: string
  role: 'admin' | 'user'
}

export interface LoginResponse {
  access_token: string
  token_type: string
  role: 'admin' | 'user'
}
