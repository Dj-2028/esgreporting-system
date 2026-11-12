import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Lock, Users } from 'lucide-react';
import { ROLES } from '../../lib/constants.js';
import { cycleApi, masterApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { formatDate } from '../../lib/formatters.js';
import { getFriendlyErrorMessage } from '../../lib/errors.js';
import {
  Button,
  DataTable,
  ErrorState,
  FormField,
  PillarBadge,
  Skeleton,
  StatusChip,
} from '../../components/shared.jsx';

export function PeriodsListPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['periods', { page }],
    queryFn: () => cycleApi.listPeriods({ page, limit: 20 }),
  });

  const columns = [
    {
      key: 'period_name',
      header: 'Period Name',
      render: (r) => <span className="font-semibold text-ink-900">{r.period_name}</span>,
    },
    { key: 'start', header: 'Start Date', render: (r) => formatDate(r.period_start_date) },
    { key: 'end', header: 'End Date', render: (r) => formatDate(r.period_end_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.period_status} /> },
    { key: 'records_count', header: 'KPIs', render: (r) => r.records_count ?? 0 },
    {
      key: 'approved_pct',
      header: 'Approved %',
      render: (r) => <span className="font-semibold text-brand-600">{r.approved_pct ?? 0}%</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Reporting Periods</h1>
          <p className="text-sm text-ink-500">Manage reporting cycles and KPI assignments.</p>
        </div>
        {isAdmin ? (
          <Button icon={Plus} onClick={() => navigate('/periods/new')}>
            New Period
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
        pagination={data?.meta}
        onPageChange={setPage}
        onRowClick={(r) => navigate(`/periods/${r._id}`)}
        emptyTitle="No reporting periods created yet"
        emptyAction={
          isAdmin ? (
            <Button icon={Plus} onClick={() => navigate('/periods/new')}>
              Create Period
            </Button>
          ) : null
        }
      />
    </div>
  );
}

/** 4-Step New Period Wizard (frontend.md §6.6) */
export function NewPeriodWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [createdPeriodId, setCreatedPeriodId] = useState(null);
  const [details, setDetails] = useState({
    period_name: '',
    period_start_date: '',
    period_end_date: '',
  });
  const [selectedKpis, setSelectedKpis] = useState({});
  const [assignments, setAssignments] = useState({});
  const [copyFromPeriodId, setCopyFromPeriodId] = useState('');
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkApproverId, setBulkApproverId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');

  const { data: kpisRes } = useQuery({
    queryKey: ['kpis', { is_active: true, limit: 100 }],
    queryFn: () => masterApi.listKpis({ is_active: true, limit: 100 }),
  });
  const { data: usersRes } = useQuery({
    queryKey: ['users', { is_active: true, limit: 100 }],
    queryFn: () => masterApi.listUsers({ is_active: true, limit: 100 }),
  });
  const { data: periodsRes } = useQuery({
    queryKey: ['periods', { limit: 50 }],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
  });

  const activeKpis = kpisRes?.data || [];
  const activeUsers = usersRes?.data || [];
  const existingPeriods = periodsRes?.data || [];

  const ownerCandidates = activeUsers.filter(
    (u) => u.roles?.includes(ROLES.DATA_OWNER) || u.roles?.includes(ROLES.ADMIN),
  );
  const approverCandidates = activeUsers.filter(
    (u) => u.roles?.includes(ROLES.APPROVER) || u.roles?.includes(ROLES.ADMIN),
  );

  const selectedKpiList = activeKpis.filter((k) => selectedKpis[k._id]);

  const handleCopyFromPeriod = async (periodId) => {
    setCopyFromPeriodId(periodId);
    if (!periodId) return;
    try {
      const prevRecs = await cycleApi.listRecords({ reporting_period_id: periodId, limit: 100 });
      const nextAssign = { ...assignments };
      for (const r of prevRecs.data || []) {
        const kpiId = r.kpi?.id;
        if (kpiId) {
          nextAssign[kpiId] = {
            data_owner_user_id: r.data_owner?.is_active ? r.data_owner.id : '',
            approver_user_id: r.approver?.is_active ? r.approver.id : '',
          };
        }
      }
      setAssignments(nextAssign);
      toast.success('Copied owner and approver assignments from previous period.');
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  const applyBulkAssign = () => {
    if (!bulkOwnerId && !bulkApproverId) return;
    const next = { ...assignments };
    for (const k of selectedKpiList) {
      next[k._id] = {
        data_owner_user_id: bulkOwnerId || next[k._id]?.data_owner_user_id || '',
        approver_user_id: bulkApproverId || next[k._id]?.approver_user_id || '',
      };
    }
    setAssignments(next);
  };

  const validateStep = () => {
    setStepError('');
    if (step === 1) {
      if (!details.period_name.trim()) {
        setStepError('Period name is required.');
        return false;
      }
      if (!details.period_start_date || !details.period_end_date) {
        setStepError('Start and end dates are required.');
        return false;
      }
      if (details.period_end_date < details.period_start_date) {
        setStepError('End date must be on or after start date.');
        return false;
      }
    }
    if (step === 2) {
      if (selectedKpiList.length === 0) {
        setStepError('Select at least one KPI.');
        return false;
      }
    }
    if (step === 3) {
      for (const k of selectedKpiList) {
        const a = assignments[k._id] || {};
        if (!a.data_owner_user_id || !a.approver_user_id) {
          setStepError(`Assign both a Data Owner and an Approver for ${k.kpi_code}.`);
          return false;
        }
        if (a.data_owner_user_id === a.approver_user_id) {
          setStepError(
            `OWNER_EQUALS_APPROVER: Data Owner and Approver cannot be the same person on ${k.kpi_code}.`,
          );
          return false;
        }
      }
    }
    return true;
  };

  const handleCreateAndAssign = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    setStepError('');
    try {
      let periodId = createdPeriodId;
      if (!periodId) {
        const created = await cycleApi.createPeriod(details);
        periodId = created._id;
        setCreatedPeriodId(periodId);
      }

      const payload = {
        assignments: selectedKpiList.map((k) => ({
          kpi_id: k._id,
          data_owner_user_id: assignments[k._id].data_owner_user_id,
          approver_user_id: assignments[k._id].approver_user_id,
        })),
        ...(copyFromPeriodId ? { copy_from_period_id: copyFromPeriodId } : {}),
      };

      const res = await cycleApi.generateRecords(periodId, payload);
      queryClient.invalidateQueries({ queryKey: ['periods'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${res.created_count} KPI records created, owners notified.`);
      navigate(`/periods/${periodId}`);
    } catch (err) {
      setStepError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">Open New Reporting Period</h1>
        <p className="text-sm text-ink-500">Step {step} of 4</p>
      </div>

      {stepError ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-input p-3"
        >
          {stepError}
        </div>
      ) : null}

      <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-5">
        {step === 1 ? (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-base font-semibold text-ink-900">1. Period Details</h2>
            <FormField label="Period Name" required>
              {(props) => (
                <input
                  {...props}
                  value={details.period_name}
                  onChange={(e) => setDetails({ ...details, period_name: e.target.value })}
                  placeholder="FY2026 Q1"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" required>
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    value={details.period_start_date}
                    onChange={(e) => setDetails({ ...details, period_start_date: e.target.value })}
                    className="w-full border border-line rounded-input px-3 py-2 text-sm"
                  />
                )}
              </FormField>
              <FormField label="End Date" required>
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    value={details.period_end_date}
                    onChange={(e) => setDetails({ ...details, period_end_date: e.target.value })}
                    className="w-full border border-line rounded-input px-3 py-2 text-sm"
                  />
                )}
              </FormField>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">2. Select KPIs to Include</h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const all = {};
                  activeKpis.forEach((k) => {
                    all[k._id] = true;
                  });
                  setSelectedKpis(all);
                }}
              >
                Select All ({activeKpis.length})
              </Button>
            </div>
            <div className="divide-y divide-line border border-line rounded-input max-h-96 overflow-y-auto">
              {activeKpis.map((k) => (
                <label
                  key={k._id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-muted cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedKpis[k._id])}
                      onChange={(e) =>
                        setSelectedKpis({ ...selectedKpis, [k._id]: e.target.checked })
                      }
                    />
                    <span className="font-mono font-semibold text-xs">{k.kpi_code}</span>
                    <span className="font-medium text-ink-900">{k.kpi_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-500">{k.unit_of_measurement}</span>
                    {k.pillar ? (
                      <PillarBadge code={k.pillar.pillar_code} showLabel={false} />
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-ink-900">
              3. Assign Data Owner & Approver per KPI
            </h2>
            <div className="bg-surface-muted border border-line rounded-input p-3 flex flex-wrap items-end gap-3 text-xs">
              {existingPeriods.length > 0 ? (
                <div>
                  <label className="block font-medium text-ink-900 mb-1">
                    Copy from previous period
                  </label>
                  <select
                    value={copyFromPeriodId}
                    onChange={(e) => handleCopyFromPeriod(e.target.value)}
                    className="border border-line rounded-input px-2.5 py-1.5 bg-surface"
                  >
                    <option value="">— Select period —</option>
                    {existingPeriods.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.period_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="block font-medium text-ink-900 mb-1">Bulk Owner</label>
                <select
                  value={bulkOwnerId}
                  onChange={(e) => setBulkOwnerId(e.target.value)}
                  className="border border-line rounded-input px-2.5 py-1.5 bg-surface"
                >
                  <option value="">— Owner —</option>
                  {ownerCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-ink-900 mb-1">Bulk Approver</label>
                <select
                  value={bulkApproverId}
                  onChange={(e) => setBulkApproverId(e.target.value)}
                  className="border border-line rounded-input px-2.5 py-1.5 bg-surface"
                >
                  <option value="">— Approver —</option>
                  {approverCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={applyBulkAssign}>
                Apply to all selected KPIs
              </Button>
            </div>

            <div className="space-y-2">
              {selectedKpiList.map((k) => {
                const a = assignments[k._id] || { data_owner_user_id: '', approver_user_id: '' };
                const sameError =
                  a.data_owner_user_id &&
                  a.approver_user_id &&
                  a.data_owner_user_id === a.approver_user_id;

                return (
                  <div
                    key={k._id}
                    className="border border-line rounded-input p-3 grid sm:grid-cols-3 gap-3 items-center text-sm"
                  >
                    <div>
                      <span className="font-mono font-semibold text-xs">{k.kpi_code}</span>{' '}
                      <span className="font-medium">{k.kpi_name}</span>
                      {sameError ? (
                        <p className="text-xs text-red-700 font-medium mt-0.5">
                          Owner and Approver must be different users
                        </p>
                      ) : null}
                    </div>
                    <select
                      aria-label={`Data Owner for ${k.kpi_code}`}
                      value={a.data_owner_user_id}
                      onChange={(e) =>
                        setAssignments({
                          ...assignments,
                          [k._id]: { ...a, data_owner_user_id: e.target.value },
                        })
                      }
                      className="border border-line rounded-input px-2.5 py-1.5 text-sm bg-surface"
                    >
                      <option value="">Select Data Owner…</option>
                      {ownerCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name} ({u.department?.department_code || 'No dept'})
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Approver for ${k.kpi_code}`}
                      value={a.approver_user_id}
                      onChange={(e) =>
                        setAssignments({
                          ...assignments,
                          [k._id]: { ...a, approver_user_id: e.target.value },
                        })
                      }
                      className="border border-line rounded-input px-2.5 py-1.5 text-sm bg-surface"
                    >
                      <option value="">Select Approver…</option>
                      {approverCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name} ({u.department?.department_code || 'No dept'})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4 text-sm">
            <h2 className="text-base font-semibold text-ink-900">4. Review & Open Cycle</h2>
            <p>
              Period: <strong>{details.period_name}</strong> ({details.period_start_date} to{' '}
              {details.period_end_date})
            </p>
            <p>
              Total KPI records to generate: <strong>{selectedKpiList.length}</strong>
            </p>
          </div>
        ) : null}

        <div className="flex justify-between pt-4 border-t border-line">
          <Button
            variant="secondary"
            onClick={() => (step === 1 ? navigate('/periods') : setStep(step - 1))}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => {
                if (validateStep()) setStep(step + 1);
              }}
            >
              Next
            </Button>
          ) : (
            <Button onClick={handleCreateAndAssign} loading={submitting}>
              Create Period & Generate KPI Records
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Period Detail Page (frontend.md §6.7) */
export function PeriodDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));

  const [closeOpen, setCloseOpen] = useState(false);
  const [forceClose, setForceClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [openRecordsWarning, setOpenRecordsWarning] = useState([]);
  const [reassignTarget, setReassignTarget] = useState(null);

  const { data: period, isLoading, error } = useQuery({
    queryKey: ['period', id],
    queryFn: () => cycleApi.getPeriod(id),
  });

  const { data: recordsRes, isLoading: recLoading } = useQuery({
    queryKey: ['records', { reporting_period_id: id }],
    queryFn: () => cycleApi.listRecords({ reporting_period_id: id, limit: 100 }),
  });

  const { data: usersRes } = useQuery({
    queryKey: ['users', { for: 'assignment' }],
    enabled: Boolean(isAdmin),
    queryFn: () => masterApi.listUsers({ for: 'assignment', limit: 100 }),
  });

  const closeMutation = useMutation({
    mutationFn: (body) => cycleApi.closePeriod(id, body),
    onSuccess: () => {
      toast.success('Reporting period closed.');
      setCloseOpen(false);
      queryClient.invalidateQueries({ queryKey: ['period', id] });
      queryClient.invalidateQueries({ queryKey: ['periods'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      const code = err?.response?.data?.error?.code;
      const details = err?.response?.data?.error?.details;
      if (code === 'OPEN_RECORDS_EXIST' && Array.isArray(details)) {
        setOpenRecordsWarning(details);
      } else {
        toast.error(getFriendlyErrorMessage(err));
      }
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ recordId, data_owner_user_id, approver_user_id }) =>
      cycleApi.reassignRecord(recordId, { data_owner_user_id, approver_user_id }),
    onSuccess: () => {
      toast.success('Assignment updated.');
      setReassignTarget(null);
      queryClient.invalidateQueries({ queryKey: ['records'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  if (isLoading) return <Skeleton rows={5} />;
  if (error) return <ErrorState message={getFriendlyErrorMessage(error)} />;

  const users = usersRes?.data || [];

  const columns = [
    {
      key: 'code',
      header: 'KPI Code',
      render: (r) => <span className="font-mono font-semibold text-xs">{r.kpi?.kpi_code}</span>,
    },
    { key: 'name', header: 'KPI Name', render: (r) => r.kpi?.kpi_name },
    {
      key: 'pillar',
      header: 'Pillar',
      render: (r) =>
        r.pillar ? <PillarBadge code={r.pillar.pillar_code} showLabel={false} /> : '—',
    },
    { key: 'owner', header: 'Data Owner', render: (r) => r.data_owner?.display_name || '—' },
    { key: 'approver', header: 'Approver', render: (r) => r.approver?.display_name || '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.submission_status} /> },
    ...(isAdmin && period.period_status === 'In Progress'
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (r) =>
              r.submission_status !== 'Approved' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Users}
                  onClick={(e) => {
                    e.stopPropagation();
                    setReassignTarget({
                      recordId: r.id,
                      kpi_code: r.kpi?.kpi_code,
                      data_owner_user_id: r.data_owner?.id || '',
                      approver_user_id: r.approver?.id || '',
                    });
                  }}
                >
                  Reassign
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-line rounded-card shadow-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900">{period.period_name}</h1>
            <StatusChip status={period.period_status} />
          </div>
          <p className="text-sm text-ink-500 mt-1">
            {formatDate(period.period_start_date)} – {formatDate(period.period_end_date)} ·{' '}
            {period.approved_count || 0} of {period.records_count || 0} Approved (
            {period.approved_pct || 0}%)
          </p>
        </div>

        {isAdmin && period.period_status === 'In Progress' ? (
          <Button variant="danger" icon={Lock} onClick={() => setCloseOpen(true)}>
            Close Period
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={recordsRes?.data || []}
        isLoading={recLoading}
        onRowClick={(r) => navigate(`/records/${r.id}`)}
        emptyTitle="No KPI records in this period"
      />

      {/* Close Period Dialog */}
      {closeOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-line rounded-card shadow-card max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-900">Close Period "{period.period_name}"</h2>
            <p className="text-sm text-ink-500">
              Closing locks all KPI records in this period permanently.
            </p>
            {openRecordsWarning.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-input p-3 space-y-2 text-xs">
                <p className="font-semibold text-amber-900">
                  {openRecordsWarning.length} record(s) are not yet Approved:
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-900 max-h-32 overflow-y-auto">
                  {openRecordsWarning.map((r) => (
                    <li key={r.record_id}>
                      {r.kpi_code} — {r.status} ({r.owner})
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 pt-2 font-medium text-ink-900">
                  <input
                    type="checkbox"
                    checked={forceClose}
                    onChange={(e) => setForceClose(e.target.checked)}
                  />
                  Force close period anyway (unfinished records will be reported as gaps)
                </label>
                {forceClose ? (
                  <textarea
                    rows={2}
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder="Mandatory reason (minimum 5 characters)…"
                    className="w-full border border-line rounded-input px-2.5 py-1.5 text-xs bg-surface"
                  />
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCloseOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={closeMutation.isPending}
                onClick={() =>
                  closeMutation.mutate({
                    force: forceClose,
                    reason: forceClose ? closeReason : undefined,
                  })
                }
              >
                Confirm Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reassign Dialog */}
      {reassignTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-line rounded-card shadow-card max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-900">
              Reassign {reassignTarget.kpi_code}
            </h2>
            <FormField label="Data Owner">
              {(props) => (
                <select
                  {...props}
                  value={reassignTarget.data_owner_user_id}
                  onChange={(e) =>
                    setReassignTarget({ ...reassignTarget, data_owner_user_id: e.target.value })
                  }
                  className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Approver">
              {(props) => (
                <select
                  {...props}
                  value={reassignTarget.approver_user_id}
                  onChange={(e) =>
                    setReassignTarget({ ...reassignTarget, approver_user_id: e.target.value })
                  }
                  className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReassignTarget(null)}>
                Cancel
              </Button>
              <Button
                loading={reassignMutation.isPending}
                onClick={() => reassignMutation.mutate(reassignTarget)}
              >
                Save Assignment
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

