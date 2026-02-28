import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMasterdataStatus, uploadMasterdata } from '../../api/masterdata'
import type { MasterdataIssue } from '../../api/masterdata'

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
  item_master: {
    label: 'Item master (SAP)',
    description: 'MOQ, units per pallet and MRP type per item',
  },
  item_status: {
    label: 'Item status',
    description: '1 = In Design · 2 = Phase Out · 3 = Obsolete',
  },
}

// Types that have a downloadable Excel template (item_master comes from SAP)
const TEMPLATE_TYPES = new Set([
  'line_pack_capabilities',
  'line_resource_requirements',
  'plant_resource_requirements',
  'warehouse_capacity',
  'item_status',
])

const DISPLAY_ORDER = [
  'line_pack_capabilities',
  'line_resource_requirements',
  'plant_resource_requirements',
  'warehouse_capacity',
  'item_master',
  'item_status',
]

interface IssueListProps {
  issues: MasterdataIssue[]
  severity: 'BLOCKED' | 'WARNING'
}

function IssueList({ issues, severity }: IssueListProps) {
  if (issues.length === 0) return null
  const colour = severity === 'BLOCKED' ? 'text-red-600' : 'text-amber-600'
  const bg = severity === 'BLOCKED' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 ${bg}`}>
      <p className={`text-xs font-semibold mb-1 ${colour}`}>
        {severity === 'BLOCKED' ? 'Blocked' : 'Warnings'} ({issues.length})
      </p>
      <ul className="space-y-0.5">
        {issues.map((issue, i) => (
          <li key={i} className={`text-xs ${colour}`}>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MasterdataRow({ mdType }: { mdType: string }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastResult, setLastResult] = useState<{ errors: MasterdataIssue[]; warnings: MasterdataIssue[] } | null>(null)

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
      queryClient.invalidateQueries({ queryKey: ['masterdata-status'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: { errors?: MasterdataIssue[] } } } })
        ?.response?.data?.detail
      if (detail?.errors) {
        setLastResult({ errors: detail.errors, warnings: [] })
      }
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setLastResult(null)
      uploadMutation.mutate(f)
    }
    e.target.value = ''
  }

  const isUploaded = !!status?.last_uploaded_at
  const uploadedDate = status?.last_uploaded_at
    ? new Date(status.last_uploaded_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50 align-top">
      {/* Label */}
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-gray-900">{meta.label}</p>
        <p className="text-xs text-gray-400">{meta.description}</p>
      </td>

      {/* Last updated */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {isUploaded ? (
          <div>
            <p>{uploadedDate}</p>
            {status?.last_uploaded_by && (
              <p className="text-xs text-gray-400">{status.last_uploaded_by}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">Never uploaded</span>
        )}
      </td>

      {/* Rows */}
      <td className="py-3 px-4 text-sm text-gray-500">
        {status?.last_row_count ?? '—'}
      </td>

      {/* Upload result */}
      <td className="py-3 px-4">
        {uploadMutation.isSuccess && lastResult?.errors.length === 0 && (
          <span className="text-xs text-green-600 font-medium">Imported</span>
        )}
        {uploadMutation.isError && lastResult?.errors && (
          <div>
            <span className="text-xs text-red-600 font-medium">Blocked — not imported</span>
            <IssueList issues={lastResult.errors} severity="BLOCKED" />
            <IssueList issues={lastResult.warnings} severity="WARNING" />
          </div>
        )}
        {uploadMutation.isSuccess && (lastResult?.warnings.length ?? 0) > 0 && (
          <div>
            <span className="text-xs text-amber-600 font-medium">Imported with warnings</span>
            <IssueList issues={lastResult!.warnings} severity="WARNING" />
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          {TEMPLATE_TYPES.has(mdType) && (
            <a
              href={`/api/masterdata/${mdType}/template`}
              download
              title="Download Excel template"
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Template
            </a>
          )}
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
            {uploadMutation.isPending ? 'Uploading…' : isUploaded ? 'Re-upload' : 'Upload'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function MasterdataPanel() {
  const colHeaders = ['Masterdata file', 'Last updated', 'Rows', 'Result', 'Actions']

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Masterdata</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Update each cycle to ensure the capacity model uses current data.
          BLOCKED issues reject the upload — fix the file and re-upload.
        </p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {colHeaders.map((h) => (
              <th key={h} className="py-2 px-4 text-left text-xs font-medium text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DISPLAY_ORDER.map((mdType) => (
            <MasterdataRow key={mdType} mdType={mdType} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
