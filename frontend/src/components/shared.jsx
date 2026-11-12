import React, { useId, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';
import {
  Clock,
  Hourglass,
  CheckCircle2,
  XCircle,
  Lock,
  Loader2,
  AlertTriangle,
  Inbox,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';

/** Button (frontend.md §2.3) */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className,
  children,
  type = 'button',
  ...rest
}) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
    secondary:
      'bg-surface text-ink-900 border border-line hover:bg-surface-muted disabled:opacity-50',
    danger: 'bg-red-700 text-white hover:bg-red-800 disabled:opacity-50',
    ghost: 'bg-transparent text-ink-900 hover:bg-surface-muted disabled:opacity-50',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-input transition-colors cursor-pointer disabled:cursor-not-allowed',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
      {!loading && Icon ? <Icon className="w-4 h-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** StatusChip — always paired with an icon and text (frontend.md §2.2) */
const STATUS_CONFIG = {
  'In Progress': {
    bg: 'bg-[#DBEAFE]',
    text: 'text-[#1D4ED8]',
    Icon: Clock,
  },
  'Ready for Approval': {
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#B45309]',
    Icon: Hourglass,
  },
  Approved: {
    bg: 'bg-[#DCFCE7]',
    text: 'text-[#15803D]',
    Icon: CheckCircle2,
  },
  Rejected: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#B91C1C]',
    Icon: XCircle,
  },
  Closed: {
    bg: 'bg-[#E5E7EB]',
    text: 'text-[#374151]',
    Icon: Lock,
  },
  Gap: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#B91C1C]',
    Icon: AlertTriangle,
  },
};

export function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['In Progress'];
  const Icon = cfg.Icon;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        cfg.bg,
        cfg.text,
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

/** PillarBadge — E green, S blue, G purple, GEN grey (letter + label) */
const PILLAR_STYLES = {
  E: { style: 'bg-emerald-100 text-emerald-800', label: 'Environmental' },
  S: { style: 'bg-blue-100 text-blue-800', label: 'Social' },
  G: { style: 'bg-purple-100 text-purple-800', label: 'Governance' },
  GEN: { style: 'bg-gray-200 text-gray-800', label: 'General' },
};

export function PillarBadge({ code, showLabel = true }) {
  const cfg = PILLAR_STYLES[code] || PILLAR_STYLES.GEN;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold',
        cfg.style,
      )}
    >
      <span className="font-bold">{code}</span>
      {showLabel ? <span className="font-normal">· {cfg.label}</span> : null}
    </span>
  );
}

/** FormField — accessible label + hint + error via aria-describedby */
export function FormField({ label, error, hint, required = false, children, htmlFor }) {
  const autoId = useId();
  const fieldId = htmlFor || autoId;
  const errId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink-900">
          {label}
          {required ? <span className="text-brand-600 ml-0.5">*</span> : null}
        </label>
      ) : null}
      {typeof children === 'function'
        ? children({
            id: fieldId,
            'aria-invalid': Boolean(error),
            'aria-describedby': [hint ? hintId : null, error ? errId : null]
              .filter(Boolean)
              .join(' ') || undefined,
          })
        : children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" aria-live="polite" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Skeleton, EmptyState, ErrorState (frontend.md §2.3, §9) */
export function Skeleton({ rows = 4, className }) {
  return (
    <div className={clsx('space-y-3 animate-pulse', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-10 bg-gray-200 rounded-input" />
      ))}
    </div>
  );
}

