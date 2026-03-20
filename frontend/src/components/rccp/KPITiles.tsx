import { motion } from 'motion/react'
import { AlertTriangle, Activity, TrendingDown, Zap } from 'lucide-react'
import type { RCCPKPIs, UnitMode, Granularity } from '../../types'

interface Props {
  kpis: RCCPKPIs
  unitMode: UnitMode
  watchLines: number
  granularity: Granularity
  periodLabel: string   // e.g. "3M", "12W"
}

function shortPeriod(p: string | null): string {
  if (!p) return ''
  if (p.includes('W')) {
    const [year, week] = p.split('-W')
    return `W${week} '${year.slice(2)}`
  }
  const [year, month] = p.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(month) - 1]} '${year.slice(2)}`
}

function fmtGap(val: number | null, suffix: string): string {
  if (val === null) return '—'
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M ${suffix}`
  if (abs >= 1_000)     return `${(val / 1_000).toFixed(1)}k ${suffix}`
  return `${Math.round(val)} ${suffix}`
}

interface TileConfig {
  index: number
  icon: React.ElementType
  badgeColor: string
  label: string
  value: React.ReactNode
  sub?: string
  critical?: boolean
}

function Tile({ index, icon: Icon, badgeColor, label, value, sub, critical }: TileConfig) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      className={`relative overflow-hidden rounded-2xl border ${
        critical ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
      } px-5 py-5`}
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}
    >
      {/* Circular badge icon */}
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center mb-3 shadow-sm"
        style={{ backgroundColor: badgeColor }}>
        <Icon className="w-5 h-5 text-white" />
      </div>

      <p className={`text-3xl font-black tabular-nums leading-none ${
        critical ? 'text-red-600' : 'text-gray-900'
      }`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-1.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
    </motion.div>
  )
}

export default function KPITiles({ kpis, unitMode, watchLines, granularity, periodLabel }: Props) {
  const gapVal    = unitMode === 'h' ? kpis.total_gap_hours    : kpis.total_gap_litres
  const gapSuffix = unitMode === 'h' ? 'h' : 'L'
  const gapFormatted = fmtGap(gapVal, gapSuffix)
  const isOverloaded = gapVal !== null && gapVal < 0

  const peakBucket = granularity === 'weekly' ? 'week' : 'month'
  const peakStr = kpis.peak_util_pct !== null && kpis.peak_util_period
    ? `Peak ${peakBucket} ${shortPeriod(kpis.peak_util_period)} ${kpis.peak_util_pct}%`
    : kpis.overall_utilisation_pct !== null
      ? `Average across all lines`
      : undefined

  const tiles: Omit<TileConfig, 'index'>[] = [
    {
      icon: AlertTriangle,
      badgeColor: '#EF4444',
      label: 'Critical Lines',
      value: kpis.critical_lines,
      sub: `${kpis.high_lines} high risk, ${watchLines} watch`,
      critical: kpis.critical_lines > 0,
    },
    {
      icon: Activity,
      badgeColor: '#7C3AED',
      label: 'Overall Utilisation',
      value: kpis.overall_utilisation_pct !== null ? `${kpis.overall_utilisation_pct}%` : '—',
      sub: peakStr,
    },
    {
      icon: TrendingDown,
      badgeColor: '#EA580C',
      label: granularity === 'weekly' ? `Weekly Shortfall (${periodLabel})` : `Total Gap (${periodLabel})`,
      value: gapFormatted,
      sub: isOverloaded
        ? granularity === 'weekly'
          ? `Sum of deficit weeks · higher than monthly due to within-month peaks`
          : `Effective ${unitMode === 'h' ? 'hours' : 'litres'} deficit across overloaded lines`
        : `Available headroom across all lines`,
      critical: isOverloaded,
    },
    {
      icon: Zap,
      badgeColor: '#7C3AED',
      label: 'OEE Baseline',
      value: '55%',
      sub: 'Configurable per line · target uplift in Scenarios',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {tiles.map((t, i) => (
        <Tile key={t.label} index={i} {...t} />
      ))}
    </div>
  )
}
