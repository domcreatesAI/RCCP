import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listBatches, createBatch } from '../../api/batches'
import type { Batch } from '../../types'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function BatchSelector({ selectedId, onSelect }: Props) {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [cycleDate, setCycleDate] = useState('')
  const [formError, setFormError] = useState('')

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  const createMutation = useMutation({
    mutationFn: () => createBatch(name, cycleDate),
    onSuccess: (batch: Batch) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      onSelect(batch.batch_id)
      setShowModal(false)
      setName('')
      setCycleDate('')
      setFormError('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create batch'
      setFormError(msg)
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const day = new Date(cycleDate).getUTCDate()
    if (day !== 1) {
      setFormError('Plan cycle date must be the 1st of the month')
      return
    }
    createMutation.mutate()
  }

  const selected = batches.find((b) => b.batch_id === selectedId)

  return (
    <>
      <div className="flex items-center gap-3">
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-64"
        >
          {batches.length === 0 && <option value="">No batches yet</option>}
          {batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.batch_name} — {b.plan_cycle_date}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          + New batch
        </button>
      </div>

      {/* New batch modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New planning batch</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. March 2026 Plan"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan cycle date <span className="text-gray-400">(must be 1st of month)</span>
                </label>
                <input
                  type="date"
                  value={cycleDate}
                  onChange={(e) => setCycleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setFormError('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
