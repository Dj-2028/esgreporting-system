import React, { useEffect } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  Link,
  useLocation,
} from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { ROLES } from '../lib/constants.js';
import { authApi } from '../api/endpoints.js';
import { useAuthStore } from '../store/authStore.js';
import { AppShell } from '../components/AppShell.jsx';
import {
  LoginPage,
  RegisterOrgPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  ChangePasswordPage,
  ProfilePage,
} from '../features/auth/AuthPages.jsx';
import { DashboardPage } from '../features/dashboard/DashboardPage.jsx';
import {
  PeriodsListPage,
  NewPeriodWizardPage,
  PeriodDetailPage,
} from '../features/periods/PeriodPages.jsx';
import {
  MyTasksPage,
  ApprovalQueuePage,
  RecordPage,
} from '../features/records/RecordPages.jsx';
import {
  DepartmentsPage,
  UsersPage,
  StandardsPage,
  KpisPage,
} from '../features/masterdata/MasterDataPages.jsx';
import {
  ReportsPage,
  ContentIndexPage,
  AuditLogPage,
  EmissionsCalculatorPage,
} from '../features/reports/ReportPages.jsx';

/** Session Bootstrapper: on initial load tries POST /auth/refresh -> GET /auth/me */
export function SessionBootstrap({ children }) {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    let active = true;
    if (status !== 'loading') return undefined;

    (async () => {
      try {
        const ref = await authApi.refresh();
        useAuthStore.getState().setAccessToken(ref.access_token);
        const me = await authApi.me();
        if (active) setSession({ user: me, accessToken: ref.access_token });
      } catch {
        if (active) clearSession();
      }
    })();

    return () => {
      active = false;
    };
  }, [status, setSession, clearSession]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted text-ink-500 gap-2 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        <span>Loading ESG Management System…</span>
      </div>
    );
  }

  return children;
}

/** ProtectedRoute (frontend.md §4, §5) */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (status !== 'authed' || !user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

/** RoleRoute — shows "Access denied" page when user lacks required role */
export function RoleRoute({ roles, children }) {
  const userRoles = useAuthStore((s) => s.user?.roles || []);
  const allowed = roles.some((r) => userRoles.includes(r));

  if (!allowed) {
    return (
      <div
        role="alert"
        className="bg-surface border border-line rounded-card shadow-card p-8 max-w-md mx-auto text-center space-y-3 my-8"
      >
        <ShieldAlert className="w-10 h-10 text-brand-600 mx-auto" />
        <h1 className="text-xl font-bold text-ink-900">Access denied</h1>
        <p className="text-sm text-ink-500">
          You do not have access to view this screen with your current role permissions.
        </p>
        <Link
          to="/"
          className="inline-block text-sm font-semibold text-brand-600 hover:underline pt-2"
        >
          Return to home
        </Link>
      </div>
    );
  }

  return children || <Outlet />;
}

/** Role-aware home redirect (`/` — frontend.md §5) */
export function HomeRedirect() {
  const roles = useAuthStore((s) => s.user?.roles || []);
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.VIEWER)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (roles.includes(ROLES.DATA_OWNER)) {
    return <Navigate to="/my-tasks" replace />;
  }
  if (roles.includes(ROLES.APPROVER)) {
    return <Navigate to="/approvals" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-3">
      <h1 className="text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="text-sm text-ink-500">The page you requested does not exist.</p>
      <Link to="/" className="text-sm font-semibold text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}

export const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterOrgPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <SessionBootstrap>
        <ProtectedRoute />
      </SessionBootstrap>
    ),
    children: [
      { path: '/change-password', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'periods', element: <PeriodsListPage /> },
          {
            path: 'periods/new',
            element: (
              <RoleRoute roles={[ROLES.ADMIN]}>
                <NewPeriodWizardPage />
              </RoleRoute>
            ),
          },
          { path: 'periods/:id', element: <PeriodDetailPage /> },
          {
            path: 'my-tasks',
            element: (
              <RoleRoute roles={[ROLES.DATA_OWNER, ROLES.ADMIN]}>
                <MyTasksPage />
              </RoleRoute>
            ),
          },
          {
            path: 'approvals',
            element: (
              <RoleRoute roles={[ROLES.APPROVER, ROLES.ADMIN]}>
                <ApprovalQueuePage />
              </RoleRoute>
            ),
          },
          { path: 'records/:id', element: <RecordPage /> },
          { path: 'master/departments', element: <DepartmentsPage /> },
          {
            path: 'master/users',
            element: (
              <RoleRoute roles={[ROLES.ADMIN]}>
                <UsersPage />
              </RoleRoute>
            ),
          },
          { path: 'master/standards', element: <StandardsPage /> },
          { path: 'master/kpis', element: <KpisPage /> },
          {
            path: 'reports',
            element: (
              <RoleRoute roles={[ROLES.ADMIN, ROLES.VIEWER]}>
                <ReportsPage />
              </RoleRoute>
            ),
          },
          {
            path: 'reports/content-index',
            element: (
              <RoleRoute roles={[ROLES.ADMIN, ROLES.VIEWER]}>
                <ContentIndexPage />
              </RoleRoute>
            ),
          },
          {
            path: 'audit',
            element: (
              <RoleRoute roles={[ROLES.ADMIN, ROLES.VIEWER]}>
                <AuditLogPage />
              </RoleRoute>
            ),
          },
          { path: 'tools/emissions', element: <EmissionsCalculatorPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
