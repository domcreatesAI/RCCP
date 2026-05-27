import { Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bell, HelpCircle } from 'lucide-react'
import Sidebar from './Sidebar'
import { listBatches } from '../../api/batches'
import type { Batch } from '../../types'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Planning Data',
  '/executive-summary': 'Executive Summary',
  '/scenarios': 'Scenarios',
  '/exports': 'Batch Exports',
}

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  PUBLISHED:  { bg: 'bg-[#F0F7CC]', text: 'text-[#7B9400]' },
  DRAFT:      { bg: 'bg-amber-50',  text: 'text-amber-700' },
  VALIDATING: { bg: 'bg-[#E8EEF3]', text: 'text-[#0C3C5D]' },
  VALIDATED:  { bg: 'bg-[#E8EEF3]', text: 'text-[#0C3C5D]' },
  ARCHIVED:   { bg: 'bg-gray-100',  text: 'text-gray-500' },
}

function getActiveBatch(batches: Batch[]): Batch | null {
  if (!batches.length) return null
  return (
    batches.find((b) => b.status === 'PUBLISHED') ??
    batches.find((b) => b.status === 'DRAFT') ??
    batches[0]
  )
}

export default function AppShell() {
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'RCCP One'

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
    staleTime: 60_000,
  })

  const activeBatch = getActiveBatch(batches)
  const pill = activeBatch ? STATUS_PILL[activeBatch.status] : null

  return (
    <div
      className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible"
      style={{ background: '#F7F7F5' }}
    >
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* Topbar */}
        <header
          className="bg-white/85 backdrop-blur-xl h-14 flex items-center px-7 flex-shrink-0 z-10"
          style={{ borderBottom: '1px solid #E2E6EA' }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-[#6B7A8A] font-medium">RCCP One</span>
            <span className="text-[#9CABB9]">/</span>
            <span className="font-semibold" style={{ color: '#0C3C5D' }}>
              {pageTitle}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Cycle badge */}
            {activeBatch && pill && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white"
                style={{ border: '1px solid #E2E6EA' }}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    background: '#AACD00',
                    boxShadow: '0 0 0 3px rgba(170,205,0,0.18)',
                  }}
                />
                <span className="text-[11px] text-[#6B7A8A] font-medium">Cycle:</span>
                <span className="text-[12.5px] font-semibold font-mono" style={{ color: '#0C3C5D' }}>
                  {activeBatch.batch_name}
                </span>
                <span className="w-px h-3.5 bg-[#E2E6EA]" />
                <span
                  className={`text-[10.5px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${pill.bg} ${pill.text}`}
                >
                  {activeBatch.status}
                </span>
              </div>
            )}

            <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#E8EEF3] transition-colors group">
              <Bell className="w-[16px] h-[16px] text-[#6B7A8A] group-hover:text-[#0C3C5D] transition-colors" strokeWidth={1.8} />
            </button>

            <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#E8EEF3] transition-colors group">
              <HelpCircle className="w-[16px] h-[16px] text-[#6B7A8A] group-hover:text-[#0C3C5D] transition-colors" strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
