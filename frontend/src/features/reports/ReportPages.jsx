import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Copy, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { ROLES, AUDIT_ACTIONS } from '../../lib/constants.js';
import { cycleApi, masterApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { formatDateTime, formatNumber } from '../../lib/formatters.js';
import { getFriendlyErrorMessage } from '../../lib/errors.js';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  PillarBadge,
  Skeleton,
  StatusChip,
} from '../../components/shared.jsx';

/** Reports & Export (`/reports` — frontend.md §6.15) */
export function ReportsPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const [selectedKpiId, setSelectedKpiId] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');
  const [includeAll, setIncludeAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: periodsRes } = useQuery({
    queryKey: ['periods'],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
  });
  const activePeriodId = selectedPeriodId || periodsRes?.data?.[0]?._id;

  const { data: pillarTotalsRes, isLoading: totalsLoading } = useQuery({
    queryKey: ['pillar-totals', activePeriodId],
    enabled: Boolean(activePeriodId),
    queryFn: () => cycleApi.getPillarTotals({ reporting_period_id: activePeriodId }),
  });

  const { data: kpisRes } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => masterApi.listKpis({ limit: 100 }),
  });
  const kpis = kpisRes?.data || [];
  const kpiIdForTrend = selectedKpiId || kpis[0]?._id || '';

  const { data: trendRes } = useQuery({
    queryKey: ['kpi-trend', kpiIdForTrend],
    enabled: Boolean(kpiIdForTrend),
    queryFn: () => cycleApi.getKpiTrend({ kpi_id: kpiIdForTrend }),
  });

  const handleExport = async () => {
    if (!activePeriodId) return;
    setExporting(true);
    try {
      const res = await cycleApi.exportReportBlob({
        reporting_period_id: activePeriodId,
        format: exportFormat,
        ...(isAdmin && includeAll ? { include_all: true } : {}),
      });
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esg-report-${activePeriodId}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Exported ${exportFormat.toUpperCase()} report.`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const pillarRows = pillarTotalsRes?.rows || [];
  const trendPoints = trendRes?.points || [];

  const columns = [
    { key: 'pillar', header: 'Pillar', render: (r) => <PillarBadge code={r.pillar_code} /> },
    { key: 'total', header: 'Total KPIs', render: (r) => r.total },
    { key: 'approved', header: 'Approved', render: (r) => r.approved },
    { key: 'ready', header: 'Ready for Approval', render: (r) => r.ready_for_approval },
    { key: 'rejected', header: 'Rejected', render: (r) => r.rejected },
    { key: 'in_progress', header: 'In Progress', render: (r) => r.in_progress },
    {
      key: 'pct',
      header: 'Completion %',
      render: (r) => <span className="font-semibold text-brand-600">{r.completion_pct}%</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Reports & Export</h1>
          <p className="text-sm text-ink-500">
            Pillar completion summary, multi-period KPI trends, and audit-ready exports.
          </p>
        </div>
      </div>

      {!activePeriodId ? (
        <EmptyState title="No reporting period available" />
      ) : (
        <>
          {/* Export Card */}
          <div className="bg-surface border border-line rounded-card shadow-card p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Export Period Data</h2>
              <p className="text-xs text-ink-500">
                By default, only <strong>Approved</strong> records are exported (BR-1).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select
                aria-label="Export format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="border border-line rounded-input px-3 py-1.5 bg-surface font-medium"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="pdf">PDF Summary</option>
              </select>
              {isAdmin ? (
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink-900">
                  <input
                    type="checkbox"
                    checked={includeAll}
                    onChange={(e) => setIncludeAll(e.target.checked)}
                  />
                  Include non-approved records
                </label>
              ) : null}
              <Button icon={Download} loading={exporting} onClick={handleExport}>
                Download Export
              </Button>
            </div>
          </div>

          {/* Pillar Totals */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-ink-900">Totals by ESG Pillar</h2>
            <DataTable
              columns={columns}
              data={pillarRows}
              isLoading={totalsLoading}
              emptyTitle="No pillar data for this period"
            />
          </div>

          {/* KPI Trend across periods */}
          <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink-900">
                  Per-Period KPI Comparison (Approved Values Only)
                </h2>
                <p className="text-xs text-ink-500">
                  Compare actual vs target and baseline across reporting periods.
                </p>
              </div>
              <select
                aria-label="Select KPI for trend"
                value={kpiIdForTrend}
                onChange={(e) => setSelectedKpiId(e.target.value)}
                className="border border-line rounded-input px-3 py-1.5 text-sm bg-surface"
              >
                {kpis.map((k) => (
                  <option key={k._id} value={k._id}>
                    {k.kpi_code} — {k.kpi_name} ({k.unit_of_measurement})
                  </option>
                ))}
              </select>
            </div>

            {trendPoints.length === 0 ? (
              <p className="text-xs text-ink-500">
                No approved records across periods for this KPI yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead className="bg-surface-muted text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Period</th>
                      <th className="px-4 py-2 text-left">Actual Value</th>
                      <th className="px-4 py-2 text-left">Target Value</th>
                      <th className="px-4 py-2 text-left">Baseline Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {trendPoints.map((pt) => (
                      <tr key={pt.period_id}>
                        <td className="px-4 py-2 font-medium">{pt.period_name}</td>
                        <td className="px-4 py-2 font-semibold text-brand-600">
                          {formatNumber(pt.actual_value)} {trendRes?.kpi?.unit_of_measurement}
                        </td>
                        <td className="px-4 py-2">{formatNumber(pt.target_value)}</td>
                        <td className="px-4 py-2">{formatNumber(pt.baseline_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** GRI Content Index (`/reports/content-index` — frontend.md §6.16) */
export function ContentIndexPage() {
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const [standardId, setStandardId] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);

  const { data: periodsRes } = useQuery({
    queryKey: ['periods'],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
  });
  const activePeriodId = selectedPeriodId || periodsRes?.data?.[0]?._id;

  const { data: standards } = useQuery({
    queryKey: ['standards'],
    queryFn: () => masterApi.listStandards(),
  });

  const { data: indexRes, isLoading } = useQuery({
    queryKey: ['content-index', activePeriodId, standardId],
    enabled: Boolean(activePeriodId),
    queryFn: () =>
      cycleApi.getContentIndex({
        reporting_period_id: activePeriodId,
        ...(standardId ? { esg_standard_id: standardId } : {}),
      }),
  });

  if (isLoading) return <Skeleton rows={6} />;

  const allRows = (indexRes?.rows || []).map((r) => ({
    ...r,
    id: r.disclosure_id,
    _rowClassName: r.gap
      ? r.gap_severity === 'mandatory'
        ? 'bg-red-50/70'
        : 'bg-amber-50/50'
      : '',
  }));

  const rows = gapsOnly ? allRows.filter((r) => r.gap) : allRows;

  const columns = [
    {
      key: 'code',
      header: 'Disclosure',
      render: (r) => (
        <div>
          <span className="font-mono font-semibold text-xs">{r.disclosure_code}</span>
          {r.is_mandatory ? (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
              Mandatory
            </span>
          ) : null}
        </div>
      ),
    },
    { key: 'title', header: 'Title', render: (r) => r.disclosure_title },
    {
      key: 'kpis',
      header: 'Mapped KPI(s)',
      render: (r) =>
        r.kpis.length === 0 ? (
          <span className="text-xs text-ink-500">Unmapped</span>
        ) : (
          <div className="space-y-1">
            {r.kpis.map((k) => (
              <div key={k.kpi_id} className="text-xs">
                <span className="font-mono font-semibold">{k.kpi_code}</span>: {k.kpi_name}
              </div>
            ))}
          </div>
        ),
    },
    {
      key: 'value',
      header: 'Approved Value',
      render: (r) =>
        r.kpis.length === 0
          ? '—'
          : r.kpis
              .map((k) =>
                k.actual_value !== null && k.actual_value !== undefined
                  ? `${formatNumber(k.actual_value)} ${k.unit_of_measurement}`
                  : '—',
              )
              .join(', '),
    },
    {
      key: 'owner',
      header: 'Owner / Approver',
      render: (r) =>
        r.kpis
          .filter((k) => k.data_owner || k.approver)
          .map((k) => `${k.data_owner || '—'} / ${k.approver || '—'}`)
          .join(', ') || '—',
    },
    {
      key: 'evidence',
      header: 'Evidence',
      render: (r) => r.kpis.reduce((sum, k) => sum + (k.evidence_count || 0), 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={r.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">GRI Content Index</h1>
          <p className="text-sm text-ink-500">
            Disclosures mapped to approved KPI values. Unapproved or unmapped disclosures are
            highlighted as gaps (BR-11).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            aria-label="Select standard"
            value={standardId}
            onChange={(e) => setStandardId(e.target.value)}
            className="border border-line rounded-input px-3 py-1.5 bg-surface font-medium"
          >
            {(standards || []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.standard_code} — {s.version_label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs font-medium bg-surface border border-line rounded-input px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gapsOnly}
              onChange={(e) => setGapsOnly(e.target.checked)}
            />
            Show gaps only ({indexRes?.summary?.gaps || 0} gaps,{' '}
            {indexRes?.summary?.mandatory_gaps || 0} mandatory)
          </label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="No disclosures match the current filter"
      />
    </div>
  );
}

/** Audit Log (`/audit` — frontend.md §6.17) */
export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', { page, action_name: actionFilter, entity_name: entityFilter }],
    queryFn: () =>
      cycleApi.listAuditLogs({
        page,
        limit: 20,
        action_name: actionFilter || undefined,
        entity_name: entityFilter || undefined,
      }),
    staleTime: 0,
  });

  const prettyJson = (str) => {
    if (!str) return 'null';
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  const columns = [
    { key: 'time', header: 'Timestamp', render: (r) => formatDateTime(r.created_at) },
    {
      key: 'user',
      header: 'User',
      render: (r) => r.user?.display_name || r.user?.email || 'System',
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (r) => <span className="font-mono text-xs">{r.entity_name}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs font-semibold">
          {r.action_name}
        </span>
      ),
    },
    {
      key: 'record',
      header: 'Record ID',
      render: (r) => <span className="font-mono text-xs text-ink-500">{r.record_id}</span>,
    },
    {
      key: 'diff',
      header: 'Details',
      render: (r) => {
        const isOpen = expandedId === r.id;
        return (
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon={isOpen ? ChevronUp : ChevronDown}
              onClick={() => setExpandedId(isOpen ? null : r.id)}
            >
              {isOpen ? 'Hide change' : 'View change'}
            </Button>
            {isOpen ? (
              <div className="mt-2 grid sm:grid-cols-2 gap-2 text-[11px] bg-surface-muted p-2.5 rounded border border-line max-w-xl">
                <div>
                  <span className="font-semibold text-ink-500 block mb-1">Previous</span>
                  <pre className="overflow-x-auto whitespace-pre-wrap">
                    {prettyJson(r.previous_value)}
                  </pre>
                </div>
                <div>
                  <span className="font-semibold text-ink-500 block mb-1">Updated</span>
                  <pre className="overflow-x-auto whitespace-pre-wrap">
                    {prettyJson(r.updated_value)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">Audit Log</h1>
        <p className="text-sm text-ink-500">
          Immutable, append-only record of every create, update, transition, evidence, and login
          event.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-card p-4 flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="border border-line rounded-input px-3 py-1.5 bg-surface"
        >
          <option value="">All Actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by entity (e.g. kpi_record)…"
          className="border border-line rounded-input px-3 py-1.5 text-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
        pagination={data?.meta}
        onPageChange={setPage}
        emptyTitle="No audit log entries match your filters"
      />
    </div>
  );
}

/** Emissions Calculator (`/tools/emissions` — frontend.md §6.18) */
export function EmissionsCalculatorPage() {
  const [scope, setScope] = useState(2);
  const [activityData, setActivityData] = useState('');
  const [activityUnit, setActivityUnit] = useState('kWh');
  const [factor, setFactor] = useState('');
  const [result, setResult] = useState(null);

  const calcMutation = useMutation({
    mutationFn: (body) => cycleApi.calcEmissions(body),
    onSuccess: (res) => setResult(res),
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const fillWorkedExample = () => {
    setScope(2);
    setActivityData('10000');
    setActivityUnit('kWh');
    setFactor('0.4');
    calcMutation.mutate({
      scope: 2,
      activity_data: 10000,
      activity_unit: 'kWh',
      emission_factor_kg_per_unit: 0.4,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">GHG Emissions Calculator</h1>
        <p className="text-sm text-ink-500">
          Stateless helper to convert activity data into kg CO₂e and tCO₂e.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Scope 1/2/3 Explainer Cards */}
        <div className="space-y-3">
          {[
            {
              scope: 'Scope 1 — Direct Emissions',
              desc: 'Direct GHG emissions from sources owned or controlled by your organisation (company vehicles, on-site fuel combustion, boilers, fugitive refrigerants).',
            },
            {
              scope: 'Scope 2 — Purchased Energy',
              desc: 'Indirect GHG emissions from the generation of purchased electricity, steam, heating, and cooling consumed by your organisation.',
            },
            {
              scope: 'Scope 3 — Value Chain Emissions',
              desc: 'All other indirect emissions across your upstream and downstream value chain (purchased goods, business travel, employee commuting, waste, logistics).',
            },
          ].map((card) => (
            <div
              key={card.scope}
              className="bg-surface border border-line rounded-card shadow-card p-5 space-y-1"
            >
              <h2 className="text-sm font-bold text-ink-900">{card.scope}</h2>
              <p className="text-xs text-ink-500">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Right: Calculator Form */}
        <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">Calculate Emissions</h2>
            <Button variant="secondary" size="sm" onClick={fillWorkedExample}>
              Worked example (10,000 kWh × 0.4)
            </Button>
          </div>

          <FormField label="Scope" required>
            {(props) => (
              <select
                {...props}
                value={scope}
                onChange={(e) => setScope(Number(e.target.value))}
                className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
              >
                <option value={1}>Scope 1 (Direct)</option>
                <option value={2}>Scope 2 (Purchased Energy)</option>
                <option value={3}>Scope 3 (Value Chain)</option>
              </select>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Activity Data (> 0)" required>
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="any"
                  min="0"
                  value={activityData}
                  onChange={(e) => setActivityData(e.target.value)}
                  placeholder="10000"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Activity Unit" required>
              {(props) => (
                <input
                  {...props}
                  value={activityUnit}
                  onChange={(e) => setActivityUnit(e.target.value)}
                  placeholder="kWh"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Emission Factor (kg CO₂e per unit)"
            required
            hint="Illustrative; use your country's published emission factor."
          >
            {(props) => (
              <input
                {...props}
                type="number"
                step="any"
                min="0"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                placeholder="0.4"
                className="w-full border border-line rounded-input px-3 py-2 text-sm"
              />
            )}
          </FormField>

          <Button
            icon={Calculator}
            loading={calcMutation.isPending}
            onClick={() =>
              calcMutation.mutate({
                scope,
                activity_data: Number(activityData),
                activity_unit: activityUnit,
                emission_factor_kg_per_unit: Number(factor),
              })
            }
          >
            Calculate
          </Button>

          {result ? (
            <div className="bg-brand-50 border border-brand-600/30 rounded-card p-4 space-y-2 text-sm">
              <p className="text-xs font-mono text-ink-500">{result.formula}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-500">Total Emissions</p>
                  <p className="text-2xl font-bold text-brand-600">
                    {formatNumber(result.emissions_tco2e)} tCO₂e
                  </p>
                  <p className="text-xs text-ink-500">
                    ({formatNumber(result.emissions_kg)} kg CO₂e)
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(String(result.emissions_tco2e));
                    toast.success('Copied tCO₂e value to clipboard.');
                  }}
                >
                  Copy value
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

