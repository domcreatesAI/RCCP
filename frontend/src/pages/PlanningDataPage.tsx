import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listBatches, getBatch } from '../api/batches'
import BatchSelector from '../components/planning/BatchSelector'
import BatchHeader from '../components/planning/BatchHeader'
import FileUploadTable, { BatchActionBar } from '../components/planning/FileUploadTable'

export default function PlanningDataPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)

  // Load batch list to set default selection
  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  // Auto-select the most recent batch
  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      setSelectedBatchId(batches[0].batch_id)
    }
  }, [batches, selectedBatchId])

  // Load selected batch detail (includes files)
  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', selectedBatchId],
    queryFn: () => getBatch(selectedBatchId!),
    enabled: selectedBatchId !== null,
    refetchInterval: 5000, // poll every 5s while validation might be running
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Planning Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload and validate planning cycle files, publish the batch, and create a baseline for RCCP.
        </p>
      </div>

      {/* Batch selector */}
      <div className="mb-4">
        <BatchSelector selectedId={selectedBatchId} onSelect={setSelectedBatchId} />
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400 py-8 text-center">Loading batch…</div>
      )}

      {!isLoading && !batch && batches.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">No batches yet. Create your first planning batch to get started.</p>
        </div>
      )}

      {batch && (
        <>
          <div className="mb-4">
            <BatchHeader batch={batch} />
          </div>
          <FileUploadTable batch={batch} />
        </>
      )}

      {/* Action bar — at the bottom */}
      {batch && (
        <div className="mt-6">
          <BatchActionBar batch={batch} />
        </div>
      )}
    </div>
  )
}
