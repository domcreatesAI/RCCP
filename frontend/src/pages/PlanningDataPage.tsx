import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { listBatches, getBatch } from '../api/batches'
import { listBaselines } from '../api/baselines'
import BatchSelector from '../components/planning/BatchSelector'
import FileUploadTable, { BatchActionBar } from '../components/planning/FileUploadTable'
import ValidationPanel from '../components/planning/ValidationPanel'

export default function PlanningDataPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  // Auto-select the active batch (PUBLISHED preferred, then DRAFT, then most recent)
  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      const active =
        batches.find((b) => b.status === 'PUBLISHED') ??
        batches.find((b) => b.status === 'DRAFT') ??
        batches[0]
      setSelectedBatchId(active.batch_id)
    }
  }, [batches, selectedBatchId])

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', selectedBatchId],
    queryFn: () => getBatch(selectedBatchId!),
    enabled: selectedBatchId !== null,
    refetchInterval: 5000,
  })

  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines'],
    queryFn: listBaselines,
  })
  const batchBaseline = selectedBatchId != null
    ? (baselines.find((b) => b.batch_id === selectedBatchId) ?? null)
    : null

  return (
    <div className="p-6 space-y-5" style={{ color: '#0F172A', minHeight: '100%' }}>
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Planning Data</h1>
        <p className="text-sm mt-0.5 text-gray-500">
          Upload and validate the 6 SAP batch files and 4 masterdata types for each monthly planning cycle, then publish and create a baseline.
        </p>
      </motion.div>

      {/* Batch selector card — includes lifecycle stepper + baseline banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <BatchSelector
        selectedId={selectedBatchId}
        onSelect={setSelectedBatchId}
        activeBatch={batch ?? null}
        baseline={batchBaseline}
      />
      </motion.div>

      {isLoading && (
        <div className="text-sm text-gray-400 py-8 text-center">Loading batch…</div>
      )}

      {!isLoading && !batch && batches.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-gray-500 text-sm">No batches yet. Create your first planning batch to get started.</p>
        </div>
      )}

      {batch && (
        <>
          {/* 3fr/2fr grid — files left, validation right */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid gap-4"
            style={{ gridTemplateColumns: '3fr 2fr' }}>
            <FileUploadTable batch={batch} />
            <ValidationPanel batch={batch} />
          </motion.div>

          {/* Action bar */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <BatchActionBar batch={batch} />
          </motion.div>
        </>
      )}
    </div>
  )
}
