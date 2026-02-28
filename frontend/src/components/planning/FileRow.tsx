import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadFile } from '../../api/uploads'
import type { BatchFile, FileType, ValidationStatus } from '../../types'

const FILE_META: Record<FileType, { label: string; description: string }> = {
  master_stock: {
    label: 'Master stock',
    description: 'Period-opening stock levels by item and location',
  },
  demand_plan: {
    label: 'Demand plan',
    description: 'Forecast demand volume by item and month',
  },
  line_capacity_calendar: {
    label: 'Capacity calendar',
    description: 'Line availability, shift patterns, and maintenance windows',
  },
  headcount_plan: {
    label: 'Headcount plan',
    description: 'Operator headcount and labour hours per line per week',
  },
  portfolio_changes: {
    label: 'Portfolio changes',
    description: 'New product launches and discontinuations — may have zero rows',
  },
  oee_daily: {
    label: 'OEE daily',
    description: 'Daily OEE actuals per line — optional, missing = warning',
  },
}

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-blue-50 text-blue-700',
  PASS: 'bg-green-50 text-green-700',
  WARNING: 'bg-amber-50 text-amber-700',
  BLOCKED: 'bg-red-50 text-red-700',
}

interface Props {
  batchId: number
  fileType: FileType
  file: BatchFile | undefined
  optional?: boolean
}

export default function FileRow({ batchId, fileType, file, optional }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const meta = FILE_META[fileType]

  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadFile(batchId, fileType, f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) uploadMutation.mutate(f)
    e.target.value = ''
  }

  const status: ValidationStatus | null = file?.validation_status ?? null
  const hasFile = !!file

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50">
      {/* File name + description */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-400">{meta.description}</p>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        {hasFile && status ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[status]}`}>
            {status === 'PASS' ? 'Pass' : status === 'WARNING' ? 'Warning' : status === 'BLOCKED' ? 'Blocked' : 'Pending'}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            Not uploaded
          </span>
        )}
      </td>

      {/* Version */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {file ? `v${file.upload_version}` : '—'}
      </td>

      {/* Uploaded by */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {file?.uploaded_by ?? '—'}
      </td>

      {/* Time */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {file ? new Date(file.uploaded_at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }) : '—'}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            hasFile
              ? 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50`}
        >
          {uploadMutation.isPending ? 'Uploading…' : hasFile ? 'Re-upload' : 'Upload'}
        </button>
      </td>
    </tr>
  )
}
