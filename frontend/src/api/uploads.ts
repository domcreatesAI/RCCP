import client from './client'
import type { BatchFile, FileType } from '../types'

export async function uploadFile(
  batchId: number,
  fileType: FileType,
  file: File
): Promise<BatchFile> {
  const formData = new FormData()
  formData.append('file_type', fileType)
  formData.append('file', file)

  const { data } = await client.post<BatchFile>(`/batches/${batchId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
