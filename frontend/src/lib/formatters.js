import { format, parseISO } from 'date-fns';

export function formatDate(value, pattern = 'dd MMM yyyy') {
  if (!value) return '—';
  try {
    const d = typeof value === 'string' ? parseISO(value) : new Date(value);
    return format(d, pattern);
  } catch {
    return String(value);
  }
}

export function formatDateTime(value) {
  return formatDate(value, 'dd MMM yyyy, HH:mm');
}

export function formatNumber(value, maxDecimals = 6) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

