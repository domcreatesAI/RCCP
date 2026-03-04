import client from './client'
import type { Baseline } from '../types'

export async function listBaselines(): Promise<Baseline[]> {
  const { data } = await client.get<Baseline[]>('/baselines')
  return data
}

export async function createBaseline(batchId: number, versionName: string): Promise<Baseline> {
  const { data } = await client.post<Baseline>('/baselines', {
    batch_id: batchId,
    version_name: versionName,
  })
  return data
}
