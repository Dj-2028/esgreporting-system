import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import clsx from 'clsx';
import { ROLES, RECORD_STATUS } from '../../lib/constants.js';
import { cycleApi, masterApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { formatDate, formatNumber } from '../../lib/formatters.js';
import { getFriendlyErrorMessage } from '../../lib/errors.js';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  PillarBadge,
  Skeleton,
  StatusChip,
} from '../../components/shared.jsx';

function SetupChecklistBanner({ periodExists }) {
  const { data: depts } = useQuery({
    queryKey: ['departments', { limit: 1 }],
    queryFn: () => masterApi.listDepartments({ limit: 1 }),
  });
  const { data: users } = useQuery({
    queryKey: ['users', { limit: 2 }],
    queryFn: () => masterApi.listUsers({ limit: 2 }),
  });
  const { data: standards } = useQuery({
    queryKey: ['standards'],
    queryFn: () => masterApi.listStandards(),
  });
  const { data: kpis } = useQuery({
    queryKey: ['kpis', { limit: 1 }],
    queryFn: () => masterApi.listKpis({ limit: 1 }),
  });

  const steps = [
    { label: 'Add departments', to: '/master/departments', done: (depts?.meta?.total || 0) > 0 },
    { label: 'Add users', to: '/master/users', done: (users?.meta?.total || 0) > 1 },
    { label: 'Review standards', to: '/master/standards', done: (standards?.length || 0) > 0 },
    { label: 'Add KPIs', to: '/master/kpis', done: (kpis?.meta?.total || 0) > 0 },
    { label: 'Create first period', to: '/periods/new', done: periodExists },
  ];

  if (steps.every((s) => s.done)) return null;

  return (
    <section
      aria-label="Setup checklist"
      className="bg-brand-50 border border-brand-600/20 rounded-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-900">Organisation Setup Checklist</h2>
        <span className="text-xs font-medium text-brand-700">
          {steps.filter((s) => s.done).length} of {steps.length} complete
        </span>
      </div>
      <div className="grid sm:grid-cols-5 gap-2">
        {steps.map((step) => (
          <Link
            key={step.label}
            to={step.to}
            className="flex items-center gap-2 bg-surface rounded-input px-3 py-2 text-xs font-medium border border-line hover:border-brand-600"
          >
            {step.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-ink-500 shrink-0" />
            )}
            <span className={step.done ? 'line-through text-ink-500' : 'text-ink-900'}>
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const statusFilter = searchParams.get('status') || '';
  const pillarFilter = searchParams.get('pillar') || '';
  const q = searchParams.get('q') || '';

  const isAdmin = user?.roles?.includes(ROLES.ADMIN);
  const isViewer = user?.roles?.includes(ROLES.VIEWER);

  const {
    data: dash,
    isLoading: dashLoading,
    error: dashError,
    refetch: refetchDash,
  } = useQuery({
    queryKey: ['dashboard', selectedPeriodId],
    queryFn: () =>
      cycleApi.getDashboard(selectedPeriodId ? { reporting_period_id: selectedPeriodId } : {}),
  });

  const activePeriodId = dash?.period?.id || selectedPeriodId;

  const { data: pillars } = useQuery({
    queryKey: ['pillars'],
    queryFn: () => masterApi.listPillars(),
  });

  const {
    data: recordsRes,
    isLoading: recLoading,
    error: recError,
    refetch: refetchRec,
  } = useQuery({
    queryKey: [
      'records',
      {
        reporting_period_id: activePeriodId,
        submission_status: statusFilter,
        esg_pillar_id: pillarFilter,
        q,
        page,
      },
    ],
    enabled: Boolean(activePeriodId),
    queryFn: () =>
      cycleApi.listRecords({
        reporting_period_id: activePeriodId,
        submission_status: statusFilter || undefined,
        esg_pillar_id: pillarFilter || undefined,
        q: q || undefined,
        page,
        limit: 20,
      }),
  });

  const updateFilter = (key, val) => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val);
    else next.delete(key);
    setSearchParams(next);
  };

  if (dashLoading) return <Skeleton rows={6} />;
  if (dashError) {
    return <ErrorState message={getFriendlyErrorMessage(dashError)} onRetry={refetchDash} />;
  }

  const period = dash?.period;
  const totals = dash?.totals || { total: 0, by_status: {}, completion_pct: 0, overdue: 0 };
  const isPersonalScope = dash?.scope === 'mine';

  const tiles = [
    {
      label: isPersonalScope ? 'My KPIs' : 'Total KPIs',
      value: totals.total,
      status: '',
      tone: 'border-line',
    },
    {
      label: 'In Progress',
      value: totals.by_status?.[RECORD_STATUS.IN_PROGRESS] || 0,
      status: RECORD_STATUS.IN_PROGRESS,
      tone: 'border-blue-300',
    },
    {
      label: 'Ready for Approval',
      value: totals.by_status?.[RECORD_STATUS.READY_FOR_APPROVAL] || 0,
      status: RECORD_STATUS.READY_FOR_APPROVAL,
      tone: 'border-amber-300',
    },
    {
      label: 'Approved',
      value: totals.by_status?.[RECORD_STATUS.APPROVED] || 0,
      status: RECORD_STATUS.APPROVED,
      tone: 'border-emerald-300',
    },
    {
      label: 'Rejected',
      value: totals.by_status?.[RECORD_STATUS.REJECTED] || 0,
      status: RECORD_STATUS.REJECTED,
      tone: 'border-red-300',
    },
    {
      label: 'Overdue',
      value: totals.overdue || 0,
      status: '',
      tone: 'border-gray-300',
    },
  ];

  const columns = [
    {
      key: 'kpi_code',
      header: 'KPI Code',
      render: (r) => <span className="font-mono font-semibold text-xs">{r.kpi?.kpi_code}</span>,
    },
    {
      key: 'kpi_name',
      header: 'KPI Name',
      render: (r) => <span className="font-medium">{r.kpi?.kpi_name}</span>,
    },
    {
      key: 'pillar',
      header: 'Pillar',
      render: (r) =>
        r.pillar ? <PillarBadge code={r.pillar.pillar_code} showLabel={false} /> : '—',
    },
    {
      key: 'actual',
      header: 'Actual',
      render: (r) =>
        r.actual_value !== null && r.actual_value !== undefined
          ? `${formatNumber(r.actual_value)} ${r.kpi?.unit_of_measurement || ''}`
          : '—',
    },
    {
      key: 'owner',
      header: 'Data Owner',
      render: (r) =>
        r.data_owner?.is_active === false ? (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
            Unassigned owner
          </span>
        ) : (
          r.data_owner?.display_name || '—'
        ),
    },
    {
      key: 'approver',
      header: 'Approver',
      render: (r) => r.approver?.display_name || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={r.submission_status} />,
    },
    {
      key: 'started',
      header: 'Date Started',
      render: (r) => formatDate(r.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">ESG Dashboard</h1>
          {period ? (
            <p className="text-sm text-ink-500 mt-0.5">
              Period: <strong className="text-ink-900">{period.period_name}</strong> (
              {formatDate(period.period_start_date)} – {formatDate(period.period_end_date)})
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <Button icon={Plus} onClick={() => navigate('/periods/new')}>
            New Reporting Period
          </Button>
        ) : null}
      </div>

      {isAdmin ? <SetupChecklistBanner periodExists={Boolean(period)} /> : null}

      {!period ? (
        <EmptyState
          title="No reporting period yet"
          description={
            isAdmin
              ? 'Open your first reporting period and assign KPIs to start collecting data.'
              : 'An administrator has not opened a reporting period yet.'
          }
          action={
            isAdmin ? (
              <Button icon={Plus} onClick={() => navigate('/periods/new')}>
                Create First Period
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* KPI Status Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tiles.map((t) => {
              const active = statusFilter === t.status && t.status !== '';
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => updateFilter('status', active ? '' : t.status)}
                  className={clsx(
                    'bg-surface border rounded-card p-4 text-left shadow-card transition-all',
                    t.tone,
                    active && 'ring-2 ring-brand-600',
                  )}
                >
                  <p className="text-xs font-medium text-ink-500">{t.label}</p>
                  <p className="text-2xl font-bold text-ink-900 mt-1">{t.value}</p>
                </button>
              );
            })}
          </div>

          {/* Completion & By-Pillar / By-Department progress */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="bg-surface border border-line rounded-card p-5 shadow-card flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Overall Completion</h2>
                <p className="text-xs text-ink-500">Approved ÷ Total KPIs</p>
              </div>
              <div className="my-4">
                <div className="text-4xl font-bold text-brand-600">{totals.completion_pct}%</div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.min(100, totals.completion_pct)}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-500">
                {totals.by_status?.[RECORD_STATUS.APPROVED] || 0} of {totals.total} records Approved
              </p>
            </div>

            <div className="bg-surface border border-line rounded-card p-5 shadow-card lg:col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-ink-900">Progress by ESG Pillar</h2>
              {(dash.by_pillar || []).length === 0 ? (
                <p className="text-xs text-ink-500">No KPI records in this period yet.</p>
              ) : (
                <div className="space-y-3">
                  {dash.by_pillar.map((p) => (
                    <div key={p.pillar_id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <PillarBadge code={p.pillar_code} />
                        <span className="font-medium text-ink-500">
                          {p.by_status?.[RECORD_STATUS.APPROVED] || 0} / {p.total} Approved (
                          {p.completion_pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600"
                          style={{ width: `${p.completion_pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(isAdmin || isViewer) && (dash.by_department || []).length > 0 ? (
                <div className="pt-3 border-t border-line space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-ink-500">
                    Completion by Department
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {dash.by_department.map((d) => (
                      <div
                        key={d.department_name}
                        className="flex items-center justify-between text-xs bg-surface-muted px-3 py-1.5 rounded"
                      >
                        <span className="font-medium text-ink-900">{d.department_name}</span>
                        <span className="font-semibold text-brand-600">
                          {d.approved}/{d.total} ({d.completion_pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-surface border border-line rounded-card p-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={q}
              onChange={(e) => updateFilter('q', e.target.value)}
              placeholder="Search KPI code or name…"
              className="border border-line rounded-input px-3 py-1.5 text-sm flex-1 min-w-[200px]"
            />
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="border border-line rounded-input px-3 py-1.5 text-sm bg-surface"
            >
              <option value="">All Statuses</option>
              {Object.values(RECORD_STATUS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by pillar"
              value={pillarFilter}
              onChange={(e) => updateFilter('pillar', e.target.value)}
              className="border border-line rounded-input px-3 py-1.5 text-sm bg-surface"
            >
              <option value="">All Pillars</option>
              {(pillars || []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.pillar_code} — {p.pillar_name}
                </option>
              ))}
            </select>
            {statusFilter || pillarFilter || q ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchParams({});
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          {/* Records Table */}
          <DataTable
            columns={columns}
            data={recordsRes?.data || []}
            isLoading={recLoading}
            error={recError ? getFriendlyErrorMessage(recError) : null}
            onRetry={refetchRec}
            pagination={recordsRes?.meta}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/records/${row.id}`)}
            emptyTitle="No KPI records match your filters"
            emptyDescription="Try clearing the filters or assigning KPIs to this reporting period."
          />
        </>
      )}
    </div>
  );
}

