import React, { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  CheckSquare,
  ClipboardCheck,
  CalendarRange,
  Building2,
  Users,
  BookOpen,
  Gauge,
  BarChart3,
  FileCheck2,
  ShieldAlert,
  Calculator,
  UserCircle,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { ROLES } from '../lib/constants.js';
import { authApi, cycleApi } from '../api/endpoints.js';
import { useAuthStore } from '../store/authStore.js';
import { useUiStore } from '../store/uiStore.js';

/** Sidebar navigation table derived from role permissions (frontend.md §5.1) */
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER, ROLES.APPROVER, ROLES.VIEWER],
  },
  {
    label: 'My Tasks',
    to: '/my-tasks',
    icon: CheckSquare,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER],
  },
  {
    label: 'Approval Queue',
    to: '/approvals',
    icon: ClipboardCheck,
    roles: [ROLES.ADMIN, ROLES.APPROVER],
  },
  {
    label: 'Periods',
    to: '/periods',
    icon: CalendarRange,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER, ROLES.APPROVER, ROLES.VIEWER],
  },
  {
    label: 'Departments',
    to: '/master/departments',
    icon: Building2,
    roles: [ROLES.ADMIN],
    section: 'Master Data',
  },
  {
    label: 'Users & Roles',
    to: '/master/users',
    icon: Users,
    roles: [ROLES.ADMIN],
    section: 'Master Data',
  },
  {
    label: 'Standards',
    to: '/master/standards',
    icon: BookOpen,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER, ROLES.APPROVER, ROLES.VIEWER],
    section: 'Master Data',
  },
  {
    label: 'KPIs',
    to: '/master/kpis',
    icon: Gauge,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER, ROLES.APPROVER, ROLES.VIEWER],
    section: 'Master Data',
  },
  {
    label: 'Reports & Export',
    to: '/reports',
    icon: BarChart3,
    roles: [ROLES.ADMIN, ROLES.VIEWER],
    section: 'Reporting',
  },
  {
    label: 'GRI Content Index',
    to: '/reports/content-index',
    icon: FileCheck2,
    roles: [ROLES.ADMIN, ROLES.VIEWER],
    section: 'Reporting',
  },
  {
    label: 'Audit Log',
    to: '/audit',
    icon: ShieldAlert,
    roles: [ROLES.ADMIN, ROLES.VIEWER],
    section: 'Reporting',
  },
  {
    label: 'Emissions Calculator',
    to: '/tools/emissions',
    icon: Calculator,
    roles: [ROLES.ADMIN, ROLES.DATA_OWNER, ROLES.APPROVER, ROLES.VIEWER],
    section: 'Tools',
  },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const setSelectedPeriodId = useUiStore((s) => s.setSelectedPeriodId);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: periodsRes } = useQuery({
    queryKey: ['periods'],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
    staleTime: 60_000,
  });

  const periods = useMemo(() => periodsRes?.data || [], [periodsRes]);

  useEffect(() => {
    const urlPeriod = searchParams.get('period');
    if (urlPeriod && urlPeriod !== selectedPeriodId) {
      setSelectedPeriodId(urlPeriod);
      return;
    }
    if (!selectedPeriodId && periods.length > 0) {
      const inProgress = periods.find((p) => p.period_status === 'In Progress');
      const chosen = (inProgress || periods[0])._id;
      setSelectedPeriodId(chosen);
    }
  }, [periods, selectedPeriodId, searchParams, setSelectedPeriodId]);

  const handlePeriodChange = (e) => {
    const nextId = e.target.value;
    setSelectedPeriodId(nextId);
    const next = new URLSearchParams(searchParams);
    if (nextId) next.set('period', nextId);
    else next.delete('period');
    setSearchParams(next, { replace: true });
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      navigate('/login');
    }
  };

  const userRoles = user?.roles || [];
  const allowedNav = NAV_ITEMS.filter((item) => item.roles.some((r) => userRoles.includes(r)));

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      {/* Header */}
      <header className="h-16 bg-surface border-b border-line px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="lg:hidden p-2 rounded-input hover:bg-surface-muted"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-input bg-brand-600 text-white font-bold flex items-center justify-center">
              E
            </div>
            <div>
              <span className="font-bold text-ink-900 tracking-tight">ESG Management</span>
              {user?.organization ? (
                <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">
                  {user.organization.organization_code}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Global reporting period selector */}
          {periods.length > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="global-period-select" className="hidden md:inline text-xs font-medium text-ink-500">
                Period:
              </label>
              <select
                id="global-period-select"
                value={selectedPeriodId || ''}
                onChange={handlePeriodChange}
                className="border border-line rounded-input px-2.5 py-1.5 text-xs sm:text-sm bg-surface font-medium text-ink-900"
              >
                {periods.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.period_name} ({p.period_status})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <NavLink
            to="/profile"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-input text-xs sm:text-sm hover:bg-surface-muted text-ink-900"
          >
            <UserCircle className="w-4 h-4 text-brand-600" aria-hidden="true" />
            <span className="hidden sm:inline font-medium">{user?.display_name}</span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-input text-xs sm:text-sm text-ink-500 hover:text-brand-600 hover:bg-surface-muted"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          aria-label="Sidebar navigation"
          className={clsx(
            'w-64 bg-surface border-r border-line p-4 space-y-1 shrink-0',
            mobileNavOpen ? 'fixed inset-y-16 left-0 z-40 block shadow-lg' : 'hidden lg:block',
          )}
        >
          {allowedNav.map((item, idx) => {
            const prevSection = idx > 0 ? allowedNav[idx - 1].section : undefined;
            const showHeader = item.section && item.section !== prevSection;
            const Icon = item.icon;
            return (
              <React.Fragment key={item.to}>
                {showHeader ? (
                  <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                    {item.section}
                  </div>
                ) : null}
                <NavLink
                  to={item.to}
                  end={item.to === '/reports'}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 px-3 py-2 rounded-input text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-600 font-semibold'
                        : 'text-ink-900 hover:bg-surface-muted',
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </React.Fragment>
            );
          })}
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

