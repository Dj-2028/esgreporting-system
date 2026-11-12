import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { StatusChip, PillarBadge, ConfirmDialog } from '../../src/components/shared.jsx';
import { RecordActionBar } from '../../src/features/records/RecordPages.jsx';
import { RoleRoute } from '../../src/routes/index.jsx';
import { useAuthStore } from '../../src/store/authStore.js';
import {
  passwordPolicySchema,
  orgCodeSchema,
  remarkSchema,
} from '../../src/lib/schemas.js';
import { formatNumber, formatBytes } from '../../src/lib/formatters.js';

describe('Formatters and Zod validation schemas (frontend.md §8, §12)', () => {
  test('formatNumber and formatBytes format values accurately', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(12400)).toContain('12');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  test('passwordPolicySchema enforces 10+ chars, upper, lower, digit', () => {
    expect(passwordPolicySchema.safeParse('short1A').success).toBe(false);
    expect(passwordPolicySchema.safeParse('alllowercase12').success).toBe(false);
    expect(passwordPolicySchema.safeParse('ValidPass123').success).toBe(true);
  });

  test('orgCodeSchema and remarkSchema validate length and patterns', () => {
    expect(orgCodeSchema.safeParse('ACME_01').success).toBe(true);
    expect(orgCodeSchema.safeParse('bad space').success).toBe(false);
    expect(remarkSchema.safeParse('no').success).toBe(false);
    expect(remarkSchema.safeParse('Valid remark text').success).toBe(true);
  });
});

describe('Shared design system components (frontend.md §2.2, §2.3)', () => {
  test('StatusChip pairs status text with icon', () => {
    render(<StatusChip status="Ready for Approval" />);
    expect(screen.getByText('Ready for Approval')).toBeInTheDocument();
  });

  test('PillarBadge shows code and label', () => {
    render(<PillarBadge code="E" />);
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByText(/Environmental/)).toBeInTheDocument();
  });

  test('ConfirmDialog enforces minimum 5 character reason when requireReason=true', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Reject Record"
        requireReason
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 5 characters/i);

    fireEvent.change(screen.getByLabelText(/Reason \/ Remark/i), {
      target: { value: 'Bill shows 12,400 kWh' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('Bill shows 12,400 kWh');
  });
});

describe('RecordActionBar role × status matrix (frontend.md §6.10)', () => {
  const baseRecord = {
    data_owner_user_id: 'u-owner',
    approver_user_id: 'u-approver',
    approver: { id: 'u-approver', display_name: 'Meera Approver' },
    period: { period_status: 'In Progress' },
    submission_status: 'In Progress',
    actual_value: null,
    evidence: [],
  };

  test('Data Owner on In Progress: Submit disabled until value and >=1 evidence exist', () => {
    const { rerender } = render(
      <RecordActionBar
        viewerUserId="u-owner"
        viewerRoles={['Data Owner']}
        record={baseRecord}
      />,
    );
    expect(screen.getByRole('button', { name: /Save draft/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Submit for approval/i })).toBeDisabled();

    rerender(
      <RecordActionBar
        viewerUserId="u-owner"
        viewerRoles={['Data Owner']}
        record={{ ...baseRecord, actual_value: 10000, evidence: [{ id: 'ev1' }] }}
      />,
    );
    expect(screen.getByRole('button', { name: /Submit for approval/i })).toBeEnabled();
  });

  test('Data Owner on Ready for Approval sees waiting message and no edit buttons', () => {
    render(
      <RecordActionBar
        viewerUserId="u-owner"
        viewerRoles={['Data Owner']}
        record={{ ...baseRecord, submission_status: 'Ready for Approval' }}
      />,
    );
    expect(screen.getByText(/Waiting for Meera Approver/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save draft/i })).toBeNull();
  });

  test('Approver on Ready for Approval sees Approve and Reject buttons', () => {
    render(
      <RecordActionBar
        viewerUserId="u-approver"
        viewerRoles={['Approver']}
        record={{ ...baseRecord, submission_status: 'Ready for Approval' }}
      />,
    );
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
  });

  test('Admin on Approved record (open period) sees Reopen button', () => {
    render(
      <RecordActionBar
        viewerUserId="u-admin"
        viewerRoles={['Admin']}
        record={{ ...baseRecord, submission_status: 'Approved' }}
      />,
    );
    expect(screen.getByRole('button', { name: /Reopen/i })).toBeInTheDocument();
  });

  test('Closed period renders read-only lock banner with no action buttons', () => {
    render(
      <RecordActionBar
        viewerUserId="u-admin"
        viewerRoles={['Admin']}
        record={{
          ...baseRecord,
          submission_status: 'Approved',
          period: { period_status: 'Closed' },
        }}
      />,
    );
    expect(screen.getByText(/Closed period — record is read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reopen/i })).toBeNull();
  });
});

describe('RoleRoute guard (frontend.md §5)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', display_name: 'Owner', roles: ['Data Owner'] },
      accessToken: 'tok',
      status: 'authed',
    });
  });

  test('shows Access denied when user lacks required role', () => {
    render(
      <MemoryRouter>
        <RoleRoute roles={['Admin']}>
          <div>Secret Admin Content</div>
        </RoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Access denied/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret Admin Content')).toBeNull();
  });

  test('renders children when user holds required role', () => {
    render(
      <MemoryRouter>
        <RoleRoute roles={['Data Owner', 'Admin']}>
          <div>Owner Task Content</div>
        </RoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('Owner Task Content')).toBeInTheDocument();
  });
});
