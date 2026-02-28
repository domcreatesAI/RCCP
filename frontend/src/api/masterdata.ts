import client from './client'

export interface MasterdataStatus {
  masterdata_type: string
  last_uploaded_at: string | null
  last_uploaded_by: string | null
  last_row_count: number | null
}

export interface MasterdataUploadResult {
  success: boolean
  rows_imported: number | null
  errors: MasterdataIssue[]
  warnings: MasterdataIssue[]
}

export interface MasterdataIssue {
  stage: number
  stage_name: string
  severity: 'BLOCKED' | 'WARNING'
  field: string | null
  row: number | null
  message: string
}

export async function getMasterdataStatus(): Promise<MasterdataStatus[]> {
  const { data } = await client.get<MasterdataStatus[]>('/masterdata/status')
  return data
}

export async function uploadMasterdata(
  masterdataType: string,
  file: File,
): Promise<MasterdataUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.post<MasterdataUploadResult>(
    `/masterdata/${masterdataType}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
