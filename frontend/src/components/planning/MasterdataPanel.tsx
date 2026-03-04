import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMasterdataStatus, uploadMasterdata, downloadMasterdataFile } from '../../api/masterdata'
import type { MasterdataIssue } from '../../api/masterdata'
import { useAuth } from '../../contexts/AuthContext'

const MASTERDATA_META: Record<string, { label: string; description: string }> = {
  line_pack_capabilities: {
    label: 'Line pack capabilities',
    description: 'Fill speeds and pack sizes per production line',
  },
  line_resource_requirements: {
    label: 'Line resource requirements',
    description: 'Headcount needed per role to run each line',
  },
  plant_resource_requirements: {
    label: 'Plant resource requirements',
    description: 'Shared headcount per role per manufacturing plant',
  },
  warehouse_capacity: {
    label: 'Warehouse capacity',
    description: 'Maximum pallet positions per pack type per warehouse',
  },
}

const TEMPLATE_TYPES = new Set([
  'line_pack_capabilities',
  'line_resource_requirements',
  'plant_resource_requirements',
  'warehouse_capacity',
])

export const DISPLAY_ORDER = [
  'line_pack_capabilities',
  'line_resource_requirements',
  'plant_resource_requirements',
  'warehouse_capacity',
]

const STATUS_PILL: Record<string, string> = {
  imported: 'bg-green-50 text-green-700',
  warnings: 'bg-amber-50 text-amber-700',
  blocked: 'bg-red-50 text-red-700',
  not_uploaded: 'bg-gray-100 text-gray-500',
}

function IssueHint({ issues, severity }: { issues: MasterdataIssue[]; severity: 'BLOCKED' | 'WARNING' }) {
  if (issues.length === 0) return null
  const colour = severity === 'BLOCKED' ? 'text-red-600' : 'text-amber-600'
  return (
    <div className="mt-1 max-w-[280px]">
      <p className={`text-xs ${colour} line-clamp-2`}>{issues[0].message}</p>
      {issues.length > 1 && (
        <p className="text-xs text-gray-400">+{issues.length - 1} more</p>
      )}
    </div>
  )
}

export function MasterdataRow({ mdType }: { mdType: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastResult, setLastResult] = useState<{ errors: MasterdataIssue[]; warnings: MasterdataIssue[] } | null>(null)
  const [lastUploadedBy, setLastUploadedBy] = useState<string | null>(null)
  const [lastUploadedAt, setLastUploadedAt] = useState<string | null>(null)

  const { data: statusList = [] } = useQuery({
    queryKey: ['masterdata-status'],
    queryFn: getMasterdataStatus,
  })

  const status = statusList.find((s) => s.masterdata_type === mdType)
  const meta = MASTERDATA_META[mdType]

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMasterdata(mdType, file),
    onSuccess: (result) => {
      setLastResult({ errors: result.errors, warnings: result.warnings })
      setLastUploadedBy(user?.username ?? null)
      setLastUploadedAt(new Date().toISOString())
      queryClient.invalidateQueries({ queryKey: ['masterdata-status'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: { errors?: MasterdataIssue[] } } } })
        ?.response?.data?.detail
      setLastResult({ errors: detail?.errors ?? [], warnings: [] })
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setLastResult(null)
      setLastUploadedBy(null)
      setLastUploadedAt(null)
      uploadMutation.mutate(f)
    }
    e.target.value = ''
  }

  function handleDownload() {
    downloadMasterdataFile(mdType, status?.last_original_filename ?? `${mdType}.xlsx`)
  }

  // Determine status pill
  let pillKey: string
  let pillLabel: string
  if (uploadMutation.isError) {
    pillKey = 'blocked'
    pillLabel = 'Blocked'
  } else if (uploadMutation.isSuccess && lastResult) {
    if (lastResult.errors.length === 0 && lastResult.warnings.length === 0) {
      pillKey = 'imported'
      pillLabel = '✓ Valid'
    } else if (lastResult.errors.length === 0) {
      pillKey = 'warnings'
      pillLabel = '✓ Valid (warnings)'
    } else {
      pillKey = 'blocked'
      pillLabel = 'Blocked'
    }
  } else if (status?.last_uploaded_at) {
    pillKey = 'imported'
    pillLabel = '✓ Valid'
  } else if ((status?.table_row_count ?? 0) > 0) {
    pillKey = 'imported'
    pillLabel = `${status!.table_row_count} rows`
  } else {
    pillKey = 'not_uploaded'
    pillLabel = 'Not uploaded'
  }

  const hasFile = !!(status?.last_uploaded_at || lastUploadedAt)

  // Uploaded by and time: prefer DB value, fall back to post-mutation state
  const displayUploadedBy = status?.last_uploaded_by ?? lastUploadedBy
  const displayUploadedAt = status?.last_uploaded_at ?? lastUploadedAt

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50 align-top">
      {/* File */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-400">{meta.description}</p>
            {status?.last_version_number != null ? (
              <p className="text-xs text-blue-600 font-medium mt-0.5">
                v{status.last_version_number}
                {status.last_uploaded_at
                  ? ` · ${new Date(status.last_uploaded_at).toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`
                  : ''}
              </p>
            ) : !status?.last_uploaded_at && (status?.table_row_count ?? 0) > 0 ? (
              <p className="text-xs text-gray-400 mt-0.5">{status!.table_row_count} rows in DB — upload to track versions</p>
            ) : null}
            {TEMPLATE_TYPES.has(mdType) && (
              <a
                href={`/api/masterdata/${mdType}/template`}
                download
                className="mt-0.5 text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5 w-fit"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Template
              </a>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[pillKey]}`}>
          {pillLabel}
        </span>
        {lastResult && lastResult.errors.length > 0 && (
          <IssueHint issues={lastResult.errors} severity="BLOCKED" />
        )}
        {lastResult && lastResult.errors.length === 0 && lastResult.warnings.length > 0 && (
          <IssueHint issues={lastResult.warnings} severity="WARNING" />
        )}
      </td>

      {/* Uploaded by */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {displayUploadedBy ?? '—'}
      </td>

      {/* Time */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {displayUploadedAt
          ? new Date(displayUploadedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })
          : '—'}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
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
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
          {hasFile && (
            <button
              onClick={handleDownload}
              title="Download last uploaded file"
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
