import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { ROLES, KPI_UNITS, KPI_FREQUENCIES } from '../../lib/constants.js';
import { masterApi } from '../../api/endpoints.js';
import { useAuthStore } from '../../store/authStore.js';
import { formatDateTime } from '../../lib/formatters.js';
import { getFriendlyErrorMessage } from '../../lib/errors.js';
import {
  Button,
  DataTable,
  FormField,
  PillarBadge,
  Skeleton,
} from '../../components/shared.jsx';

/** Departments (`/master/departments` — frontend.md §6.11) */
export function DepartmentsPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));
  const queryClient = useQueryClient();
  const [drawer, setDrawer] = useState(null); // null | { mode: 'add'|'edit', dept }
  const [reassignDeptId, setReassignDeptId] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['departments'],
    queryFn: () => masterApi.listDepartments({ limit: 100 }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      payload.id
        ? masterApi.patchDepartment(payload.id, payload.body)
        : masterApi.createDepartment(payload.body),
    onSuccess: () => {
      toast.success('Department saved.');
      setDrawer(null);
      setReassignDeptId('');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const departments = data?.data || [];

  const columns = [
    {
      key: 'code',
      header: 'Code',
      render: (d) => <span className="font-mono font-semibold text-xs">{d.department_code}</span>,
    },
    { key: 'name', header: 'Name', render: (d) => d.department_name },
    { key: 'users', header: 'Active Users', render: (d) => d.active_users_count ?? 0 },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <span
          className={clsx(
            'px-2 py-0.5 rounded-full text-xs font-semibold',
            d.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700',
          )}
        >
          {d.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (d) => (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={() =>
                    setDrawer({
                      mode: 'edit',
                      id: d._id,
                      department_name: d.department_name,
                      department_code: d.department_code,
                      is_active: d.is_active,
                      active_users_count: d.active_users_count || 0,
                    })
                  }
                >
                  Edit
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Departments</h1>
          <p className="text-sm text-ink-500">Organisation departments for users and KPI ownership.</p>
        </div>
        {isAdmin ? (
          <Button
            icon={Plus}
            onClick={() =>
              setDrawer({
                mode: 'add',
                department_name: '',
                department_code: '',
                is_active: true,
              })
            }
          >
            Add Department
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={departments}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
        emptyTitle="No departments yet"
      />

      {drawer ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface w-full max-w-md h-full p-6 space-y-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-ink-900">
              {drawer.mode === 'add' ? 'Add Department' : 'Edit Department'}
            </h2>
            <FormField label="Department Code" required>
              {(props) => (
                <input
                  {...props}
                  value={drawer.department_code}
                  onChange={(e) => setDrawer({ ...drawer, department_code: e.target.value })}
                  placeholder="OPS"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Department Name" required>
              {(props) => (
                <input
                  {...props}
                  value={drawer.department_name}
                  onChange={(e) => setDrawer({ ...drawer, department_name: e.target.value })}
                  placeholder="Operations & Facilities"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>

            {drawer.mode === 'edit' ? (
              <div className="space-y-2 pt-2 border-t border-line">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={drawer.is_active}
                    onChange={(e) => setDrawer({ ...drawer, is_active: e.target.checked })}
                  />
                  Active department
                </label>
                {!drawer.is_active && drawer.active_users_count > 0 ? (
                  <FormField
                    label="Reassign active users to another department"
                    required
                    hint={`${drawer.active_users_count} active user(s) currently belong to this department`}
                  >
                    {(props) => (
                      <select
                        {...props}
                        value={reassignDeptId}
                        onChange={(e) => setReassignDeptId(e.target.value)}
                        className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                      >
                        <option value="">Select department…</option>
                        {departments
                          .filter((d) => d._id !== drawer.id && d.is_active)
                          .map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.department_name} ({d.department_code})
                            </option>
                          ))}
                      </select>
                    )}
                  </FormField>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setDrawer(null)}>
                Cancel
              </Button>
              <Button
                loading={saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({
                    id: drawer.id,
                    body: {
                      department_name: drawer.department_name,
                      department_code: drawer.department_code,
                      ...(drawer.mode === 'edit' ? { is_active: drawer.is_active } : {}),
                      ...(reassignDeptId ? { reassign_to_department_id: reassignDeptId } : {}),
                    },
                  })
                }
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Users & Roles (`/master/users` — frontend.md §6.12) */
export function UsersPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    display_name: '',
    email: '',
    department_id: '',
    role_ids: [],
  });

  const { data: usersRes, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => masterApi.listUsers({ limit: 100 }),
  });
  const { data: deptsRes } = useQuery({
    queryKey: ['departments'],
    queryFn: () => masterApi.listDepartments({ is_active: true, limit: 100 }),
  });
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => masterApi.listRoles(),
  });

  const createMutation = useMutation({
    mutationFn: (body) => masterApi.createUser(body),
    onSuccess: () => {
      toast.success('User created. A temporary password has been emailed.');
      setDrawerOpen(false);
      setNewUser({ display_name: '', email: '', department_id: '', role_ids: [] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => masterApi.patchUser(id, { is_active }),
    onSuccess: () => {
      toast.success('User status updated.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }) => masterApi.assignRole(userId, roleId),
    onSuccess: () => {
      toast.success('Role assigned.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const revokeRoleMutation = useMutation({
    mutationFn: ({ userId, userRoleId }) => masterApi.revokeRole(userId, userRoleId),
    onSuccess: () => {
      toast.success('Role revoked.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const columns = [
    { key: 'name', header: 'Name', render: (u) => <span className="font-semibold">{u.display_name}</span> },
    { key: 'email', header: 'Email', render: (u) => u.email },
    { key: 'dept', header: 'Department', render: (u) => u.department?.department_name || '—' },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {(u.role_assignments || []).map((ra) => (
            <span
              key={ra.user_role_id}
              title={`Assigned ${formatDateTime(ra.assigned_at)} by ${ra.assigned_by?.display_name || 'Admin'}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700"
            >
              {ra.role_name}
              <button
                type="button"
                aria-label={`Remove ${ra.role_name} from ${u.display_name}`}
                onClick={() =>
                  revokeRoleMutation.mutate({ userId: u.id, userRoleId: ra.user_role_id })
                }
                className="hover:text-red-800 ml-0.5 font-bold"
              >
                ×
              </button>
            </span>
          ))}
          <select
            aria-label={`Add role to ${u.display_name}`}
            value=""
            onChange={(e) => {
              if (e.target.value) {
                assignRoleMutation.mutate({ userId: u.id, roleId: e.target.value });
              }
            }}
            className="text-xs border border-line rounded px-1.5 py-0.5 bg-surface"
          >
            <option value="">+ Role</option>
            {(roles || []).map((r) => (
              <option key={r._id} value={r._id}>
                {r.role_name}
              </option>
            ))}
          </select>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span
          className={clsx(
            'px-2 py-0.5 rounded-full text-xs font-semibold',
            u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700',
          )}
        >
          {u.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'last_login', header: 'Last Login', render: (u) => formatDateTime(u.last_login_at) },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
        >
          {u.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Users & Roles</h1>
          <p className="text-sm text-ink-500">
            Manage organisation members, departments, and role assignments.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setDrawerOpen(true)}>
          Add User
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={usersRes?.data || []}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
      />

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface w-full max-w-md h-full p-6 space-y-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-ink-900">Add User</h2>
            <p className="text-xs text-ink-500">
              A temporary password will be emailed and must be changed on first sign-in.
            </p>
            <FormField label="Full Name" required>
              {(props) => (
                <input
                  {...props}
                  value={newUser.display_name}
                  onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Email" required>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Department">
              {(props) => (
                <select
                  {...props}
                  value={newUser.department_id}
                  onChange={(e) => setNewUser({ ...newUser, department_id: e.target.value })}
                  className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                >
                  <option value="">— Optional —</option>
                  {(deptsRes?.data || []).map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.department_name} ({d.department_code})
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink-900">
                Roles <span className="text-brand-600">*</span>
              </span>
              {(roles || []).map((r) => {
                const checked = newUser.role_ids.includes(r._id);
                return (
                  <label key={r._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...newUser.role_ids, r._id]
                          : newUser.role_ids.filter((id) => id !== r._id);
                        setNewUser({ ...newUser, role_ids: next });
                      }}
                    />
                    <span className="font-medium">{r.role_name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    display_name: newUser.display_name,
                    email: newUser.email,
                    department_id: newUser.department_id || null,
                    role_ids: newUser.role_ids,
                  })
                }
              >
                Create User
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Standards & Disclosures (`/master/standards` — frontend.md §6.13) */
export function StandardsPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));
  const queryClient = useQueryClient();
  const [selectedStdId, setSelectedStdId] = useState(null);
  const [discDrawer, setDiscDrawer] = useState(null);

  const { data: standards, isLoading } = useQuery({
    queryKey: ['standards'],
    queryFn: () => masterApi.listStandards(),
  });

  const activeStd =
    (standards || []).find((s) => s._id === selectedStdId) || (standards || [])[0] || null;

  const { data: disclosuresRes, isLoading: discLoading } = useQuery({
    queryKey: ['disclosures', activeStd?._id],
    enabled: Boolean(activeStd?._id),
    queryFn: () => masterApi.listDisclosures(activeStd._id, { limit: 100 }),
  });

  const saveDiscMutation = useMutation({
    mutationFn: (payload) =>
      payload.id
        ? masterApi.patchDisclosure(payload.id, payload.body)
        : masterApi.createDisclosure(activeStd._id, payload.body),
    onSuccess: () => {
      toast.success('Disclosure saved.');
      setDiscDrawer(null);
      queryClient.invalidateQueries({ queryKey: ['disclosures'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const deleteDiscMutation = useMutation({
    mutationFn: (id) => masterApi.deleteDisclosure(id),
    onSuccess: () => {
      toast.success('Disclosure deleted.');
      queryClient.invalidateQueries({ queryKey: ['disclosures'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  if (isLoading) return <Skeleton rows={5} />;

  const discColumns = [
    {
      key: 'code',
      header: 'Disclosure Code',
      render: (d) => <span className="font-mono font-semibold text-xs">{d.disclosure_code}</span>,
    },
    { key: 'title', header: 'Title', render: (d) => d.disclosure_title },
    {
      key: 'mandatory',
      header: 'Mandatory',
      render: (d) =>
        d.is_mandatory ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            Mandatory
          </span>
        ) : (
          <span className="text-xs text-ink-500">Optional</span>
        ),
    },
    {
      key: 'mapped',
      header: '# KPIs Mapped',
      render: (d) => d.mapped_kpis_count ?? 0,
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '',
            render: (d) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Edit2}
                  onClick={() =>
                    setDiscDrawer({
                      id: d._id,
                      disclosure_code: d.disclosure_code,
                      disclosure_title: d.disclosure_title,
                      disclosure_description: d.disclosure_description || '',
                      is_mandatory: Boolean(d.is_mandatory),
                    })
                  }
                >
                  Edit
                </Button>
                <span
                  title={
                    d.global_mapped_kpis_count > 0
                      ? 'Disclosure is mapped to a KPI (IN_USE)'
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    disabled={d.global_mapped_kpis_count > 0}
                    onClick={() => deleteDiscMutation.mutate(d._id)}
                  >
                    Delete
                  </Button>
                </span>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">ESG Standards & Disclosures</h1>
        <p className="text-sm text-ink-500">
          Global reporting frameworks (GRI, IFRS S1/S2, SASB) and disclosure items.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Left list of standards */}
        <div className="bg-surface border border-line rounded-card shadow-card p-3 space-y-1">
          {(standards || []).map((s) => (
            <button
              key={s._id}
              type="button"
              onClick={() => setSelectedStdId(s._id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-input text-sm transition-colors',
                activeStd?._id === s._id
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'hover:bg-surface-muted text-ink-900',
              )}
            >
              <div className="flex items-center justify-between">
                <span>{s.standard_code}</span>
                <span className="text-[11px] text-ink-500">{s.version_label}</span>
              </div>
              <p className="text-xs text-ink-500 truncate">{s.standard_name}</p>
            </button>
          ))}
        </div>

        {/* Right detail */}
        <div className="lg:col-span-3 space-y-4">
          {activeStd ? (
            <>
              <div className="bg-surface border border-line rounded-card shadow-card p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink-900">
                    {activeStd.standard_name} ({activeStd.version_label})
                  </h2>
                  <p className="text-xs text-ink-500">
                    Issuing body: {activeStd.issuing_body || '—'} · Pillars:{' '}
                    {(activeStd.pillar_codes || []).join(', ') || 'All'}
                  </p>
                </div>
                {isAdmin ? (
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      setDiscDrawer({
                        disclosure_code: '',
                        disclosure_title: '',
                        disclosure_description: '',
                        is_mandatory: false,
                      })
                    }
                  >
                    Add Disclosure
                  </Button>
                ) : null}
              </div>

              <DataTable
                columns={discColumns}
                data={disclosuresRes?.data || []}
                isLoading={discLoading}
                emptyTitle="No disclosures in this standard yet"
              />
            </>
          ) : null}
        </div>
      </div>

      {discDrawer ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface w-full max-w-md h-full p-6 space-y-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-ink-900">
              {discDrawer.id ? 'Edit Disclosure' : 'Add Disclosure'}
            </h2>
            <FormField label="Disclosure Code" required>
              {(props) => (
                <input
                  {...props}
                  value={discDrawer.disclosure_code}
                  onChange={(e) =>
                    setDiscDrawer({ ...discDrawer, disclosure_code: e.target.value })
                  }
                  placeholder="GRI 302-1"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Title" required>
              {(props) => (
                <input
                  {...props}
                  value={discDrawer.disclosure_title}
                  onChange={(e) =>
                    setDiscDrawer({ ...discDrawer, disclosure_title: e.target.value })
                  }
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <FormField label="Description">
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  value={discDrawer.disclosure_description}
                  onChange={(e) =>
                    setDiscDrawer({ ...discDrawer, disclosure_description: e.target.value })
                  }
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={discDrawer.is_mandatory}
                onChange={(e) =>
                  setDiscDrawer({ ...discDrawer, is_mandatory: e.target.checked })
                }
              />
              Mandatory disclosure (flagged as mandatory gap if unmapped/unapproved)
            </label>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setDiscDrawer(null)}>
                Cancel
              </Button>
              <Button
                loading={saveDiscMutation.isPending}
                onClick={() =>
                  saveDiscMutation.mutate({
                    id: discDrawer.id,
                    body: {
                      disclosure_code: discDrawer.disclosure_code,
                      disclosure_title: discDrawer.disclosure_title,
                      disclosure_description: discDrawer.disclosure_description,
                      is_mandatory: discDrawer.is_mandatory,
                    },
                  })
                }
              >
                Save Disclosure
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** KPIs & Mappings (`/master/kpis` — frontend.md §6.14) */
export function KpisPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles?.includes(ROLES.ADMIN));
  const queryClient = useQueryClient();
  const [drawer, setDrawer] = useState(null);

  const { data: kpisRes, isLoading, error, refetch } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => masterApi.listKpis({ limit: 100 }),
  });
  const { data: pillars } = useQuery({
    queryKey: ['pillars'],
    queryFn: () => masterApi.listPillars(),
  });
  const { data: standards } = useQuery({
    queryKey: ['standards'],
    queryFn: () => masterApi.listStandards(),
  });
  const griStd = (standards || []).find((s) => s.standard_code === 'GRI') || (standards || [])[0];
  const { data: disclosuresRes } = useQuery({
    queryKey: ['disclosures', griStd?._id],
    enabled: Boolean(griStd?._id),
    queryFn: () => masterApi.listDisclosures(griStd._id, { limit: 100 }),
  });

  const saveKpiMutation = useMutation({
    mutationFn: async (d) => {
      if (d.id) {
        await masterApi.patchKpi(d.id, {
          esg_pillar_id: d.esg_pillar_id,
          kpi_name: d.kpi_name,
          ...(d.has_records
            ? {}
            : { kpi_code: d.kpi_code, unit_of_measurement: d.unit_of_measurement }),
          calculation_method: d.calculation_method,
          frequency: d.frequency,
          is_active: d.is_active,
        });
        return masterApi.putKpiDisclosures(d.id, d.standard_disclosure_ids);
      }
      return masterApi.createKpi({
        esg_pillar_id: d.esg_pillar_id,
        kpi_code: d.kpi_code,
        kpi_name: d.kpi_name,
        unit_of_measurement: d.unit_of_measurement,
        calculation_method: d.calculation_method,
        frequency: d.frequency,
        standard_disclosure_ids: d.standard_disclosure_ids,
      });
    },
    onSuccess: () => {
      toast.success('KPI saved.');
      setDrawer(null);
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => toast.error(getFriendlyErrorMessage(err)),
  });

  const columns = [
    {
      key: 'code',
      header: 'Code',
      render: (k) => <span className="font-mono font-semibold text-xs">{k.kpi_code}</span>,
    },
    { key: 'name', header: 'Name', render: (k) => <span className="font-medium">{k.kpi_name}</span> },
    {
      key: 'pillar',
      header: 'Pillar',
      render: (k) =>
        k.pillar ? <PillarBadge code={k.pillar.pillar_code} showLabel={false} /> : '—',
    },
    { key: 'unit', header: 'Unit', render: (k) => k.unit_of_measurement },
    { key: 'freq', header: 'Frequency', render: (k) => k.frequency },
    {
      key: 'disclosures',
      header: 'Disclosures',
      render: (k) => (
        <div className="flex flex-wrap gap-1">
          {(k.disclosures || []).map((d) => (
            <span
              key={d.id}
              className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs font-semibold"
            >
              {d.disclosure_code}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (k) => (
        <span
          className={clsx(
            'px-2 py-0.5 rounded-full text-xs font-semibold',
            k.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700',
          )}
        >
          {k.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'edit',
            header: '',
            render: (k) => (
              <Button
                variant="secondary"
                size="sm"
                icon={Edit2}
                onClick={() =>
                  setDrawer({
                    id: k._id,
                    esg_pillar_id: String(k.esg_pillar_id),
                    kpi_code: k.kpi_code,
                    kpi_name: k.kpi_name,
                    unit_of_measurement: k.unit_of_measurement,
                    calculation_method: k.calculation_method || '',
                    frequency: k.frequency || 'Annual',
                    is_active: k.is_active,
                    has_records: Boolean(k.has_records),
                    standard_disclosure_ids: (k.disclosures || []).map((d) => d.id),
                  })
                }
              >
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">KPIs & Disclosure Mappings</h1>
          <p className="text-sm text-ink-500">
            Organisation KPIs, units of measurement, calculation methods, and mapped disclosures.
          </p>
        </div>
        {isAdmin ? (
          <Button
            icon={Plus}
            onClick={() =>
              setDrawer({
                esg_pillar_id: pillars?.[0]?._id || '',
                kpi_code: '',
                kpi_name: '',
                unit_of_measurement: 'kWh',
                calculation_method: '',
                frequency: 'Annual',
                is_active: true,
                has_records: false,
                standard_disclosure_ids: [],
              })
            }
          >
            Add KPI
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={kpisRes?.data || []}
        isLoading={isLoading}
        error={error ? getFriendlyErrorMessage(error) : null}
        onRetry={refetch}
        emptyTitle="No KPIs created yet"
      />

      {drawer ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface w-full max-w-lg h-full p-6 space-y-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-ink-900">
              {drawer.id ? 'Edit KPI' : 'Add KPI'}
            </h2>
            {drawer.has_records ? (
              <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded">
                Code and unit of measurement are locked because this KPI already has reporting records.
              </p>
            ) : null}

            <FormField label="ESG Pillar" required>
              {(props) => (
                <select
                  {...props}
                  value={drawer.esg_pillar_id}
                  onChange={(e) => setDrawer({ ...drawer, esg_pillar_id: e.target.value })}
                  className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                >
                  {(pillars || []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.pillar_code} — {p.pillar_name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="KPI Code" required>
                {(props) => (
                  <input
                    {...props}
                    disabled={drawer.has_records}
                    value={drawer.kpi_code}
                    onChange={(e) => setDrawer({ ...drawer, kpi_code: e.target.value })}
                    placeholder="ENV-01"
                    className="w-full border border-line rounded-input px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                )}
              </FormField>
              <FormField label="Unit of Measurement" required>
                {(props) => (
                  <select
                    {...props}
                    disabled={drawer.has_records}
                    value={drawer.unit_of_measurement}
                    onChange={(e) =>
                      setDrawer({ ...drawer, unit_of_measurement: e.target.value })
                    }
                    className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface disabled:bg-surface-muted"
                  >
                    {KPI_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <FormField label="KPI Name" required>
              {(props) => (
                <input
                  {...props}
                  value={drawer.kpi_name}
                  onChange={(e) => setDrawer({ ...drawer, kpi_name: e.target.value })}
                  placeholder="Total electricity consumed"
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>

            <FormField label="Frequency" required>
              {(props) => (
                <select
                  {...props}
                  value={drawer.frequency}
                  onChange={(e) => setDrawer({ ...drawer, frequency: e.target.value })}
                  className="w-full border border-line rounded-input px-3 py-2 text-sm bg-surface"
                >
                  {KPI_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Calculation Method (≤1000 chars)">
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  value={drawer.calculation_method}
                  onChange={(e) =>
                    setDrawer({ ...drawer, calculation_method: e.target.value })
                  }
                  className="w-full border border-line rounded-input px-3 py-2 text-sm"
                />
              )}
            </FormField>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink-900">
                Mapped Standard Disclosures
              </span>
              <div className="border border-line rounded-input max-h-48 overflow-y-auto divide-y divide-line">
                {(disclosuresRes?.data || []).map((d) => {
                  const checked = drawer.standard_disclosure_ids.includes(d._id);
                  return (
                    <label
                      key={d._id}
                      className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-surface-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...drawer.standard_disclosure_ids, d._id]
                            : drawer.standard_disclosure_ids.filter((id) => id !== d._id);
                          setDrawer({ ...drawer, standard_disclosure_ids: next });
                        }}
                      />
                      <span className="font-mono font-semibold">{d.disclosure_code}</span>
                      <span className="truncate">{d.disclosure_title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {drawer.id ? (
              <label className="flex items-center gap-2 text-sm font-medium pt-2">
                <input
                  type="checkbox"
                  checked={drawer.is_active}
                  onChange={(e) => setDrawer({ ...drawer, is_active: e.target.checked })}
                />
                Active KPI
              </label>
            ) : null}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setDrawer(null)}>
                Cancel
              </Button>
              <Button
                loading={saveKpiMutation.isPending}
                onClick={() => saveKpiMutation.mutate(drawer)}
              >
                Save KPI
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

