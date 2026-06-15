import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { SlidersHorizontal, RefreshCw, AlertCircle, Lock, Pencil, Check, X, Gauge, Database, Plug, AlertTriangle, Tag } from 'lucide-react'
import { listSettings, updateSetting, listLineOee, updateLineOee, listAbcIndicators, updateAbcIndicators, type AppSetting } from '../api/settings'
import { getDbConfig, testDbConfig, updateDbConfig } from '../api/db_config'
import { C } from '../components/rccp/brand'

// Stored value → display string (percent stored as fraction, currency as £/unit).
function displayValue(s: AppSetting): string {
  const n = parseFloat(s.value)
  if (s.type === 'percent') return `${Math.round(n * 100)}%`
  if (s.type === 'currency') return `£${n.toFixed(2)}`
  return s.value
}
// Stored value → number shown in the edit input.
function editValue(s: AppSetting): string {
  const n = parseFloat(s.value)
  if (s.type === 'percent') return String(Math.round(n * 100))
  return String(n)
}
// Edit input (string) → value to store (percent: % → fraction).
function toStored(s: AppSetting, input: string): string {
  const n = parseFloat(input)
  if (Number.isNaN(n)) return input
  if (s.type === 'percent') return String(n / 100)
  return String(n)
}
function inputSuffix(s: AppSetting): string {
  if (s.type === 'percent') return '%'
  if (s.type === 'currency') return s.unit ?? '£/L'
  return s.unit ?? ''
}

