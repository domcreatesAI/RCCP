import client from './client'
import type { RCCPDashboard } from '../types'

export async function getDashboard(batchId: number): Promise<RCCPDashboard> {
  const { data } = await client.get<RCCPDashboard>(`/rccp/${batchId}/dashboard`)
  return data
}
