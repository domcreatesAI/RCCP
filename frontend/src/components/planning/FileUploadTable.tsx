import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

  const colHeaders = ['File', 'Status', 'Uploaded by', 'Time', 'Actions']

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Planning data</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload and validate all files for this planning cycle.{' '}
            <span className="font-medium">portfolio_changes</span> accepts an empty file if no changes apply.
          </p>
        </div>
        <span className={`text-sm font-semibold ${requiredPresent === 6 ? 'text-green-600' : 'text-red-600'}`}>
          {requiredPresent}/6 required
        </span>
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

        {/* Required planning files */}
        <tbody>
          {REQUIRED_FILES.map((ft) => (
            <FileRow
              key={ft}
              batchId={batch.batch_id}
              fileType={ft}
              file={filesByType[ft]}
              isLocked={batch.status === 'PUBLISHED' || batch.status === 'ARCHIVED'}
            />
          ))}
        </tbody>

        {/* Masterdata section */}
        <tbody>
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td colSpan={5} className="px-4 py-2">
              <p className="text-xs font-semibold text-gray-500">Masterdata</p>
              <p className="text-xs text-gray-400">
                Update each cycle to ensure the capacity model uses current data.
                BLOCKED issues reject the upload — fix the file and re-upload.
              </p>
            </td>
          </tr>
          {DISPLAY_ORDER.map((mdType) => (
            <MasterdataRow key={mdType} mdType={mdType} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ActionBarProps {
  batch: Batch
}

export function BatchActionBar({ batch }: ActionBarProps) {
  const queryClient = useQueryClient()
  const [resetConfirm, setResetConfirm] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
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
  const requiredPresent = REQUIRED_FILES.filter((ft) => filesByType[ft]).length
  const hasBlocked = (batch.files ?? []).some((f) => f.validation_status === 'BLOCKED')
  const canPublish = requiredPresent === 6 && !hasBlocked && batch.status === 'DRAFT'
  const hasFiles = (batch.files ?? []).length > 0

  const validateMutation = useMutation({
    mutationFn: () => validateBatch(batch.batch_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetBatch(batch.batch_id),
    onSuccess: () => {
      setResetConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => publishBatch(batch.batch_id),
    onSuccess: () => {
      setPublishError(null)
      queryClient.invalidateQueries({ queryKey: ['batch', batch.batch_id] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? 'Publish failed — check server logs'
      setPublishError(msg)
    },
  })

  const createBaselineMutation = useMutation({
    mutationFn: () => createBaseline(batch.batch_id, baselineName),
    onSuccess: () => {
      setBaselineError(null)
      setBaselineName('')
      queryClient.invalidateQueries({ queryKey: ['baselines'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? 'Failed to create baseline'
      setBaselineError(msg)
    },
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Publish row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {isArchived ? (
            <span className="text-gray-400 font-medium">This batch has been archived — read only.</span>
          ) : publishError ? (
            <span className="text-red-600">{publishError}</span>
          ) : batch.status === 'PUBLISHED' ? (
            <span className="text-green-600 font-medium">This batch has been published.</span>
          ) : hasBlocked ? (
            <span className="text-red-600">One or more files have BLOCKED issues — resolve before publishing.</span>
          ) : requiredPresent < 6 ? (
            <span>Upload all 6 required files before publishing.</span>
          ) : (
            <span className="text-green-600">All required files present — ready to publish.</span>
          )}
        </div>
        {!isArchived && (
        <div className="flex items-center gap-2">
          {/* Reset batch — two-step confirmation */}
          {hasFiles && batch.status === 'DRAFT' && !resetConfirm && (
            <button
              onClick={() => setResetConfirm(true)}
              className="px-4 py-2 border border-gray-300 text-gray-500 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
            >
              Reset batch
            </button>
          )}
          {resetConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete all uploaded files?</span>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                disabled={resetMutation.isPending}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {hasFiles && batch.status === 'DRAFT' && (
            <button
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {validateMutation.isPending ? 'Validating…' : 'Run validation'}
            </button>
          )}
          <button
            onClick={() => { setPublishError(null); publishMutation.mutate() }}
            disabled={!canPublish || publishMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {publishMutation.isPending ? 'Publishing…' : 'Publish batch'}
          </button>
        </div>
        )}
      </div>

      {/* Baseline row — only when published */}
      {batch.status === 'PUBLISHED' && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {baselineError ? (
              <span className="text-red-600">{baselineError}</span>
            ) : existingBaseline ? (
              <span className="text-blue-700 font-medium">
                Baseline: {existingBaseline.version_name}
                {existingBaseline.is_active_baseline && ' — active'}
              </span>
            ) : (
              <span>Create a named baseline from this published batch.</span>
            )}
          </div>
          {!existingBaseline && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Baseline name…"
                value={baselineName}
                onChange={(e) => setBaselineName(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
              <button
                onClick={() => { setBaselineError(null); createBaselineMutation.mutate() }}
                disabled={!baselineName.trim() || createBaselineMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {createBaselineMutation.isPending ? 'Creating…' : 'Create baseline'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
