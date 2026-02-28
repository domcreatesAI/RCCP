import client from './client'
import type { Batch } from '../types'

export async function listBatches(): Promise<Batch[]> {
  const { data } = await client.get<Batch[]>('/batches')
  return data
}

export async function getBatch(batchId: number): Promise<Batch> {
  const { data } = await client.get<Batch>(`/batches/${batchId}`)
  return data
}

export async function createBatch(batchName: string, planCycleDate: string): Promise<Batch> {
  const { data } = await client.post<Batch>('/batches', {
    batch_name: batchName,
    plan_cycle_date: planCycleDate,
  })
  return data
}

export async function validateBatch(batchId: number): Promise<Batch> {
  const { data } = await client.post<Batch>(`/batches/${batchId}/validate`)
  return data
}
