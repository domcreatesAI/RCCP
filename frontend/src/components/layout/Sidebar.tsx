import { NavLink } from 'react-router'
import {
  Upload, GitBranch, FileText, SlidersHorizontal, LogOut, Download,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface NavItem {
  label: string
  path?: string
  phase?: string
  badge: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { label: 'Planning Data',     path: '/',                  badge: 'P1', icon: Upload },
  { label: 'Executive Summary', path: '/executive-summary', badge: 'P4', icon: FileText },
  { label: 'Scenarios',         path: '/scenarios',         badge: 'P3', icon: GitBranch },
  { label: 'Batch Exports',     path: '/exports',           badge: 'XLS', icon: Download },
  { label: 'Config & Masterdata', phase: 'Phase 5',         badge: 'P5', icon: SlidersHorizontal },
]

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside
      className="w-[248px] flex-shrink-0 flex flex-col text-white relative overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg,#143F5C 0%,#0C3C5D 60%,#082A40 100%)',
      }}
    >
      {/* Decorative glows */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: '-60px',
          top: '-40px',
          width: '180px',
          height: '180px',
          background:
            'radial-gradient(circle,rgba(170,205,0,0.18),transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: '-30px',
          bottom: '160px',
          width: '120px',
          height: '120px',
          background:
            'radial-gradient(circle,rgba(177,204,187,0.08),transparent 70%)',
        }}
      />

      {/* Brand */}
      <div className="relative px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <img
            src="/moove-logo.png"
            alt="moove"
            className="h-7 w-auto"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span
            className="font-mono font-semibold uppercase"
            style={{
              fontSize: '9px',
              color: '#AACD00',
              letterSpacing: '0.16em',
              background: 'rgba(170,205,0,0.12)',
              padding: '3px 8px',
              borderRadius: '3px',
              border: '1px solid rgba(170,205,0,0.3)',
            }}
          >
            RCCP
          </span>
        </div>
        <p className="text-[11.5px] mt-2 text-white/55 font-medium tracking-wide">
          Capacity Planning · UKP1
        </p>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 px-3 py-5 overflow-y-auto">
        <p className="px-2 mb-2 text-[10px] font-mono font-medium tracking-[0.14em] uppercase text-white/45">
          Workspace
        </p>

        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            if (item.path) {
              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `group flex items-center justify-between gap-3 pl-3 pr-2.5 py-2 rounded-md text-[13.5px] font-medium transition-all duration-150 border ${
                      isActive
                        ? 'text-white font-semibold border-[rgba(170,205,0,0.35)]'
                        : 'text-white/72 border-transparent hover:bg-white/[0.06] hover:text-white'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: 'rgba(170,205,0,0.12)',
                          boxShadow: 'inset 0 0 20px rgba(170,205,0,0.08)',
                        }
                      : undefined
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2.5 min-w-0">
                        {isActive && (
                          <span
                            aria-hidden
                            className="rounded-sm flex-shrink-0"
                            style={{
                              width: '3px',
                              height: '14px',
                              background: '#AACD00',
                              boxShadow: '0 0 8px rgba(170,205,0,0.6)',
                            }}
                          />
                        )}
                        <Icon
                          className="flex-shrink-0"
                          style={{ width: 16, height: 16 }}
                          strokeWidth={isActive ? 2.2 : 1.8}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span
                        className="font-mono text-[10px] flex-shrink-0 px-1.5 py-px rounded-sm"
                        style={
                          isActive
                            ? { background: 'rgba(170,205,0,0.2)', color: '#AACD00' }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }
                        }
                      >
                        {item.badge}
                      </span>
                    </>
                  )}
                </NavLink>
              )
            }

            // Disabled / phase placeholder
            return (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md text-[13.5px] font-medium text-white/35 cursor-not-allowed"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className="flex-shrink-0"
                    style={{ width: 16, height: 16 }}
                    strokeWidth={1.8}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  className="font-mono text-[10px] flex-shrink-0 px-1.5 py-px rounded-sm"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.35)',
                  }}
                  title={item.phase}
                >
                  {item.badge}
                </span>
              </div>
            )
          })}
        </div>
      </nav>

      {/* User */}
      <div className="relative px-3 pb-4">
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg,#AACD00,#7B9400)',
              color: '#0C3C5D',
              letterSpacing: '-0.02em',
            }}
          >
            {user ? initials(user.username) : '??'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold leading-tight text-white truncate">
              {user?.username}
            </p>
            <p className="text-[11px] text-white/50 capitalize leading-tight mt-0.5 truncate">
              {user?.role ?? '—'}
            </p>
          </div>
          <span
            className="flex-shrink-0 inline-block rounded-full"
            style={{
              width: 7,
              height: 7,
              background: '#AACD00',
              boxShadow: '0 0 0 3px rgba(170,205,0,0.2)',
            }}
            title="Live"
          />
          <button
            onClick={logout}
            title="Sign out"
            className="flex-shrink-0 ml-1 text-white/50 hover:text-white transition-colors p-1 rounded"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  )
}
