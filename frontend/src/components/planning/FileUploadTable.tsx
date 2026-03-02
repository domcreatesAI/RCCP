import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import FileRow from './FileRow'
import { MasterdataRow, DISPLAY_ORDER } from './MasterdataPanel'
import { validateBatch, resetBatch } from '../../api/batches'
import type { Batch, FileType } from '../../types'

const REQUIRED_FILES: FileType[] = [
  'master_stock',
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
        <span className={`text-sm font-semibold ${requiredPresent === 5 ? 'text-green-600' : 'text-red-600'}`}>
          {requiredPresent}/5 required
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

  const filesByType = Object.fromEntries(
    (batch.files ?? []).map((f) => [f.file_type, f])
  )

  const requiredPresent = REQUIRED_FILES.filter((ft) => filesByType[ft]).length
  const hasBlocked = (batch.files ?? []).some((f) => f.validation_status === 'BLOCKED')
  const canPublish = requiredPresent === 5 && !hasBlocked && batch.status !== 'PUBLISHED'
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="text-sm text-gray-500">
        {batch.status === 'PUBLISHED' ? (
          <span className="text-green-600 font-medium">This batch has been published.</span>
        ) : hasBlocked ? (
          <span className="text-red-600">One or more files have BLOCKED issues — resolve before publishing.</span>
        ) : requiredPresent < 5 ? (
          <span>Upload all files before publishing.</span>
        ) : (
          <span className="text-green-600">All required files present — ready to publish.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Reset batch — two-step confirmation */}
        {hasFiles && batch.status !== 'PUBLISHED' && !resetConfirm && (
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

        {hasFiles && batch.status !== 'PUBLISHED' && (
          <button
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
            className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {validateMutation.isPending ? 'Validating…' : 'Run validation'}
          </button>
        )}
        <button
          disabled={!canPublish}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Publish batch
        </button>
      </div>
    </div>
  )
}
