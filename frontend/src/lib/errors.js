const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  UNAUTHENTICATED: 'Your session has ended. Please sign in again.',
  TOKEN_EXPIRED: 'Your session expired. Refreshing…',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  ACCOUNT_DISABLED: 'This account or organisation has been deactivated.',
  SEGREGATION_OF_DUTIES: 'Segregation of duties: you cannot approve or reject a record you own.',
  NOT_FOUND: 'The requested item could not be found.',
  DUPLICATE: 'A record with the same value already exists.',
  INVALID_TRANSITION: 'This action is not allowed in the record’s current status.',
  IN_USE: 'This item is currently in use and cannot be modified or removed.',
  STALE_RECORD: 'Someone changed this record. Reload to see the latest version.',
  RECORD_LOCKED: 'This record is locked and cannot be edited.',
  PERIOD_CLOSED: 'This reporting period is closed and read-only.',
  OPEN_RECORDS_EXIST: 'Some KPI records in this period are not yet Approved.',
  FILE_TOO_LARGE: 'File exceeds the 10 MB size limit.',
  UNSUPPORTED_FILE_TYPE: 'Unsupported file type. Allowed: PDF, PNG, JPG, CSV, XLSX, DOCX.',
  EVIDENCE_REQUIRED: 'At least one evidence file is required before submitting.',
  VALUE_REQUIRED: 'Actual value is required before submitting.',
  REMARK_REQUIRED: 'A remark of at least 5 characters is required to reject.',
  OWNER_EQUALS_APPROVER: 'Data Owner and Approver cannot be the same user.',
  REASON_REQUIRED: 'A reason of at least 5 characters is required.',
  TOO_MANY_ATTEMPTS: 'Too many failed login attempts. Please wait 15 minutes and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};

export function getFriendlyErrorMessage(err) {
  const apiError = err?.response?.data?.error || err?.error;
  if (apiError) {
    const code = apiError.code;
    const base = apiError.message || ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
    if (code === 'INTERNAL_ERROR' && apiError.request_id) {
      return `${base} (Request ID: ${apiError.request_id})`;
    }
    return base;
  }
  return err?.message || 'Network error. Please check your connection.';
}

export function applyServerFieldErrors(err, setError) {
  const details = err?.response?.data?.error?.details;
  if (Array.isArray(details) && typeof setError === 'function') {
    for (const d of details) {
      if (d.field) {
        setError(d.field, { type: 'server', message: d.message });
      }
    }
    return true;
  }
  return false;
}

