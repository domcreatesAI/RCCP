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

export async function downloadBatchFile(
  batchId: number,
  fileType: string,
  filename: string
): Promise<void> {
  const { data } = await client.get(`/batches/${batchId}/files/${fileType}/download`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
