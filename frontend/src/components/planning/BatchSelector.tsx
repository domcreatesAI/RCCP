import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import {
  Calendar, ChevronDown, Plus, Check, X, Info, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { listBatches, createBatch } from '../../api/batches'
import type { Batch, Baseline } from '../../types'

const STATUS_DOT: Record<string, string> = {
  DRAFT:     'bg-amber-400',
  VALIDATING:'bg-blue-400',
  VALIDATED: 'bg-blue-500',
  PUBLISHED: 'bg-emerald-500',
  ARCHIVED:  'bg-gray-300',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:     'bg-amber-50 text-amber-700 border-amber-200',
  VALIDATING:'bg-blue-50 text-blue-700 border-blue-200',
  VALIDATED: 'bg-blue-50 text-blue-700 border-blue-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ARCHIVED:  'bg-gray-100 text-gray-500 border-gray-200',
}

const LIFECYCLE: { key: string; label: string }[] = [
  { key: 'DRAFT',     label: 'Draft' },
  { key: 'VALIDATED', label: 'Validated' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'ARCHIVED',  label: 'Archived' },
]

const STATUS_ORDER = ['DRAFT', 'VALIDATING', 'VALIDATED', 'PUBLISHED', 'ARCHIVED']

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  activeBatch: Batch | null
  baseline: Baseline | null
}

function NewBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [month, setMonth] = useState('')
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const cycleDate = month + '-01'
      return createBatch(name, cycleDate)
    },
    onSuccess: (batch: Batch) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success(`Batch "${batch.batch_name}" created`, {
        description: `Plan cycle: ${new Date(batch.plan_cycle_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
      })
      onCreated(batch.batch_id)
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to create batch')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Batch name is required'); return }
    if (!month) { setError('Plan cycle month is required'); return }
    createMutation.mutate()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)' }}>
          <div>
            <div className="text-sm font-bold text-gray-900">Create New Batch</div>
            <div className="text-xs text-gray-500 mt-0.5">Set the name and plan cycle date (must be 1st of month)</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/70 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Batch Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. March 2026 Plan"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all border border-gray-200 bg-[#F8FAFC] text-slate-700
                  focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Plan Cycle Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all border border-gray-200 bg-[#F8FAFC] text-slate-700
                  focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-1">Cycle date will be set to the 1st of the selected month.</p>
            </div>
            <div className="rounded-xl p-3 flex items-start gap-2 bg-indigo-50 border border-indigo-200">
              <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-800">
                Creating a new batch does not affect the currently PUBLISHED batch. Upload all 6 SAP files before publishing.
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-gray-50">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">
              Cancel
            </button>
            <motion.button type="submit" disabled={createMutation.isPending}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              <Plus className="w-4 h-4" />
              {createMutation.isPending ? 'Creating…' : 'Create Batch'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default function BatchSelector({ selectedId, onSelect, activeBatch, baseline }: Props) {
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const visibleBatches = batches.filter((b) => b.status !== 'ARCHIVED').concat(
    batches.filter((b) => b.status === 'ARCHIVED')
  )

  // Lifecycle stepper
  const currentStatusIdx = activeBatch
    ? STATUS_ORDER.indexOf(activeBatch.status === 'VALIDATING' ? 'VALIDATED' : activeBatch.status)
    : 0
  const lifecycleIdx = LIFECYCLE.findIndex((s) => {
    if (!activeBatch) return false
    if (activeBatch.status === 'VALIDATING') return s.key === 'VALIDATED'
    return s.key === activeBatch.status
  })

  const cycleDisplay = activeBatch
    ? new Date(activeBatch.plan_cycle_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <>
      <AnimatePresence>
        {showModal && (
          <NewBatchModal
            onClose={() => setShowModal(false)}
            onCreated={(id) => onSelect(id)}
          />
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-visible"
        style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">

            {/* Batch dropdown */}
            <div className="flex-1 min-w-0" ref={dropdownRef}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Active Planning Batch
              </div>
              <div className="relative">
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left"
                  style={{
                    borderColor: open ? '#6366F1' : '#E2E8F0',
                    backgroundColor: open ? '#EEF2FF' : '#F8FAFC',
                    boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  }}>
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {activeBatch ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-gray-900">{activeBatch.batch_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_BADGE[activeBatch.status] ?? ''}`}>
                            {activeBatch.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Cycle: {cycleDisplay}
                          {activeBatch.created_by && ` · Created by ${activeBatch.created_by}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">No batch selected</span>
                    )}
                  </div>
                  <ChevronDown
                    className="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20">
                    {visibleBatches.map((b) => (
                      <button key={b.batch_id}
                        onClick={() => { onSelect(b.batch_id); setOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-0 border-gray-100 hover:bg-gray-50"
                        style={{ backgroundColor: b.batch_id === selectedId ? '#EEF2FF' : 'transparent' }}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[b.status] ?? 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{b.batch_name}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(b.plan_cycle_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}{b.status}
                          </div>
                        </div>
                        {b.batch_id === selectedId && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    ))}
                    <button
                      onClick={() => { setOpen(false); setShowModal(true) }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors bg-gray-50 hover:bg-gray-100 border-t border-gray-200">
                      <Plus className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-semibold text-indigo-600">Create New Batch…</span>
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </div>

            {/* Lifecycle stepper */}
            {activeBatch && (
              <div className="shrink-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Lifecycle</div>
                <div className="flex items-center gap-1">
                  {LIFECYCLE.map((step, i) => {
                    const isDone = i < lifecycleIdx
                    const isCurrent = i === lifecycleIdx
                    return (
                      <div key={step.key} className="flex items-center gap-1">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              backgroundColor: isDone ? '#22C55E' : isCurrent ? '#6366F1' : '#F1F5F9',
                              color: isDone || isCurrent ? '#FFF' : '#94A3B8',
                            }}>
                            {isDone ? '✓' : i + 1}
                          </div>
                          <div className="text-center mt-0.5"
                            style={{ color: isCurrent ? '#6366F1' : isDone ? '#22C55E' : '#94A3B8', fontSize: 9 }}>
                            <span className="font-semibold whitespace-nowrap">{step.label}</span>
                          </div>
                        </div>
                        {i < LIFECYCLE.length - 1 && (
                          <div className="w-6 h-0.5 mb-3 rounded-full"
                            style={{ backgroundColor: isDone ? '#22C55E' : '#F1F5F9' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* New Batch button */}
            <div className="shrink-0">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 opacity-0">—</div>
              <motion.button
                onClick={() => setShowModal(true)}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', borderColor: '#DDD6FE' }}>
                <Plus className="w-3.5 h-3.5" /> New Batch
              </motion.button>
            </div>
          </div>

          {/* Baseline banner */}
          {activeBatch?.status === 'PUBLISHED' && baseline && (
            <div className="mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 border bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-800">
                <strong>Active Baseline:</strong> {baseline.version_name}
                {baseline.is_active_baseline && ' — active'}
                {baseline.created_by && ` · Created by ${baseline.created_by}`}
              </div>
            </div>
          )}
          {activeBatch?.status === 'PUBLISHED' && !baseline && (
            <div className="mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 border bg-amber-50 border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs text-amber-800">
                Batch is PUBLISHED — no baseline created yet. Create a baseline below to lock this cycle as an audit record.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
