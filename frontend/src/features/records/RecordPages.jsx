import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  Save,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Lock,
  FileText,
  Download,
  Trash2,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { ROLES, RECORD_STATUS } from '../../lib/constants.js';
import { cycleApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { formatDate, formatDateTime, formatNumber, formatBytes } from '../../lib/formatters.js';
import { getFriendlyErrorMessage } from '../../lib/errors.js';
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FileDropzone,
  FormField,
  PillarBadge,
  Skeleton,
  StatusChip,
} from '../../components/shared.jsx';

/** My Tasks (`/my-tasks` — frontend.md §6.8) */
export function MyTasksPage() {
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const navigate = useNavigate();
  const [tab, setTab] = useState('todo');

  const { data: periodsRes } = useQuery({
    queryKey: ['periods'],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
  });
  const activePeriodId = selectedPeriodId || periodsRes?.data?.[0]?._id;

  const { data: recordsRes, isLoading, error, refetch } = useQuery({
    queryKey: ['records', { reporting_period_id: activePeriodId, scope: 'mine' }],
    enabled: Boolean(activePeriodId),
    queryFn: () =>
      cycleApi.listRecords({ reporting_period_id: activePeriodId, scope: 'mine', limit: 100 }),
  });

  const all = recordsRes?.data || [];
  const rejected = all.filter((r) => r.submission_status === RECORD_STATUS.REJECTED);
  const todo = all.filter((r) => r.submission_status === RECORD_STATUS.IN_PROGRESS);
  const waiting = all.filter((r) => r.submission_status === RECORD_STATUS.READY_FOR_APPROVAL);
  const done = all.filter((r) => r.submission_status === RECORD_STATUS.APPROVED);

  const tabData = {
    rejected,
    todo,
    waiting,
    done,
  }[tab];

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
    {
      key: 'value',
      header: 'Actual Value',
      render: (r) =>
        r.actual_value !== null && r.actual_value !== undefined
          ? `${formatNumber(r.actual_value)} ${r.kpi?.unit_of_measurement}`
          : 'Not entered',
    },
    { key: 'evidence', header: 'Evidence', render: (r) => `${r.evidence_count || 0} file(s)` },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.submission_status} /> },
    {
      key: 'open',
      header: '',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/records/${r.id}`)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">My Tasks</h1>
        <p className="text-sm text-ink-500">
          KPI records assigned to you as Data Owner for the selected period.
        </p>
      </div>

      {!activePeriodId ? (
        <EmptyState title="No reporting period selected" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line pb-2">
            {[
              { key: 'todo', label: `To do (${todo.length})` },
              { key: 'rejected', label: `Rejected (${rejected.length})`, dot: rejected.length > 0 },
              { key: 'waiting', label: `Waiting (${waiting.length})` },
              { key: 'done', label: `Done (${done.length})` },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input text-sm font-medium',
                  tab === t.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface border border-line text-ink-900 hover:bg-surface-muted',
                )}
              >
                {t.dot ? <span className="w-2 h-2 rounded-full bg-red-500" /> : null}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={tabData || []}
            isLoading={isLoading}
            error={error ? getFriendlyErrorMessage(error) : null}
            onRetry={refetch}
            onRowClick={(r) => navigate(`/records/${r.id}`)}
            emptyTitle={`No records in "${tab}"`}
          />
        </>
      )}
    </div>
  );
}

/** Approval Queue (`/approvals` — frontend.md §6.9) */
export function ApprovalQueuePage() {
  const selectedPeriodId = useUiStore((s) => s.selectedPeriodId);
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');

  const { data: periodsRes } = useQuery({
    queryKey: ['periods'],
    queryFn: () => cycleApi.listPeriods({ limit: 50 }),
  });
  const activePeriodId = selectedPeriodId || periodsRes?.data?.[0]?._id;

  const { data: recordsRes, isLoading, error, refetch } = useQuery({
    queryKey: ['records', { reporting_period_id: activePeriodId, scope: 'my_approvals' }],
    enabled: Boolean(activePeriodId),
    queryFn: () =>
      cycleApi.listRecords({
        reporting_period_id: activePeriodId,
        scope: 'my_approvals',
        sort: 'submitted_at',
        limit: 100,
      }),
  });

  const all = recordsRes?.data || [];
  const pending = all.filter((r) => r.submission_status === RECORD_STATUS.READY_FOR_APPROVAL);
  const decided = all.filter((r) =>
    [RECORD_STATUS.APPROVED, RECORD_STATUS.REJECTED].includes(r.submission_status),
  );

  const columns = [
    {
      key: 'code',
      header: 'KPI',
      render: (r) => (
        <div>
          <span className="font-mono font-semibold text-xs">{r.kpi?.kpi_code}</span>{' '}
          <span className="font-medium">{r.kpi?.kpi_name}</span>
        </div>
      ),
    },
    {
      key: 'pillar',
      header: 'Pillar',
      render: (r) =>
        r.pillar ? <PillarBadge code={r.pillar.pillar_code} showLabel={false} /> : '—',
    },
    { key: 'owner', header: 'Data Owner', render: (r) => r.data_owner?.display_name || '—' },
    {
      key: 'value',
      header: 'Submitted Value',
      render: (r) =>
        r.actual_value !== null && r.actual_value !== undefined
          ? `${formatNumber(r.actual_value)} ${r.kpi?.unit_of_measurement}`
          : '—',
    },
    { key: 'submitted', header: 'Submitted At', render: (r) => formatDateTime(r.submitted_at) },
    { key: 'evidence', header: 'Evidence', render: (r) => `${r.evidence_count || 0} file(s)` },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.submission_status} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">Approval Queue</h1>
        <p className="text-sm text-ink-500">
          Review submitted KPI values and evidence files assigned to you.
        </p>
      </div>

      <div className="flex gap-2 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={clsx(
            'px-3 py-1.5 rounded-input text-sm font-medium',
            tab === 'pending'
              ? 'bg-brand-600 text-white'
              : 'bg-surface border border-line text-ink-900',
          )}
        >
          Pending Review ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('decided')}
          className={clsx(
            'px-3 py-1.5 rounded-input text-sm font-medium',
            tab === 'decided'
              ? 'bg-brand-600 text-white'
              : 'bg-surface border border-line text-ink-900',
          )}
        >
          Decided ({decided.length})
        </button>
      </div>

      <DataTable
        columns={columns}
        data={tab === 'pending' ? pending : decided}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
        onRowClick={(r) => navigate(`/records/${r.id}`)}
        emptyTitle={
          tab === 'pending' ? 'No records awaiting your approval' : 'No decided records yet'
        }
      />
    </div>
  );
}

/**
 * Pure helper exported for unit/component testing of the sticky action bar
 * across every (role × status × period_status) combination (frontend.md §6.10, §12).
 */
export function RecordActionBar({
  viewerUserId,
  viewerRoles = [],
  record,
  onSaveDraft,
  onSubmit,
  onApprove,
  onReject,
  onReopen,
  saving = false,
  transitioning = false,
}) {
  const status = record?.submission_status;
  const periodClosed = record?.period?.period_status === 'Closed';
  const isOwner = String(viewerUserId) === String(record?.data_owner_user_id || record?.data_owner?.id);
  const isApprover =
    String(viewerUserId) === String(record?.approver_user_id || record?.approver?.id);
  const isAdmin = viewerRoles.includes(ROLES.ADMIN);

  const hasValue = record?.actual_value !== null && record?.actual_value !== undefined && record?.actual_value !== '';
  const evidenceCount = record?.evidence?.length ?? record?.evidence_count ?? 0;
  const canSubmitReady = hasValue && evidenceCount >= 1;

  let missingTooltip = '';
  if (!hasValue && evidenceCount < 1) {
    missingTooltip = 'Enter an actual value and upload at least 1 evidence file to submit';
  } else if (!hasValue) {
    missingTooltip = 'Enter an actual value to submit';
  } else if (evidenceCount < 1) {
    missingTooltip = 'Upload at least 1 evidence file to submit';
  }

  if (periodClosed) {
    return (
      <div className="bg-surface border border-line rounded-card p-4 flex items-center justify-between text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Lock className="w-4 h-4" /> Closed period — record is read-only
        </span>
      </div>
    );
  }

  const editableStates = [RECORD_STATUS.IN_PROGRESS, RECORD_STATUS.REJECTED];

  return (
    <div className="sticky bottom-2 z-20 bg-surface border border-line rounded-card shadow-card p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-ink-500">
        {isOwner && status === RECORD_STATUS.READY_FOR_APPROVAL ? (
          <span className="font-medium text-amber-800">
            Waiting for {record?.approver?.display_name || 'approver'}
          </span>
        ) : null}
        {status === RECORD_STATUS.APPROVED ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
            <Lock className="w-4 h-4" /> Approved — record is locked
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isOwner && editableStates.includes(status) ? (
          <>
            <Button
              variant="secondary"
              icon={Save}
              loading={saving}
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
            <span title={missingTooltip || undefined}>
              <Button
                variant="primary"
                icon={Send}
                disabled={!canSubmitReady}
                loading={transitioning}
                onClick={onSubmit}
              >
                Submit for approval
              </Button>
            </span>
          </>
        ) : null}

        {isApprover && !isOwner && status === RECORD_STATUS.READY_FOR_APPROVAL ? (
          <>
            <Button
              variant="danger"
              icon={XCircle}
              loading={transitioning}
              onClick={onReject}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={transitioning}
              onClick={onApprove}
            >
              Approve
            </Button>
          </>
        ) : null}

        {isAdmin && status === RECORD_STATUS.APPROVED ? (
          <Button
            variant="secondary"
            icon={RotateCcw}
            loading={transitioning}
            onClick={onReopen}
          >
            Reopen
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** KPI Record Page (`/records/:id` — frontend.md §6.10) */
export function RecordPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [actualInput, setActualInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [baselineInput, setBaselineInput] = useState('');
  const [historyTab, setHistoryTab] = useState('approvals');
  const [dialogMode, setDialogMode] = useState(null); // 'approve' | 'reject' | 'reopen' | 'stale'
  const [deleteEvTarget, setDeleteEvTarget] = useState(null);
  const [previewEv, setPreviewEv] = useState(null); // { url, mime, name }

  const {
    data: record,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['record', id],
    queryFn: () => cycleApi.getRecord(id),
    staleTime: 0,
  });

  const { data: historyRows } = useQuery({
    queryKey: ['record-history', id],
    queryFn: () => cycleApi.listRecordHistory(id),
    staleTime: 0,
  });

  useEffect(() => {
    if (record) {
      setActualInput(
        record.actual_value !== null && record.actual_value !== undefined
          ? String(record.actual_value)
          : '',
      );
      setTargetInput(
        record.target_value !== null && record.target_value !== undefined
          ? String(record.target_value)
          : '',
      );
      setBaselineInput(
        record.baseline_value !== null && record.baseline_value !== undefined
          ? String(record.baseline_value)
          : '',
      );
    }
  }, [record]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['record', id] });
    queryClient.invalidateQueries({ queryKey: ['record-history', id] });
    queryClient.invalidateQueries({ queryKey: ['records'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['periods'] });
  };

  const parseOptionalNum = (s) => (s === '' || s === null || s === undefined ? null : Number(s));

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      cycleApi.patchRecordValues(id, {
        actual_value: parseOptionalNum(actualInput),
        target_value: parseOptionalNum(targetInput),
        baseline_value: parseOptionalNum(baselineInput),
        updated_at: record.updated_at,
      }),
    onSuccess: () => {
      toast.success('Draft saved.');
      invalidateAll();
    },
    onError: (err) => {
      if (err?.response?.data?.error?.code === 'STALE_RECORD') {
        setDialogMode('stale');
      } else {
        toast.error(getFriendlyErrorMessage(err));
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => cycleApi.uploadEvidence(id, file),
    onSuccess: () => {
      toast.success('Evidence uploaded.');
      invalidateAll();
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const deleteEvMutation = useMutation({
    mutationFn: (evId) => cycleApi.deleteEvidence(evId),
    onSuccess: () => {
      toast.success('Evidence removed.');
      setDeleteEvTarget(null);
      invalidateAll();
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Save any pending input change first if dirty
      const nextActual = parseOptionalNum(actualInput);
      if (nextActual !== record.actual_value) {
        await cycleApi.patchRecordValues(id, {
          actual_value: nextActual,
          target_value: parseOptionalNum(targetInput),
          baseline_value: parseOptionalNum(baselineInput),
          updated_at: record.updated_at,
        });
      }
      return cycleApi.submitRecord(id);
    },
    onSuccess: () => {
      toast.success('Record submitted for approval.');
      invalidateAll();
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ action, text }) => {
      if (action === 'approve') return cycleApi.approveRecord(id, { comments: text || '' });
      if (action === 'reject') return cycleApi.rejectRecord(id, { comments: text });
      if (action === 'reopen') return cycleApi.reopenRecord(id, { reason: text });
      throw new Error('Unknown transition');
    },
    onSuccess: (_, vars) => {
      toast.success(`Record ${vars.action}d.`);
      setDialogMode(null);
      invalidateAll();
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const handleDownloadEvidence = async (ev, inline = false) => {
    try {
      const res = await cycleApi.downloadEvidenceBlob(ev.id, inline);
      const blob = new Blob([res.data], { type: ev.mime_type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      if (inline) {
        setPreviewEv({ url, mime: ev.mime_type, name: ev.file_name });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = ev.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  if (isLoading) return <Skeleton rows={6} />;
  if (error) return <ErrorState message={getFriendlyErrorMessage(error)} onRetry={refetch} />;

  const canEdit = Boolean(record?.permissions?.can_edit);
  const latestRejection =
    record?.submission_status === RECORD_STATUS.REJECTED
      ? (record.approvals || []).find((a) => a.approval_status === 'Rejected')
      : null;

  const changePct = record?.change_pct_vs_previous;
  const highVariance = changePct !== null && changePct !== undefined && Math.abs(changePct) > 50;

  // Build live record snapshot for action bar button enablement
  const liveRecordForBar = {
    ...record,
    actual_value: actualInput !== '' ? Number(actualInput) : null,
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Rejection Banner */}
      {latestRejection ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-300 rounded-card p-4 flex items-start gap-3"
        >
          <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-900">
              Rejected by {latestRejection.approver?.display_name || 'Approver'} on{' '}
              {formatDateTime(latestRejection.reviewed_at)}
            </p>
            <p className="text-red-800 mt-1">"{latestRejection.comments}"</p>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-bold px-2.5 py-1 rounded bg-surface-muted border border-line">
              {record.kpi?.kpi_code}
            </span>
            <h1 className="text-xl font-bold text-ink-900">{record.kpi?.kpi_name}</h1>
            {record.pillar ? <PillarBadge code={record.pillar.pillar_code} /> : null}
          </div>
          <StatusChip status={record.submission_status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500 pt-2 border-t border-line">
          <span>
            Period: <strong className="text-ink-900">{record.period?.period_name}</strong>
          </span>
          <span>
            Data Owner: <strong className="text-ink-900">{record.data_owner?.display_name}</strong>
          </span>
          <span>
            Approver: <strong className="text-ink-900">{record.approver?.display_name}</strong>
          </span>
          <span>
            Frequency: <strong className="text-ink-900">{record.kpi?.frequency}</strong>
          </span>
          {(record.disclosures || []).length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span>Disclosures:</span>
              {record.disclosures.map((d) => (
                <span
                  key={d.id}
                  className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold"
                >
                  {d.disclosure_code}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Two-Column Main Area */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Info & Value Form */}
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-card shadow-card p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-ink-900">KPI Guidance & Previous Period</h2>
            <p className="text-xs text-ink-500">
              {record.kpi?.calculation_method || 'No calculation guidance specified.'}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-line">
              <span>
                Previous period value:{' '}
                <strong className="text-ink-900">
                  {record.previous_period
                    ? `${formatNumber(record.previous_period.actual_value)} ${record.kpi?.unit_of_measurement} (${record.previous_period.period_name})`
                    : 'None'}
                </strong>
              </span>
              {changePct !== null && changePct !== undefined ? (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold',
                    highVariance
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-gray-100 text-ink-900',
                  )}
                >
                  {highVariance ? <AlertTriangle className="w-3.5 h-3.5" /> : null}
                  Changed {changePct > 0 ? `+${changePct}%` : `${changePct}%`} vs previous period
                </span>
              ) : null}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">KPI Values</h2>
              {!canEdit ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500">
                  <Lock className="w-3.5 h-3.5" />
                  {record.period?.period_status === 'Closed'
                    ? 'Closed period'
                    : record.submission_status === 'Approved'
                      ? 'Approved'
                      : record.submission_status === 'Ready for Approval'
                        ? 'Waiting for approver'
                        : 'Read-only'}
                </span>
              ) : null}
            </div>

            <FormField
              label={`Actual Value (${record.kpi?.unit_of_measurement})`}
              required
              hint={
                record.kpi?.unit_of_measurement === '%'
                  ? 'Percentage value between 0 and 100 (up to 6 decimals)'
                  : 'Non-negative number (up to 6 decimal places)'
              }
            >
              {(props) => (
                <div className="flex items-center">
                  <input
                    {...props}
                    type="number"
                    step="any"
                    min="0"
                    max={record.kpi?.unit_of_measurement === '%' ? '100' : undefined}
                    disabled={!canEdit}
                    value={actualInput}
                    onChange={(e) => setActualInput(e.target.value)}
                    className="w-full border border-line rounded-l-input px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                  <span className="bg-surface-muted border border-l-0 border-line rounded-r-input px-3 py-2 text-xs font-semibold text-ink-500">
                    {record.kpi?.unit_of_measurement}
                  </span>
                </div>
              )}
            </FormField>

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label={`Target Value (${record.kpi?.unit_of_measurement})`}>
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    step="any"
                    min="0"
                    disabled={!canEdit}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="w-full border border-line rounded-input px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                )}
              </FormField>
              <FormField label={`Baseline Value (${record.kpi?.unit_of_measurement})`}>
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    step="any"
                    min="0"
                    disabled={!canEdit}
                    value={baselineInput}
                    onChange={(e) => setBaselineInput(e.target.value)}
                    className="w-full border border-line rounded-input px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                )}
              </FormField>
            </div>
          </div>
        </div>

        {/* Right: Evidence & History */}
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-ink-900">
              Evidence Files ({(record.evidence || []).length})
            </h2>

            {canEdit ? (
              <FileDropzone
                currentCount={(record.evidence || []).length}
                uploading={uploadMutation.isPending}
                onUpload={(file) => uploadMutation.mutate(file)}
              />
            ) : null}

            {(record.evidence || []).length === 0 ? (
              <p className="text-xs text-ink-500">
                No evidence files attached yet. At least 1 file is required to submit.
              </p>
            ) : (
              <ul className="divide-y divide-line border border-line rounded-input">
                {record.evidence.map((ev) => {
                  const canPreview =
                    ev.mime_type === 'application/pdf' || ev.mime_type?.startsWith('image/');
                  return (
                    <li
                      key={ev.id}
                      className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                        <div className="truncate">
                          <p className="font-semibold text-ink-900 truncate">{ev.file_name}</p>
                          <p className="text-ink-500">
                            {formatBytes(ev.file_size_bytes)} · {ev.uploaded_by?.display_name} ·{' '}
                            {formatDate(ev.uploaded_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canPreview ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Eye}
                            onClick={() => handleDownloadEvidence(ev, true)}
                          >
                            Preview
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Download}
                          onClick={() => handleDownloadEvidence(ev, false)}
                        >
                          Download
                        </Button>
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setDeleteEvTarget(ev)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* History Tabs */}
          <div className="bg-surface border border-line rounded-card shadow-card p-6 space-y-4">
            <div className="flex gap-2 border-b border-line pb-2">
              <button
                type="button"
                onClick={() => setHistoryTab('approvals')}
                className={clsx(
                  'px-3 py-1 rounded-input text-xs font-semibold',
                  historyTab === 'approvals'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-500 hover:bg-surface-muted',
                )}
              >
                Approvals ({(record.approvals || []).length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('activity')}
                className={clsx(
                  'px-3 py-1 rounded-input text-xs font-semibold',
                  historyTab === 'activity'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-500 hover:bg-surface-muted',
                )}
              >
                Activity Timeline ({(historyRows || []).length})
              </button>
            </div>

            {historyTab === 'approvals' ? (
              (record.approvals || []).length === 0 ? (
                <p className="text-xs text-ink-500">No review decisions recorded yet.</p>
              ) : (
                <ul className="space-y-2.5 text-xs">
                  {record.approvals.map((a) => (
                    <li
                      key={a.id}
                      className="border border-line rounded-input p-3 space-y-1 bg-surface-muted"
                    >
                      <div className="flex items-center justify-between">
                        <StatusChip status={a.approval_status} />
                        <span className="text-ink-500">{formatDateTime(a.reviewed_at)}</span>
                      </div>
                      <p className="font-medium text-ink-900">
                        Reviewer: {a.approver?.display_name || '—'}
                      </p>
                      {a.comments ? <p className="text-ink-500">"{a.comments}"</p> : null}
                    </li>
                  ))}
                </ul>
              )
            ) : (historyRows || []).length === 0 ? (
              <p className="text-xs text-ink-500">No audit activity yet.</p>
            ) : (
              <ul className="space-y-2 text-xs max-h-72 overflow-y-auto">
                {historyRows.map((h) => (
                  <li key={h.id} className="border-b border-line pb-2">
                    <div className="flex justify-between font-medium text-ink-900">
                      <span>
                        {h.user?.display_name || 'System'} ·{' '}
                        <span className="text-brand-600">{h.action_name}</span> ({h.entity_name})
                      </span>
                      <span className="text-ink-500">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.updated_value ? (
                      <pre className="mt-1 text-[11px] text-ink-500 bg-surface-muted p-1.5 rounded overflow-x-auto">
                        {h.updated_value}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <RecordActionBar
        viewerUserId={user?.id}
        viewerRoles={user?.roles || []}
        record={liveRecordForBar}
        saving={saveDraftMutation.isPending}
        transitioning={submitMutation.isPending || transitionMutation.isPending}
        onSaveDraft={() => saveDraftMutation.mutate()}
        onSubmit={() => submitMutation.mutate()}
        onApprove={() => setDialogMode('approve')}
        onReject={() => setDialogMode('reject')}
        onReopen={() => setDialogMode('reopen')}
      />

      {/* Approve / Reject / Reopen Dialogs */}
      <ConfirmDialog
        open={dialogMode === 'approve'}
        onClose={() => setDialogMode(null)}
        title="Approve KPI Record"
        message={`Approve ${record.kpi?.kpi_code} with value ${formatNumber(record.actual_value)} ${record.kpi?.unit_of_measurement}? Once approved, the record is locked.`}
        confirmLabel="Approve"
        loading={transitionMutation.isPending}
        onConfirm={(comment) =>
          transitionMutation.mutate({ action: 'approve', text: comment })
        }
      />

      <ConfirmDialog
        open={dialogMode === 'reject'}
        onClose={() => setDialogMode(null)}
        title="Reject KPI Record"
        message="Explain what needs to be corrected. The Data Owner will be notified with your remark."
        confirmLabel="Reject Record"
        variant="danger"
        requireReason
        reasonLabel="Rejection Remark (minimum 5 characters)"
        loading={transitionMutation.isPending}
        onConfirm={(remark) =>
          transitionMutation.mutate({ action: 'reject', text: remark })
        }
      />

      <ConfirmDialog
        open={dialogMode === 'reopen'}
        onClose={() => setDialogMode(null)}
        title="Reopen Approved Record"
        message="Reopening sets the record status back to In Progress so the Data Owner can update it."
        confirmLabel="Reopen Record"
        requireReason
        reasonLabel="Reason for Reopening (minimum 5 characters)"
        loading={transitionMutation.isPending}
        onConfirm={(reason) =>
          transitionMutation.mutate({ action: 'reopen', text: reason })
        }
      />

      <ConfirmDialog
        open={Boolean(deleteEvTarget)}
        onClose={() => setDeleteEvTarget(null)}
        title="Remove Evidence File"
        message={`Remove "${deleteEvTarget?.file_name}" from this record?`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleteEvMutation.isPending}
        onConfirm={() => deleteEvMutation.mutate(deleteEvTarget.id)}
      />

      <ConfirmDialog
        open={dialogMode === 'stale'}
        onClose={() => setDialogMode(null)}
        title="Someone changed this record"
        message="Another user updated this record while you had it open. Reload to view the latest values."
        confirmLabel="Reload"
        onConfirm={() => {
          setDialogMode(null);
          refetch();
        }}
      />

      {/* Evidence Preview Modal */}
      {previewEv ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface rounded-card shadow-card max-w-4xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">{previewEv.name}</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  URL.revokeObjectURL(previewEv.url);
                  setPreviewEv(null);
                }}
              >
                Close
              </Button>
            </div>
            {previewEv.mime === 'application/pdf' ? (
              <iframe
                src={previewEv.url}
                title={previewEv.name}
                className="w-full h-[70vh] border border-line rounded"
              />
            ) : (
              <img
                src={previewEv.url}
                alt={previewEv.name}
                className="max-h-[70vh] mx-auto rounded"
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

