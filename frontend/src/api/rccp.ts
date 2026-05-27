import client from './client'
import type { RCCPDashboard } from '../types'

export async function getDashboard(batchId: number): Promise<RCCPDashboard> {
  const { data } = await client.get<RCCPDashboard>(`/rccp/${batchId}/dashboard`)
  return data
}

/** Fetch the S&OP verification workbook and trigger a browser download. */
export async function downloadVerificationExcel(batchId: number): Promise<void> {
  const res = await client.get(`/rccp/${batchId}/verification.xlsx`, { responseType: 'blob' })
  const cd = res.headers['content-disposition'] as string | undefined
  const match = cd?.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? `sop_verification_batch${batchId}.xlsx`

  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