export function EmptyState({ title = 'No items found', description, action }) {
  return (
    <div className="bg-surface border border-line rounded-card p-8 text-center">
      <Inbox className="w-10 h-10 text-ink-500 mx-auto mb-3" aria-hidden="true" />
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 text-sm text-ink-500 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message = 'Could not load data', onRetry }) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 rounded-card p-6 text-center space-y-3"
    >
      <AlertTriangle className="w-8 h-8 text-red-700 mx-auto" aria-hidden="true" />
      <p className="text-sm font-medium text-red-900">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** ConfirmDialog — used for reject, reopen, close, deactivate */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  requireReason = false,
  reasonLabel = 'Reason / Remark (minimum 5 characters)',
  loading = false,
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (requireReason && reason.trim().length < 5) {
      setErr('Please enter at least 5 characters.');
      return;
    }
    setErr('');
    onConfirm(reason.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface rounded-card shadow-card border border-line max-w-md w-full p-6 space-y-4"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-ink-900">
          {title}
        </h2>
        {message ? <div className="text-sm text-ink-500">{message}</div> : null}
        {requireReason ? (
          <div>
            <label htmlFor="dialog-reason" className="block text-sm font-medium text-ink-900 mb-1">
              {reasonLabel} <span className="text-brand-600">*</span>
            </label>
            <textarea
              id="dialog-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-line rounded-input px-3 py-2 text-sm"
              placeholder="Provide a clear reason or remark…"
            />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-red-700" role="alert">
                {err}
              </span>
              <span className="text-ink-500">{reason.trim().length} / 5+ chars</span>
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant={variant} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** FileDropzone (frontend.md §2.3, §6.10) */
export function FileDropzone({
  maxSizeMB = 10,
  maxFiles = 10,
  currentCount = 0,
  onUpload,
  uploading = false,
}) {
  const [localError, setLocalError] = useState('');
  const remaining = Math.max(0, maxFiles - currentCount);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: uploading || remaining === 0,
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    onDropAccepted: (files) => {
      setLocalError('');
      if (files[0]) onUpload(files[0]);
    },
    onDropRejected: (rejections) => {
      const code = rejections?.[0]?.errors?.[0]?.code;
      if (code === 'file-too-large') {
        setLocalError(`File exceeds the ${maxSizeMB} MB limit.`);
      } else if (code === 'file-invalid-type') {
        setLocalError('Unsupported file type. Allowed: PDF, PNG, JPG, CSV, XLSX, DOCX.');
      } else {
        setLocalError('Could not accept file.');
      }
    },
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-card p-5 text-center transition-colors cursor-pointer',
          isDragActive ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface-muted hover:border-ink-500',
          (uploading || remaining === 0) && 'opacity-50 cursor-not-allowed',
        )}
      >
        <input {...getInputProps()} aria-label="Upload evidence file" />
        <UploadCloud className="w-7 h-7 text-brand-600 mx-auto mb-1.5" aria-hidden="true" />
        <p className="text-sm font-medium text-ink-900">
          {uploading
            ? 'Uploading evidence…'
            : remaining === 0
              ? `Maximum of ${maxFiles} evidence files reached`
              : 'Drag & drop an evidence file here, or click to browse'}
        </p>
        <p className="text-xs text-ink-500 mt-1">
          PDF, PNG, JPG, CSV, XLSX, DOCX · up to {maxSizeMB} MB ({currentCount}/{maxFiles} uploaded)
        </p>
      </div>
      {localError ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {localError}
        </p>
      ) : null}
    </div>
  );
}

/** DataTable — sticky header, sorting, pagination, loading/empty/error states */
export function DataTable({
  columns,
  data = [],
  isLoading = false,
  error = null,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  pagination,
  onPageChange,
  sort,
  onSortChange,
  onRowClick,
}) {
  if (isLoading) return <Skeleton rows={5} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const toggleSort = (field) => {
    if (!onSortChange || !field) return;
    if (sort === field) onSortChange(`-${field}`);
    else onSortChange(field);
  };

  return (
    <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-surface-muted sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key || col.header}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-500"
                >
                  {col.sortField && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.sortField)}
                      className="inline-flex items-center gap-1 hover:text-ink-900"
                    >
                      <span>{col.header}</span>
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {data.map((row, idx) => (
              <tr
                key={row.id || row._id || idx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-brand-50/40',
                  row._rowClassName,
                )}
              >
                {columns.map((col) => (
                  <td key={col.key || col.header} className="px-4 py-3 text-ink-900 align-middle">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total_pages > 1 ? (
        <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-surface-muted text-xs text-ink-500">
          <span>
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              icon={ChevronLeft}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => onPageChange(pagination.page + 1)}
              icon={ChevronRight}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** RequireRole — renders children only if the user holds any of `roles` */
export function RequireRole({ roles, children, fallback = null }) {
  const userRoles = useAuthStore((s) => s.user?.roles || []);
  const allowed = roles.some((r) => userRoles.includes(r));
  return allowed ? children : fallback;
}

