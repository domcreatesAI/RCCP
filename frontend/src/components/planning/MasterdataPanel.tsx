import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Package, CheckCircle2, XCircle, Download, Upload } from 'lucide-react'
import { getMasterdataStatus, uploadMasterdata, downloadMasterdataFile } from '../../api/masterdata'
import type { MasterdataIssue } from '../../api/masterdata'
import { useAuth } from '../../contexts/AuthContext'

const MASTERDATA_META: Record<string, { label: string; description: string }> = {
  sku_masterdata: {
    label: 'sku_masterdata',
    description: 'SKU attributes: description, ABC, MRP type, pack size, MOQ, pack type, line assignments, unit cost. Upload before batch files. MERGE by item_code.',
  },
  line_pack_capabilities: {
    label: 'line_pack_capabilities',
    description: 'Pack sizes each filling line can run and fill speed (bottles/min). Full replace on upload.',
  },
  line_resource_requirements: {
    label: 'line_resource_requirements',
    description: 'Headcount per role required to run each line (e.g. A101 needs 3 Line Operators).',
  },
  plant_resource_requirements: {
    label: 'plant_resource_requirements',
    description: 'Shared headcount required at plant level regardless of lines running (forklift drivers etc.).',
  },
  warehouse_capacity: {
    label: 'warehouse_capacity',
    description: 'Max pallet positions per pack type per warehouse (UKP1, UKP3, UKP4, UKP5).',
  },
}

export const DISPLAY_ORDER = [
  'sku_masterdata',
  'line_pack_capabilities',
  'line_resource_requirements',
  'plant_resource_requirements',
  'warehouse_capacity',
]

function IssueHint({ issues, severity }: { issues: MasterdataIssue[]; severity: 'BLOCKED' | 'WARNING' }) {
  if (issues.length === 0) return null
  const colour = severity === 'BLOCKED' ? 'text-red-600' : 'text-amber-600'
  return (
    <div className="mt-1 max-w-[240px]">
      <p className={`text-xs ${colour} leading-tight line-clamp-2`}>{issues[0].message}</p>
      {issues.length > 1 && (
        <p className="text-xs text-gray-400">+{issues.length - 1} more</p>
      )}
    </div>
  )
}

export function MasterdataRow({ mdType, index = 0 }: { mdType: string; index?: number }) {
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

  // Derive status display
  const hasError = uploadMutation.isError || (lastResult && lastResult.errors.length > 0)
  const hasOnRecord = !!(status?.last_uploaded_at || lastUploadedAt)
  const displayUploadedBy = status?.last_uploaded_by ?? lastUploadedBy
  const displayUploadedAt = status?.last_uploaded_at ?? lastUploadedAt

  const versionLabel = status?.last_version_number != null
    ? `v${status.last_version_number}`
    : (status?.table_row_count ?? 0) > 0
      ? `${status!.table_row_count} rows`
      : '—'

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.05 }}
      className="border-b last:border-0 transition-colors hover:bg-gray-50/60"
      style={{ borderColor: '#F1F5F9' }}>

      {/* File name + description */}
      <td className="py-2.5 pr-3" style={{ minWidth: 200 }}>
        <div className="flex items-start gap-2">
          <Package className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400" />
          <div>
            <span className="font-mono text-xs font-semibold text-gray-900">{meta.label}</span>
            <div className="text-xs text-gray-400 mt-0.5 leading-tight" style={{ fontSize: 10 }}>
              {meta.description}
            </div>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-2.5 pr-3" style={{ minWidth: 140 }}>
        {uploadMutation.isPending ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
            <Upload className="w-3.5 h-3.5 animate-pulse" /> Uploading…
          </span>
        ) : hasError ? (
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
              <XCircle className="w-3.5 h-3.5" /> Blocked
            </span>
            {lastResult && lastResult.errors.length > 0 && (
              <IssueHint issues={lastResult.errors} severity="BLOCKED" />
            )}
          </div>
        ) : hasOnRecord ? (
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> On record
            </span>
            {lastResult && lastResult.warnings.length > 0 && (
              <IssueHint issues={lastResult.warnings} severity="WARNING" />
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <XCircle className="w-3.5 h-3.5" /> Not uploaded
          </span>
        )}
      </td>

      {/* Version */}
      <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
        {versionLabel}
      </td>

      {/* Uploaded by */}
      <td className="py-2.5 pr-3 text-xs text-gray-500">
        {displayUploadedBy ?? '—'}
      </td>

      {/* Time */}
      <td className="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap">
        {displayUploadedAt
          ? new Date(displayUploadedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })
          : '—'}
      </td>

      {/* Actions */}
      <td className="py-2.5">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* Template */}
          <a
            href={`/api/masterdata/${mdType}/template`}
            download
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
            style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
            <Download className="w-3 h-3" /> Tmpl
          </a>
          {/* Download uploaded */}
          {hasOnRecord && (
            <button
              onClick={handleDownload}
              title="Download last uploaded file"
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <Download className="w-3 h-3" /> Download
            </button>
          )}
          {/* Upload / Re-upload */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
            <Upload className="w-3 h-3" />
            {uploadMutation.isPending ? 'Uploading…' : hasOnRecord ? 'Re-upload' : 'Upload'}
          </button>
        </div>
      </td>
    </motion.tr>
  )
}
