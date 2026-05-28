import client from './client'

export interface AppSetting {
  key: string
  label: string
  group: string
  type: 'percent' | 'currency' | string
  default: string
  value: string
  description: string
  unit?: string
  min?: number
  max?: number
}

export async function listSettings(): Promise<{ settings: AppSetting[]; can_edit: boolean }> {
  const { data } = await client.get<{ settings: AppSetting[]; can_edit: boolean }>('/settings')
  return data
}

export async function updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
  const { data } = await client.put<{ key: string; value: string }>(`/settings/${key}`, { value })
  return data
}

export interface LineOee {
  line_code: string
  plant_code: string
  oee_target: number | null
}

export async function listLineOee(): Promise<{ lines: LineOee[]; can_edit: boolean }> {
  const { data } = await client.get<{ lines: LineOee[]; can_edit: boolean }>('/settings/line-oee')
  return data
}

export async function updateLineOee(lineCode: string, value: string): Promise<{ line_code: string; oee_target: number }> {
  const { data } = await client.put<{ line_code: string; oee_target: number }>(`/settings/line-oee/${lineCode}`, { value })
  return data
}
