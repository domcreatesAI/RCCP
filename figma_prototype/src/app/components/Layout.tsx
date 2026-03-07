import { Outlet, NavLink, useLocation } from 'react-router';
import {
  Upload, BarChart2, GitBranch, FileText, SlidersHorizontal,
  Bell, HelpCircle, Activity, Sparkles,
} from 'lucide-react';

const navItems = [
  { path: '/planning-data', label: 'Planning Data', icon: Upload },
  { path: '/rccp-dashboard', label: 'RCCP Dashboard', icon: BarChart2 },
  { path: '/scenarios', label: 'Scenarios', icon: GitBranch },
  { path: '/executive-summary', label: 'Executive Summary', icon: FileText },
  { path: '/configuration', label: 'Config & Masterdata', icon: SlidersHorizontal },
];

const pageTitles: Record<string, string> = {
  '/planning-data': 'Planning Data',
  '/rccp-dashboard': 'RCCP Dashboard',
  '/scenarios': 'Scenarios',
  '/executive-summary': 'Executive Summary',
  '/configuration': 'Configuration & Masterdata',
};

export function Layout() {
  const location = useLocation();
  const pageTitle = pageTitles[location.pathname] || 'RCCP One';

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFBFC]">
      {/* Sidebar - Modern with gradient */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col bg-gradient-to-b from-[#0F172A] to-[#1E293B] border-r border-white/10">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
              <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-white text-[15px] font-semibold tracking-tight">RCCP One</div>
              <div className="text-[11px] leading-tight mt-0.5 text-slate-400 font-medium">
                Capacity Planning & AI
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Navigation
          </div>
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] shadow-lg shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
                }`
              }
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
              <span className="leading-tight">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center flex-shrink-0 shadow-md">
                <span className="text-white text-sm font-semibold">JS</span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-[#0F172A] rounded-full"></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate text-slate-200">Jane Smith</div>
              <div className="text-[11px] truncate text-slate-500 font-medium">Senior Planner</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar - Elevated with blur */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 h-16 flex items-center px-7 flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-gray-400 font-medium">RCCP One</span>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900">{pageTitle}</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {/* Cycle Badge */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></div>
                <span className="text-[11px] text-gray-500 font-medium">Cycle:</span>
                <span className="text-[13px] font-bold text-gray-900">Mar 2026</span>
              </div>
              <div className="w-px h-4 bg-gray-200"></div>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">Draft</span>
            </div>

            {/* Action Buttons */}
            <button className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-gray-100 active:scale-95 group">
              <Bell className="w-[18px] h-[18px] text-gray-500 group-hover:text-gray-700 transition-colors" strokeWidth={2} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            </button>
            <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-gray-100 active:scale-95 group">
              <HelpCircle className="w-[18px] h-[18px] text-gray-500 group-hover:text-gray-700 transition-colors" strokeWidth={2} />
            </button>
            
            {/* User Avatar */}
            <div className="relative ml-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow ring-2 ring-white shadow-sm">
                <span className="text-sm font-bold text-indigo-700">JS</span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
