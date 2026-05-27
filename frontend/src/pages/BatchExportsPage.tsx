import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { FileSpreadsheet, RefreshCw, AlertCircle, Calendar } from 'lucide-react'
import { listBatches } from '../api/batches'
import { downloadVerificationExcel } from '../api/rccp'
import { C } from '../components/rccp/brand'
import type { Batch } from '../types'

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  PUBLISHED:  { bg: C.limeTint,   text: C.limeDeep },
  ARCHIVED:   { bg: '#F1F2F4',    text: C.ink3 },
  DRAFT:      { bg: C.amberLight, text: C.amber },
  VALIDATED:  { bg: C.navyTint,   text: C.navy },
  VALIDATING: { bg: C.navyTint,   text: C.navy },
}

// The verification workbook needs the engine, which serves published + archived cycles.
const EXPORTABLE = new Set(['PUBLISHED', 'ARCHIVED'])

function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export default function BatchExportsPage() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const { data: batches = [], isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  // Most recent cycle first, then newest record.
  const sorted = [...batches].sort((a, b) => {
    const byCycle = b.plan_cycle_date.localeCompare(a.plan_cycle_date)
    return byCycle !== 0 ? byCycle : b.created_at.localeCompare(a.created_at)
  })

  async function handleDownload(batch: Batch) {
    setDownloadingId(batch.batch_id)
    try {
      await downloadVerificationExcel(batch.batch_id)
    } catch (e) {
      console.error('Verification download failed', e)
      alert('Could not generate the verification Excel for this batch.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="px-7 py-6 pb-16" style={{ color: C.ink }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-semibold flex items-center gap-3" style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              <span className="inline-block rounded" style={{ width: 5, height: 30, background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`, boxShadow: '0 0 10px rgba(170,205,0,0.4)' }} />
              Batch Exports
            </h1>
            <p className="mt-2 text-[13.5px] max-w-[640px] leading-relaxed" style={{ color: C.ink2 }}>
              Every planning cycle. Download the <strong style={{ color: C.navy, fontWeight: 600 }}>S&amp;OP verification workbook</strong> (Capacity vs Volumes) for any published or archived batch.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
            style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </motion.div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} />
            Loading batches…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>
            {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(error)}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && sorted.length === 0 && (
        <div className="mt-6 px-5 py-10 rounded-2xl text-center" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <p className="text-[14px] font-semibold" style={{ color: C.navy }}>No batches yet</p>
          <p className="text-[12.5px] mt-1" style={{ color: C.ink3 }}>Create and publish a planning batch on the Planning Data page.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && sorted.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="bg-white rounded-2xl px-5 py-4 mt-6"
          style={{ border: `1px solid ${C.border}` }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Batch', 'Plan cycle', 'Status', 'Published', 'Created by', 'Export'].map((h, i) => (
                  <th key={h}
                    className="text-[11px] font-semibold uppercase tracking-wider pb-2.5 pr-4"
                    style={{ color: C.ink3, textAlign: i === 5 ? 'right' : 'left' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(b => {
                const pill = STATUS_PILL[b.status] ?? { bg: '#F1F2F4', text: C.ink3 }
                const canExport = EXPORTABLE.has(b.status)
                const busy = downloadingId === b.batch_id
                return (
                  <tr key={b.batch_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-3 pr-4">
                      <span className="font-semibold" style={{ color: C.navy }}>{b.batch_name}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px]" style={{ color: C.ink2 }}>
                        <Calendar className="w-3 h-3" style={{ color: C.ink4 }} />
                        {fmtMonth(b.plan_cycle_date)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-semibold uppercase tracking-wider" style={{ background: pill.bg, color: pill.text }}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-[12.5px]" style={{ color: C.ink2 }}>{fmtDate(b.published_at)}</td>
                    <td className="py-3 pr-4 text-[12.5px]" style={{ color: C.ink3 }}>{b.created_by ?? '—'}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleDownload(b)}
                        disabled={!canExport || busy}
                        title={canExport ? 'Download S&OP verification workbook' : 'Available once the batch is published'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={canExport
                          ? { background: C.navy, color: '#fff' }
                          : { background: '#fff', color: C.ink4, border: `1px solid ${C.border}` }}
                      >
                        <FileSpreadsheet className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} />
                        {busy ? 'Preparing…' : 'Excel'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p className="text-[11.5px] mt-3" style={{ color: C.ink4 }}>
            Workbook covers the rolling 12-month forward horizon plus 3 months of past actuals, per line.
            Draft / validating batches export once published.
          </p>
        </motion.div>
      )}
    </div>
  )
}
