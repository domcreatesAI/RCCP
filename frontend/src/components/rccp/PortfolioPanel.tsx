import { ArrowUpRight, ArrowDownRight, RefreshCw, Package } from 'lucide-react'
import type { RCCPPortfolioChange } from '../../types'
import { C, monthLabel } from './brand'

function effLabel(c: RCCPPortfolioChange): string {
  return c.effective_period ? monthLabel(c.effective_period) : (c.effective_date ?? '—')
}

function Row({ c, kind }: { c: RCCPPortfolioChange; kind: 'in' | 'out' | 'other' }) {
  const Icon = kind === 'in' ? ArrowUpRight : kind === 'out' ? ArrowDownRight : RefreshCw
  const iconColor = kind === 'in' ? C.limeDeep : C.ink3
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
      <span className="flex-shrink-0 inline-flex items-center justify-center rounded-md mt-0.5"
        style={{ width: 24, height: 24, background: kind === 'in' ? C.limeTint : '#F1F2F4', color: iconColor }}>
        <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[13.5px]">
            <span className="font-semibold" style={{ color: C.navy }}>{c.item_code ?? '—'}</span>
            <span className="text-[11.5px] ml-2" style={{ color: C.ink3 }}>{effLabel(c)}</span>
            {c.line_code && (
              <span className="ml-2 inline-block font-mono text-[11px] px-1.5 py-px rounded"
                style={{ background: C.navyTint, color: C.navy }}>{c.line_code}</span>
            )}
          </span>
          {kind === 'other' && (
            <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: C.ink3 }}>{c.change_type.replace('_', ' ')}</span>
          )}
        </div>
        {(c.description || c.impact_notes) && (
          <p className="text-[11.5px] mt-0.5" style={{ color: C.ink3 }}>
            {[c.description, c.impact_notes].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

export default function PortfolioPanel({ changes }: { changes: RCCPPortfolioChange[] }) {
  const intros = changes.filter(c => c.change_type === 'NEW_LAUNCH')
  const outs = changes.filter(c => c.change_type === 'DISCONTINUE')
  const others = changes.filter(c => c.change_type !== 'NEW_LAUNCH' && c.change_type !== 'DISCONTINUE')

  return (
    <div className="bg-white rounded-2xl px-5 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            Portfolio changes
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            {changes.length === 0
              ? 'SKUs entering or leaving the portfolio this cycle'
              : `${intros.length} introduced · ${outs.length} phased out${others.length ? ` · ${others.length} other` : ''} · launch volumes flow via S&OP demand`}
          </p>
        </div>
      </div>

      {changes.length === 0 ? (
        <div className="flex items-center gap-3 py-6 px-4 rounded-xl" style={{ background: '#FAFAF9', border: `1px dashed ${C.border2}` }}>
          <Package className="w-5 h-5" style={{ color: C.ink4 }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: C.navy }}>No portfolio changes this cycle</p>
            <p className="text-[12px] mt-0.5" style={{ color: C.ink3 }}>No SKUs introduced or phased out.</p>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.limeDeep }}>Introductions</p>
            {intros.length === 0
              ? <p className="text-[12px] py-2.5" style={{ color: C.ink4 }}>None.</p>
              : intros.map((c, i) => <Row key={`in${i}`} c={c} kind="in" />)}
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.ink3 }}>Phase-outs</p>
            {outs.length === 0
              ? <p className="text-[12px] py-2.5" style={{ color: C.ink4 }}>None.</p>
              : outs.map((c, i) => <Row key={`out${i}`} c={c} kind="out" />)}
            {others.length > 0 && (
              <>
                <p className="text-[10.5px] font-semibold uppercase tracking-widest mb-1 mt-3" style={{ color: C.ink3 }}>Other changes</p>
                {others.map((c, i) => <Row key={`oth${i}`} c={c} kind="other" />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
