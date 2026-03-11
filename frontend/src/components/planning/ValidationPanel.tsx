import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, Info } from 'lucide-react'
import type { Batch, ValidationStage } from '../../types'

type Severity = 'PASS' | 'WARNING' | 'BLOCKED' | 'INFO'

const STAGE_NAMES: Record<number, string> = {
  1: 'Required File Check',
  2: 'Template Structure Check',
  3: 'Field Mapping Check',
  4: 'Data Type Check',
  5: 'Reference Check',
  6: 'Business Rule Check',
  7: 'Batch Readiness',
  8: 'Cross-File Check',
}

function StatusIcon({ severity }: { severity: Severity }) {
  if (severity === 'PASS')    return <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
  if (severity === 'WARNING') return <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
  if (severity === 'BLOCKED') return <XCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
  return <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    PASS:    'bg-emerald-50 text-emerald-700',
    WARNING: 'bg-amber-50 text-amber-700',
    BLOCKED: 'bg-red-50 text-red-700',
    INFO:    'bg-gray-100 text-gray-500',
  }
  const labels: Record<Severity, string> = {
    PASS: 'Pass', WARNING: 'Warning', BLOCKED: 'Blocked', INFO: 'Info',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${styles[severity]}`}>
      {labels[severity]}
    </span>
  )
}

function expandBorderColor(severity: Severity) {
  if (severity === 'BLOCKED') return '#FECACA'
  if (severity === 'WARNING') return '#FDE68A'
  if (severity === 'PASS')    return '#BBF7D0'
  return '#E2E8F0'
}

function StageRow({ stage, batch, index = 0 }: { stage: ValidationStage; batch: Batch; index?: number }) {
  const [expanded, setExpanded] = useState(false)
  const name = STAGE_NAMES[stage.stage] ?? stage.name
  const severity = stage.severity as Severity

  // Collect top issues from files for this stage (best effort)
  const issueLines: string[] = []
  if (expanded && batch.files) {
    for (const f of batch.files) {
      if (f.top_issues && f.top_issues.length > 0 &&
        (f.validation_status === 'BLOCKED' || f.validation_status === 'WARNING')) {
        issueLines.push(...f.top_issues.map((msg) => `${f.file_type}: ${msg}`))
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + index * 0.05 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors">
        <StatusIcon severity={severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-700">{stage.stage}. {name}</span>
            <SeverityBadge severity={severity} />
          </div>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden">
          <div className="px-5 pb-3 text-xs text-gray-600 leading-relaxed"
            style={{
              borderLeft: `2px solid ${expandBorderColor(severity)}`,
              marginLeft: '28px',
              paddingLeft: '12px',
            }}>
            {issueLines.length > 0
              ? issueLines.slice(0, 5).map((line, i) => <p key={i}>{line}</p>)
              : <p className="text-gray-400 italic">No detailed issues available for this stage.</p>
            }
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  )
}

// Fallback: file-level summary when no validation_stages
function FileSummary({ batch }: { batch: Batch }) {
  return (
    <div className="divide-y divide-gray-100">
      {(batch.files ?? []).map((f) => {
        const sev = (f.validation_status ?? 'INFO') as Severity
        return (
          <div key={f.file_type} className="px-5 py-3 flex items-center gap-3">
            <StatusIcon severity={sev} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono font-semibold text-gray-700">{f.file_type}</span>
            </div>
            <SeverityBadge severity={sev} />
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  batch: Batch
}

export default function ValidationPanel({ batch }: Props) {
  const stages = batch.validation_stages ?? []
  const hasStages = stages.length > 0

  // Overall worst severity
  const worstOrder: Severity[] = ['BLOCKED', 'WARNING', 'INFO', 'PASS']
  const overall: Severity = hasStages
    ? (worstOrder.find((s) => stages.some((st) => st.severity === s)) ?? 'PASS')
    : 'INFO'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"
        style={{ background: 'linear-gradient(to right, #F8FAFC, white)' }}>
        <div>
          <div className="text-sm font-bold text-gray-900">Validation Pipeline</div>
          <div className="text-xs text-gray-500 mt-0.5">7-stage automated check · runs on each file upload</div>
        </div>
        {hasStages && <SeverityBadge severity={overall} />}
      </div>

      {/* Stages or fallback */}
      {hasStages ? (
        <div className="divide-y divide-gray-100">
          {stages.map((stage, i) => (
            <StageRow key={stage.stage} stage={stage} batch={batch} index={i} />
          ))}
        </div>
      ) : (batch.files ?? []).length > 0 ? (
        <FileSummary batch={batch} />
      ) : (
        <div className="px-5 py-8 text-center">
          <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Upload files to run the validation pipeline.</p>
        </div>
      )}
    </div>
  )
}
