import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  Database, RefreshCw, Archive, Send, CheckCircle2, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import FileRow from './FileRow'
import { MasterdataRow, DISPLAY_ORDER } from './MasterdataPanel'
import { validateBatch, resetBatch, publishBatch } from '../../api/batches'
import { listBaselines, createBaseline } from '../../api/baselines'
import type { Batch, FileType } from '../../types'

const REQUIRED_FILES: FileType[] = [
  'master_stock',
  'production_orders',
  'demand_plan',
  'line_capacity_calendar',
  'headcount_plan',
  'portfolio_changes',
]

interface Props {
  batch: Batch
}

export default function FileUploadTable({ batch }: Props) {
  const filesByType = Object.fromEntries(
    (batch.files ?? []).map((f) => [f.file_type, f])
  )
  const requiredPresent = REQUIRED_FILES.filter((ft) => filesByType[ft]).length
  const isLocked = batch.status === 'PUBLISHED' || batch.status === 'ARCHIVED'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

      {/* Single unified table */}
      <div className="px-5 pt-4 pb-5">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              {['File', 'Status', 'Ver.', 'Uploaded by', 'Time', 'Actions'].map((h) => (
                <th key={h} className="text-left pb-2 text-xs font-semibold text-gray-500 whitespace-nowrap pr-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* SAP Batch Files section header */}
            <tr style={{ background: 'linear-gradient(to right, #F8FAFC, white)' }}>
              <td colSpan={6} className="pt-3 pb-2 pr-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-gray-900">SAP Batch Files</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      6 required files from SAP — all must be present before batch can be published
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold
                    ${requiredPresent < 6
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    {requiredPresent}/6 present
                  </div>
                </div>
              </td>
            </tr>

            {REQUIRED_FILES.map((ft, i) => (
              <FileRow
                key={ft}
                batchId={batch.batch_id}
                fileType={ft}
                file={filesByType[ft]}
                isLocked={isLocked}
                index={i}
              />
            ))}

            {/* Masterdata section header */}
            <tr>
              <td colSpan={6} className="pt-5 pb-2 pr-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-violet-500" />
                  <div className="text-sm font-bold text-gray-900">Masterdata Uploads</div>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 ml-[22px]">
                  5 reference datasets — upload sku_masterdata first (upserts items). Others are full-replace.
                </div>
              </td>
            </tr>

            {DISPLAY_ORDER.map((mdType, i) => (
              <MasterdataRow key={mdType} mdType={mdType} index={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Batch Action Bar ─────────────────────────────────────────────────────────

interface ActionBarProps {
  batch: Batch
}

export function BatchActionBar({ batch }: ActionBarProps) {
  const queryClient = useQueryClient()
  const [resetConfirm, setResetConfirm] = useState(false)
  const [baselineName, setBaselineName] = useState('')
  const [baselineError, setBaselineError] = useState<string | null>(null)

  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines'],
    queryFn: listBaselines,
  })
  const existingBaseline = baselines.find((b) => b.batch_id === batch.batch_id)

  const filesByType = Object.fromEntries(
    (batch.files ?? []).map((f) => [f.file_type, f])
  )

  const isArchived = batch.status === 'ARCHIVED'
  const isLocked = batch.status === 'PUBLISHED' || isArchived
  const requiredPresent = REQUIRED_FILES.filter((ft) => filesByType[ft]).length
  const hasBlocked = (batch.files ?? []).some((f) => f.validation_status === 'BLOCKED')
  const hasPending = REQUIRED_FILES.some((ft) => !filesByType[ft]?.validation_status)
  const canPublish = requiredPresent === 6 && !hasBlocked && !hasPending && batch.status === 'DRAFT'
  const canBaseline = batch.status === 'PUBLISHED' && !existingBaseline
  const hasFiles = (batch.files ?? []).length > 0

  const validateMutation = useMutation({
    mutationFn: () => validateBatch(batch.batch_id),
    onSuccess: () => {
      toast.success('Validation complete')
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ? `Validation failed: ${detail}` : 'Validation failed — check backend logs')
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetBatch(batch.batch_id),
    onSuccess: () => {
      setResetConfirm(false)
      toast.success('Batch reset to DRAFT')
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
    },
    onError: () => toast.error('Reset failed'),
  })

  const publishMutation = useMutation({
    mutationFn: () => publishBatch(batch.batch_id),
    onSuccess: () => {
      toast.success('Batch published', { description: 'Planning data is now active.' })
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Publish failed — check server logs'
      toast.error(msg)
    },
  })

  const createBaselineMutation = useMutation({
    mutationFn: () => createBaseline(batch.batch_id, baselineName),
    onSuccess: () => {
      setBaselineError(null)
      setBaselineName('')
      toast.success('Baseline created', { description: 'This planning cycle is now locked.' })
      queryClient.invalidateQueries({ queryKey: ['baselines'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to create baseline'
      setBaselineError(msg)
    },
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4"
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

      <div className="flex items-center justify-between gap-4">
        {/* Left: secondary actions */}
        <div className="flex items-center gap-2">
          {/* Re-validate */}
          {hasFiles && !isLocked && (
            <button
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40"
              style={{ backgroundColor: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }}>
              <RefreshCw className={`w-4 h-4 ${validateMutation.isPending ? 'animate-spin' : ''}`} />
              {validateMutation.isPending ? 'Running…' : 'Re-validate'}
            </button>
          )}

          {/* Reset batch */}
          {hasFiles && !isLocked && !resetConfirm && (
            <button
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
              style={{ backgroundColor: '#FEF2F2', color: '#991B1B', borderColor: '#FECACA' }}>
              <Archive className="w-4 h-4" /> Reset Batch
            </button>
          )}
          {resetConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete all uploaded files?</span>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {resetMutation.isPending ? 'Resetting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                disabled={resetMutation.isPending}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* Archived notice */}
          {isArchived && (
            <span className="text-sm text-gray-400 font-medium">This batch has been archived — read only.</span>
          )}
        </div>

        {/* Right: primary actions */}
        <div className="flex items-center gap-2">
          {/* Publish */}
          {!isLocked && (
            <motion.button
              onClick={() => publishMutation.mutate()}
              disabled={!canPublish || publishMutation.isPending}
              whileHover={{ scale: canPublish ? 1.03 : 1 }}
              whileTap={{ scale: canPublish ? 0.97 : 1 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canPublish
                  ? 'linear-gradient(135deg, #4F46E5, #7C3AED)'
                  : '#94A3B8',
                boxShadow: canPublish ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
              }}>
              <Send className="w-4 h-4" />
              {publishMutation.isPending ? 'Publishing…' : 'Publish Batch'}
            </motion.button>
          )}

          {/* Create Baseline */}
          {batch.status === 'PUBLISHED' && (
            existingBaseline ? (
              <span className="text-sm text-emerald-700 font-medium">
                Baseline: {existingBaseline.version_name}
                {existingBaseline.is_active_baseline && ' — active'}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                {baselineError && (
                  <span className="text-xs text-red-600">{baselineError}</span>
                )}
                <input
                  type="text"
                  placeholder="Baseline name…"
                  value={baselineName}
                  onChange={(e) => setBaselineName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-52"
                />
                <motion.button
                  onClick={() => { setBaselineError(null); createBaselineMutation.mutate() }}
                  disabled={!baselineName.trim() || createBaselineMutation.isPending}
                  whileHover={{ scale: baselineName.trim() ? 1.03 : 1 }}
                  whileTap={{ scale: baselineName.trim() ? 0.97 : 1 }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: baselineName.trim()
                      ? 'linear-gradient(135deg, #059669, #047857)'
                      : '#94A3B8',
                    boxShadow: baselineName.trim() ? '0 4px 14px rgba(5,150,105,0.4)' : 'none',
                  }}>
                  <CheckCircle2 className="w-4 h-4" />
                  {createBaselineMutation.isPending ? 'Creating…' : 'Create Baseline'}
                </motion.button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Can't publish hint */}
      {!canPublish && !isLocked && (
        <div className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Publish requires: all 6 batch files present · all validated · no BLOCKED issues.
        </div>
      )}
    </div>
  )
}
