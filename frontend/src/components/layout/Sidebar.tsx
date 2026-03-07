import { NavLink } from 'react-router'
import {
  Activity, Upload, BarChart2, GitBranch, FileText, SlidersHorizontal, LogOut,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface NavItem {
  label: string
  path?: string
  phase?: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { label: 'Planning Data',       path: '/',    icon: Upload },
  { label: 'RCCP Dashboard',      phase: 'Phase 2', icon: BarChart2 },
  { label: 'Scenarios',           phase: 'Phase 2', icon: GitBranch },
  { label: 'Executive Summary',   phase: 'Phase 2', icon: FileText },
  { label: 'Config & Masterdata', phase: 'Phase 5', icon: SlidersHorizontal },
]

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col bg-gradient-to-b from-[#0F172A] to-[#1E293B] border-r border-white/10">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white text-[15px] font-semibold tracking-tight">RCCP One</p>
            <p className="text-[11px] leading-tight mt-0.5 text-slate-400 font-medium">Capacity Planning</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Navigation
        </div>
        {navItems.map((item) =>
          item.path ? (
            <NavLink
              key={item.label}
              to={item.path}
              end
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] shadow-lg shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
              <span className="leading-tight">{item.label}</span>
            </NavLink>
          ) : (
            <div
              key={item.label}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] text-slate-600 cursor-not-allowed"
            >
              <span className="flex items-center gap-3">
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
                <span className="leading-tight">{item.label}</span>
              </span>
              <span className="text-[10px] bg-white/10 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                {item.phase}
              </span>
            </div>
          )
        )}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-md">
              <span className="text-white text-sm font-semibold">
                {user ? initials(user.username) : '??'}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-[#0F172A] rounded-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate text-slate-200">{user?.username}</p>
            <p className="text-[11px] truncate text-slate-500 font-medium capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  )
}
