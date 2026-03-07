import { Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bell, HelpCircle } from 'lucide-react'
import Sidebar from './Sidebar'
import { listBatches } from '../../api/batches'
import { useAuth } from '../../contexts/AuthContext'
import type { Batch } from '../../types'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Planning Data',
  '/planning-data': 'Planning Data',
  '/rccp-dashboard': 'RCCP Dashboard',
  '/scenarios': 'Scenarios',
  '/executive-summary': 'Executive Summary',
  '/configuration': 'Config & Masterdata',
}

const STATUS_PILL: Record<string, string> = {
  PUBLISHED: 'bg-green-50 text-green-700',
  DRAFT: 'bg-amber-50 text-amber-700',
  VALIDATING: 'bg-blue-50 text-blue-700',
  VALIDATED: 'bg-blue-50 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

function getActiveBatch(batches: Batch[]): Batch | null {
  if (!batches.length) return null
  return (
    batches.find((b) => b.status === 'PUBLISHED') ??
    batches.find((b) => b.status === 'DRAFT') ??
    batches[0]
  )
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function AppShell() {
  const location = useLocation()
  const { user } = useAuth()
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'RCCP One'

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
    staleTime: 60_000,
  })

  const activeBatch = getActiveBatch(batches)

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFBFC]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 h-16 flex items-center px-7 flex-shrink-0 z-10 shadow-sm">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-gray-400 font-medium">RCCP One</span>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900">{pageTitle}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Cycle badge */}
            {activeBatch && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                <span className="text-[11px] text-gray-500 font-medium">Cycle:</span>
                <span className="text-[13px] font-bold text-gray-900">{activeBatch.batch_name}</span>
                <div className="w-px h-4 bg-gray-200" />
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${STATUS_PILL[activeBatch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {activeBatch.status.charAt(0) + activeBatch.status.slice(1).toLowerCase()}
                </span>
              </div>
            )}

            {/* Bell */}
            <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors group">
              <Bell className="w-[18px] h-[18px] text-gray-500 group-hover:text-gray-700 transition-colors" strokeWidth={2} />
            </button>

            {/* Help */}
            <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors group">
              <HelpCircle className="w-[18px] h-[18px] text-gray-500 group-hover:text-gray-700 transition-colors" strokeWidth={2} />
            </button>

            {/* User avatar */}
            {user && (
              <div className="relative ml-1">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shadow-sm ring-2 ring-white">
                  <span className="text-sm font-bold text-indigo-700">{initials(user.username)}</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
              </div>
            )}
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
