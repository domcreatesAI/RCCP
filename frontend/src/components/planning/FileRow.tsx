import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Clock,
  Download, Upload,
} from 'lucide-react'
import { uploadFile, downloadBatchFile } from '../../api/uploads'
import type { BatchFile, FileType, ValidationStatus } from '../../types'

const FILE_META: Record<FileType, { label: string; description: string }> = {
  master_stock: {
    label: 'master_stock',
    description: 'Stock snapshot per SKU per warehouse (SAP MB52). total_stock_ea, free_stock_ea, safety_stock_ea.',
  },
  demand_plan: {
    label: 'demand_plan',
    description: 'Monthly demand per SKU per warehouse (SAP PIR). Wide format: one column per month (M03.2026…).',
  },
  line_capacity_calendar: {
    label: 'line_capacity_calendar',
    description: 'Daily capacity per production line: planned hours, maintenance, holiday, downtime.',
  },
  headcount_plan: {
    label: 'headcount_plan',
    description: 'Planned headcount per line per date. Compared against line_resource_requirements to flag shortfalls.',
  },
  portfolio_changes: {
    label: 'portfolio_changes',
    description: 'Product portfolio changes in the planning horizon. Accepts 0 rows if no changes this cycle.',
  },
  production_orders: {
    label: 'production_orders',
    description: 'Open production orders from SAP COOIS. LA (MRP proposals) and YPAC (released/firmed) order types.',
  },
}

function StatusCell({ file, fileType }: { file: BatchFile | undefined; fileType: FileType }) {
  if (!file) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <XCircle className="w-3.5 h-3.5" /> Not uploaded
      </span>
    )
  }

  const status: ValidationStatus | null = file.validation_status

  if (!status || status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
        <Clock className="w-3.5 h-3.5" /> Pending
      </span>
    )
  }

  if (status === 'PASS') {
    const isEmptyValid = fileType === 'portfolio_changes' && (file.total_issue_count ?? 0) === 0
    return (
      <div>
        {isEmptyValid ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Empty — valid
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
          </span>
        )}
      </div>
    )
  }

  if (status === 'WARNING') {
    return (
      <div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" /> Warning
        </span>
        {(file.top_issues?.length ?? 0) > 0 && (
          <div className="mt-1 space-y-0.5 max-w-[240px]">
            {file.top_issues!.map((msg, i) => (
              <p key={i} className="text-xs text-gray-500 leading-tight line-clamp-2">{msg}</p>
            ))}
            {(file.total_issue_count ?? 0) > (file.top_issues!.length) && (
              <p className="text-xs text-gray-400">+{(file.total_issue_count ?? 0) - file.top_issues!.length} more</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // BLOCKED
  return (
    <div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <XCircle className="w-3.5 h-3.5" /> Blocked
      </span>
      {(file.top_issues?.length ?? 0) > 0 && (
        <div className="mt-1 space-y-0.5 max-w-[240px]">
          {file.top_issues!.map((msg, i) => (
            <p key={i} className="text-xs text-gray-500 leading-tight line-clamp-2">{msg}</p>
          ))}
          {(file.total_issue_count ?? 0) > (file.top_issues!.length) && (
            <p className="text-xs text-gray-400">+{(file.total_issue_count ?? 0) - file.top_issues!.length} more</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  batchId: number
  fileType: FileType
  file: BatchFile | undefined
  isLocked?: boolean
  index?: number
}

export default function FileRow({ batchId, fileType, file, isLocked, index = 0 }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const meta = FILE_META[fileType]
  const hasFile = !!file
  const isPresent = hasFile && (file.validation_status !== null)

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

  function handleDownload() {
    if (file) downloadBatchFile(batchId, fileType, file.original_filename)
  }

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border-b last:border-0 transition-colors hover:bg-gray-50/60"
      style={{ borderColor: '#F1F5F9' }}>

      {/* File name + description */}
      <td className="py-2.5 pr-3" style={{ minWidth: 200 }}>
        <div className="flex items-start gap-2">
          <FileSpreadsheet className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-semibold text-gray-900">{meta.label}</span>
              {fileType === 'portfolio_changes' && (
                <span className="text-xs px-1.5 py-px rounded font-medium bg-indigo-50 text-indigo-600"
                  style={{ fontSize: 9 }}>empty OK</span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 leading-tight" style={{ fontSize: 10 }}>
              {meta.description}
            </div>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-2.5 pr-3" style={{ minWidth: 140 }}>
        <StatusCell file={file} fileType={fileType} />
      </td>

      {/* Version */}
      <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
        {file ? `v${file.upload_version}` : '—'}
      </td>

      {/* Uploaded by */}
      <td className="py-2.5 pr-3 text-xs text-gray-500">
        {file?.uploaded_by ?? '—'}
      </td>

      {/* Time */}
      <td className="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap">
        {file ? new Date(file.uploaded_at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }) : '—'}
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
          {/* Template download */}
          <a
            href={`/api/templates/${fileType}`}
            download
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
            style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
            <Download className="w-3 h-3" /> Tmpl
          </a>
          {/* Download uploaded file */}
          {hasFile && (
            <button
              onClick={handleDownload}
              title="Download uploaded file"
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <Download className="w-3 h-3" /> Download
            </button>
          )}
          {/* Upload / Re-upload */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={isLocked || uploadMutation.isPending}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
            style={isPresent || isLocked
              ? { backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }
              : { backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }
            }>
            <Upload className="w-3 h-3" />
            {uploadMutation.isPending ? 'Uploading…' : isPresent || isLocked ? 'Re-upload' : 'Upload'}
          </button>
        </div>
      </td>
    </motion.tr>
  )
}