function SettingRow({ s, canEdit, onSaved }: { s: AppSetting; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => editValue(s))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true); setErr(null)
    try {
      await updateSetting(s.key, toStored(s, draft))
      setEditing(false)
      onSaved()
    } catch (e) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl px-5 py-4 flex items-start justify-between gap-5" style={{ border: `1px solid ${C.border}` }}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold" style={{ color: C.navy }}>{s.label}</div>
        <p className="text-[12.5px] mt-1 leading-relaxed max-w-[560px]" style={{ color: C.ink2 }}>{s.description}</p>
        <div className="font-mono text-[10.5px] mt-1.5" style={{ color: C.ink4 }}>
          key: {s.key}{(s.min != null || s.max != null) ? ` · range ${s.min}–${s.max}` : ''}
        </div>
      </div>

      <div className="flex-shrink-0 flex flex-col items-end gap-1.5" style={{ minWidth: 160 }}>
        {!editing ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-semibold tabnum" style={{ color: C.navy, letterSpacing: '-0.02em' }}>
              {displayValue(s)}
            </span>
            {canEdit && (
              <button onClick={() => { setDraft(editValue(s)); setEditing(true); setErr(null) }}
                className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-[#F7F7F5]"
                style={{ color: C.ink3, border: `1px solid ${C.border}` }}>
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border2}` }}>
              <input
                autoFocus type="number" value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                className="w-[90px] px-2.5 py-1.5 text-[14px] font-mono text-right focus:outline-none"
                style={{ color: C.ink }}
              />
              <span className="px-2 py-1.5 text-[12px]" style={{ background: '#F7F7F5', color: C.ink3 }}>{inputSuffix(s)}</span>
            </div>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white disabled:opacity-50"
              style={{ background: C.navy }} title="Save">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setEditing(false)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md"
              style={{ border: `1px solid ${C.border}`, color: C.ink3 }} title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {err && <span className="text-[11px]" style={{ color: C.red }}>{err}</span>}
      </div>
    </div>
  )
}

function AbcIndicatorSection({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['abc-indicators'], queryFn: listAbcIndicators })
  const indicators = data?.indicators ?? []

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function startEdit() {
    setSelected(new Set(indicators.filter(i => i.included).map(i => i.code)))
    setEditing(true)
    setErr(null)
  }

  function toggle(code: string) {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(code)) n.delete(code); else n.add(code)
      return n
    })
  }

  async function save() {
    setSaving(true); setErr(null)
    try {
      await updateAbcIndicators([...selected].sort())
      setEditing(false)
      onSaved()
    } catch (e) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6">
      <div className="flex items-center gap-2 mb-2.5">
        <Tag className="w-3.5 h-3.5" style={{ color: C.navy }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>Planning filter</span>
      </div>

      <div className="bg-white rounded-xl px-5 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold" style={{ color: C.navy }}>ABC indicators included in planning</div>
            <p className="text-[12.5px] mt-1 leading-relaxed max-w-[560px]" style={{ color: C.ink2 }}>
              Only SKUs with these ABC indicators contribute to capacity calculations. SKUs with no indicator are always included with a dashboard warning. Change takes effect on the next batch publish.
            </p>
            <div className="font-mono text-[10.5px] mt-1.5" style={{ color: C.ink4 }}>
              key: included_abc_indicators
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            {!editing ? (
              canEdit && (
                <button onClick={startEdit}
                  className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-[#F7F7F5]"
                  style={{ color: C.ink3, border: `1px solid ${C.border}` }}>
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )
            ) : (
              <>
                <button onClick={save} disabled={saving || selected.size === 0}
                  className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                  style={{ background: C.navy }}>
                  {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md"
                  style={{ border: `1px solid ${C.border}`, color: C.ink3 }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          {indicators.map(ind => {
            const isIncluded = editing ? selected.has(ind.code) : ind.included
            return (
              <label
                key={ind.code}
                className="flex items-center gap-3 py-1"
                style={{ cursor: editing ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={isIncluded}
                  disabled={!editing}
                  onChange={() => toggle(ind.code)}
                  className="w-4 h-4 rounded accent-[#AACD00]"
                  style={{ cursor: editing ? 'pointer' : 'default' }}
                />
                <span className="text-[13px]" style={{ color: isIncluded ? C.navy : C.ink3 }}>
                  {ind.label}
                </span>
              </label>
            )
          })}
        </div>

        {editing && selected.size === 0 && (
          <p className="text-[11.5px] mt-2.5" style={{ color: C.red }}>At least one ABC indicator must be included.</p>
        )}
        {err && <p className="text-[11.5px] mt-2" style={{ color: C.red }}>{err}</p>}
      </div>
    </motion.div>
  )
}

function DbConnectionSection() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['db-config'], queryFn: getDbConfig })
  const current = data?.server ?? ''
  const canEdit = data?.can_edit ?? false

  const [draft, setDraft] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    if (current && !draft) setDraft(current)
  }, [current, draft])

  const dirty = draft.trim() !== '' && draft.trim() !== current
  // Save is only enabled after a successful test against the dirty value.
  const canSave = canEdit && dirty && testState === 'ok'

  // Any edit invalidates the previous test
  function onChange(v: string) {
    setDraft(v)
    setTestState('idle')
    setTestMsg(null)
    setSaveErr(null)
  }

  async function runTest() {
    setTestState('testing'); setTestMsg(null); setSaveErr(null)
    try {
      await testDbConfig(draft.trim())
      setTestState('ok')
      setTestMsg('Connection succeeded — Save is now enabled.')
    } catch (e) {
      setTestState('fail')
      setTestMsg((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Test failed')
    }
  }

  async function save() {
    setSaving(true); setSaveErr(null)
    try {
      await updateDbConfig(draft.trim())
      setTestState('idle')
      setTestMsg('Saved. New connections will use the new server immediately.')
      await refetch()
    } catch (e) {
      setSaveErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mt-6">
      <div className="flex items-center gap-2 mb-2.5">
        <Database className="w-3.5 h-3.5" style={{ color: C.navy }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>Database connection</span>
      </div>

      <div className="bg-white rounded-xl px-5 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0 max-w-[560px]">
            <div className="text-[14px] font-semibold" style={{ color: C.navy }}>SQL Server host</div>
            <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: C.ink2 }}>
              The IP or hostname of the SQL Server holding the RCCP database. Change this if IT renumbers the server. The database name, user and password are kept in <span className="font-mono text-[11.5px]">backend/.env</span> — edit those there if they ever change too.
            </p>
            <div className="font-mono text-[10.5px] mt-1.5" style={{ color: C.ink4 }}>
              env key: DB_SERVER · current: {current || '—'}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2" style={{ minWidth: 280 }}>
            {canEdit ? (
              <>
                <div className="flex items-center rounded-lg overflow-hidden w-full" style={{ border: `1px solid ${C.border2}` }}>
                  <input
                    type="text"
                    value={draft}
                    onChange={e => onChange(e.target.value)}
                    placeholder="e.g. 172.17.136.4"
                    className="flex-1 px-3 py-1.5 text-[13px] font-mono focus:outline-none"
                    style={{ color: C.ink }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runTest}
                    disabled={!dirty || testState === 'testing'}
                    className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                    style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
                  >
                    {testState === 'testing'
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <Plug className="w-3 h-3" />}
                    {testState === 'testing' ? 'Testing…' : 'Test connection'}
                  </button>
                  <button
                    onClick={save}
                    disabled={!canSave || saving}
                    className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                    style={{ background: C.navy }}
                  >
                    {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <span className="font-mono text-[13px] font-semibold" style={{ color: C.navy }}>{current || '—'}</span>
            )}
            {testState === 'ok' && testMsg && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: C.limeDeep }}>
                <Check className="w-3 h-3" /> {testMsg}
              </span>
            )}
            {testState === 'fail' && testMsg && (
              <span className="text-[11px] flex items-start gap-1 max-w-[280px]" style={{ color: C.red }}>
                <X className="w-3 h-3 mt-px flex-shrink-0" /> <span className="break-words">{testMsg}</span>
              </span>
            )}
            {saveErr && <span className="text-[11px]" style={{ color: C.red }}>{saveErr}</span>}
          </div>
        </div>

        {canEdit && (
          <div
            className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{ background: C.amberLight, border: `1px solid #FCD34D` }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" style={{ color: C.amber }} />
            <p className="text-[11.5px]" style={{ color: C.amber }}>
              You must <strong>Test connection</strong> before Save is enabled. Saving a bad host locks the app out until <span className="font-mono text-[11px]">backend/.env</span> is edited on the server directly.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function LineOeeSection({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['line-oee'], queryFn: listLineOee })
  const lines = data?.lines ?? []
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [bulkVal, setBulkVal] = useState('')

  const stored = (code: string) => {
    const l = lines.find(x => x.line_code === code)
    return l?.oee_target != null ? String(Math.round(l.oee_target * 100)) : ''
  }

  useEffect(() => {
    const d: Record<string, string> = {}
    for (const l of lines) d[l.line_code] = l.oee_target != null ? String(Math.round(l.oee_target * 100)) : ''
    setDrafts(d)
  }, [data]) // re-seed after each load / refetch

  const dirty = lines.some(l => (drafts[l.line_code] ?? '') !== stored(l.line_code))

  async function saveAll() {
    setSaving(true); setErr(null)
    try {
      for (const l of lines) {
        const d = (drafts[l.line_code] ?? '').trim()
        if (d !== stored(l.line_code) && d !== '') {
          await updateLineOee(l.line_code, String(Number(d) / 100))
        }
      }
      onSaved()
    } catch (e) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function applyAll() {
    if (!bulkVal.trim()) return
    setDrafts(Object.fromEntries(lines.map(l => [l.line_code, bulkVal.trim()])))
  }

  if (isLoading) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>
          <Gauge className="w-3.5 h-3.5" style={{ color: C.navy }} /> Line OEE
        </span>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: C.ink4 }}>Set all</span>
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border2}` }}>
              <input type="number" value={bulkVal} onChange={e => setBulkVal(e.target.value)}
                className="w-[52px] px-2 py-1 text-[12px] font-mono text-right focus:outline-none" style={{ color: C.ink }} />
              <span className="px-1.5 py-1 text-[11px]" style={{ background: '#F7F7F5', color: C.ink3 }}>%</span>
            </div>
            <button onClick={applyAll} disabled={!bulkVal.trim()}
              className="text-[12px] px-2.5 py-1.5 rounded-lg disabled:opacity-40"
              style={{ border: `1px solid ${C.border}`, color: C.ink2 }}>Apply</button>
            <button onClick={saveAll} disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
              style={{ background: C.navy }}>
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl px-5 py-4" style={{ border: `1px solid ${C.border}` }}>
        <p className="text-[12.5px] mb-3" style={{ color: C.ink2 }}>
          OEE per line — the single source of truth for OEE; drives each line's capacity in every calculation. Use "Set all" to apply one value across every line, then Save.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8">
          {lines.map(l => {
            const changed = (drafts[l.line_code] ?? '') !== stored(l.line_code)
            return (
              <div key={l.line_code} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                <span>
                  <span className="font-semibold" style={{ color: C.navy }}>{l.line_code}</span>
                  <span className="text-[11px] ml-2" style={{ color: C.ink4 }}>{l.plant_code}</span>
                </span>
                {canEdit ? (
                  <span className="inline-flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${changed ? C.navy : C.border2}` }}>
                    <input type="number" value={drafts[l.line_code] ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [l.line_code]: e.target.value }))}
                      className="w-[54px] px-2 py-1 text-[13px] font-mono text-right focus:outline-none" style={{ color: C.ink }} />
                    <span className="px-1.5 py-1 text-[11px]" style={{ background: '#F7F7F5', color: C.ink3 }}>%</span>
                  </span>
                ) : (
                  <span className="font-mono text-[13px] font-semibold" style={{ color: C.navy }}>
                    {l.oee_target != null ? `${Math.round(l.oee_target * 100)}%` : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {err && <p className="text-[11.5px] mt-2" style={{ color: C.red }}>{err}</p>}
      </div>
    </motion.div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['settings'], queryFn: listSettings })

  const settings = data?.settings ?? []
  const canEdit = data?.can_edit ?? false
  const groups = [...new Set(settings.map(s => s.group))]

  function onSaved() {
    qc.invalidateQueries({ queryKey: ['settings'] })
    qc.invalidateQueries({ queryKey: ['line-oee'] })
    qc.invalidateQueries({ queryKey: ['abc-indicators'] })
    // Settings feed the engine — refresh dashboards too.
    qc.invalidateQueries({ queryKey: ['rccp-dashboard'] })
  }

  return (
    <div className="px-7 py-6 pb-16" style={{ color: C.ink }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-semibold flex items-center gap-3" style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          <span className="inline-block rounded" style={{ width: 5, height: 30, background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`, boxShadow: '0 0 10px rgba(170,205,0,0.4)' }} />
          Settings
        </h1>
        <p className="mt-2 text-[13.5px] max-w-[680px] leading-relaxed" style={{ color: C.ink2 }}>
          Stable parameters used across every calculation — maintained here rather than hard-coded.
          {!isLoading && (canEdit
            ? <span className="ml-1" style={{ color: C.limeDeep }}>You can edit these.</span>
            : <span className="ml-1 inline-flex items-center gap-1" style={{ color: C.ink3 }}><Lock className="w-3 h-3" /> View only — admins can change values.</span>)}
        </p>
      </motion.div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} /> Loading settings…
          </div>
        </div>
      )}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>{String(error)}</p>
        </div>
      )}

      {!isLoading && !error && groups.map((g, gi) => {
        const rowSettings = settings.filter(s => s.group === g && s.type !== 'abc_multiselect')
        if (rowSettings.length === 0) return null
        return (
          <motion.div key={g}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + gi * 0.05 }}
            className="mt-6"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: C.navy }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>{g}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {rowSettings.map(s => (
                <SettingRow key={s.key} s={s} canEdit={canEdit} onSaved={onSaved} />
              ))}
            </div>
          </motion.div>
        )
      })}

      {!isLoading && !error && <AbcIndicatorSection canEdit={canEdit} onSaved={onSaved} />}
      {!isLoading && !error && <LineOeeSection canEdit={canEdit} onSaved={onSaved} />}

      {!isLoading && !error && <DbConnectionSection />}

      <p className="text-[11.5px] mt-8" style={{ color: C.ink4 }}>
        Changes apply to new calculations immediately — reopen a dashboard to see them reflected. More parameters
        (standard minutes/day, OEE ceiling, cost multipliers, labour rates) can be moved here over time.
      </p>
    </div>
  )
}
