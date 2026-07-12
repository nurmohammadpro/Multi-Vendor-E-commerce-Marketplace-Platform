'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type StaffMember = {
  id: string;
  user_id: string;
  status: 'active' | 'suspended' | 'removed';
  joined_at?: string | null;
  role_code: 'store_owner' | 'store_manager' | 'store_salesman';
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  address_text?: string | null;
  employee_number?: string | null;
  designation?: string | null;
  department?: string | null;
  employment_status?: string | null;
  monthly_salary?: string | number | null;
  location_id?: string | null;
  location_name?: string | null;
};

type StaffCapabilities = {
  canInviteManager: boolean;
  canInviteSalesman: boolean;
  canUpdateManager: boolean;
  canUpdateSalesman: boolean;
  canRemoveManager: boolean;
  canRemoveSalesman: boolean;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

const defaultForm = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  address: '',
  roleCode: 'store_salesman',
  locationId: '',
  joinDate: new Date().toISOString().slice(0, 10),
  monthlySalary: '',
  employmentType: 'permanent',
  designation: '',
  department: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  salaryPaymentMode: 'cash',
  educationSummary: '',
  experienceSummary: '',
  trainingSummary: '',
  note: '',
};

export function StaffWorkspace({ canManageStaff }: { canManageStaff: boolean }) {
  const compact = useCompactLayout();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [capabilities, setCapabilities] = useState<StaffCapabilities | null>(null);
  const [message, setMessage] = useState('User management is ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [activeTab, setActiveTab] = useState<'create' | 'users'>('users');
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteLocationId, setPromoteLocationId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', email: '', password: '', address: '' });

  const isPro = subscriptionPlan === 'pro';

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(pagination.limit) });
    if (search.trim()) params.set('search', search.trim());
    const payload = await readJson<{ staff: StaffMember[]; capabilities?: StaffCapabilities; pagination?: PaginationState }>(`/api/staff?${params.toString()}`);
    setStaff(payload.staff ?? []);
    setCapabilities(payload.capabilities ?? null);
    setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.staff?.length ?? 0 });
    setPage(payload.pagination?.page ?? nextPage);
  };

  useEffect(() => {
    void Promise.all([
      refresh(),
      readJson<{ subscription?: { plan_code: string } }>('/api/billing/subscription').then((data) => setSubscriptionPlan(data.subscription?.plan_code ?? null)).catch(() => {}),
      readJson<{ locations: Array<{ id: string; name: string; code: string }> }>('/api/inventory/locations').then((data) => setLocations(data.locations ?? [])).catch(() => {}),
    ]).catch((error: Error) => setMessage(error.message));
  }, []);

  const canCreateRole =
    (form.roleCode === 'store_manager' && Boolean(capabilities?.canInviteManager))
    || (form.roleCode === 'store_salesman' && Boolean(capabilities?.canInviteSalesman));

  const createUser = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim() || !form.password.trim() || !form.address.trim()) {
      setMessage('Name, phone, email, password, and address are required.');
      return;
    }
    if (form.roleCode === 'store_manager' && !form.locationId) {
      setMessage('A location must be assigned when creating a manager.');
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<{ employeeNumber?: string; roleCode?: string }>('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          locationId: form.locationId || undefined,
          monthlySalary: Number(form.monthlySalary || 0),
          designation: form.designation || undefined,
          department: form.department || undefined,
          emergencyContactName: form.emergencyContactName || undefined,
          emergencyContactPhone: form.emergencyContactPhone || undefined,
          educationSummary: form.educationSummary || undefined,
          experienceSummary: form.experienceSummary || undefined,
          trainingSummary: form.trainingSummary || undefined,
          note: form.note || undefined,
        }),
      });
      await refresh(1);
      setForm(defaultForm);
      setMessage(`User created successfully.${payload.employeeNumber ? ` Employee ID: ${payload.employeeNumber}.` : ''}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateMembership = async (membershipId: string, payload: Record<string, unknown>) => {
    setLoading(true);
    try {
      await readJson(`/api/staff/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refresh(page);
      setMessage('User access updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canManageStaff) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>User access limited</h3>
          <p style={tokenMutedStyle}>Only owners and managers can create or manage store users.</p>
        </article>
      </section>
    );
  }

  const totalPages = totalPagesFor(pagination);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'create' | 'users')}
          tabs={[
            { key: 'users', label: 'Users' },
            { key: 'create', label: 'Create User' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'create') ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Create user with system access</h3>
        <p style={tokenMutedStyle}>
          Every console user now requires name, phone, email, password, and address. HR details stay attached from day one.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <input value={form.fullName} onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))} style={fieldStyle} placeholder="Full name*" />
          <input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} style={fieldStyle} placeholder="Phone*" />
          <input value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} style={fieldStyle} placeholder="Email*" />
          <div style={{ position: 'relative' }}>
            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} style={{ ...fieldStyle, paddingRight: 30 }} placeholder="Password*" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0, lineHeight: 0 }} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} style={fieldStyle} placeholder="Address*" />
          <select value={form.roleCode} onChange={(e) => setForm((v) => ({ ...v, roleCode: e.target.value }))} style={fieldStyle}>
            {capabilities?.canInviteManager ? <option value="store_manager">Manager</option> : null}
            <option value="store_salesman">Salesman</option>
          </select>
          {form.roleCode === 'store_manager' ? (
            <select value={form.locationId} onChange={(e) => setForm((v) => ({ ...v, locationId: e.target.value }))} style={{ ...fieldStyle, borderColor: !form.locationId ? '#f59e0b' : undefined }} required>
              <option value="">Select location*</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>
          ) : null}
          <input type="date" value={form.joinDate} onChange={(e) => setForm((v) => ({ ...v, joinDate: e.target.value }))} style={fieldStyle} />
          {isPro ? <input value={form.monthlySalary} onChange={(e) => setForm((v) => ({ ...v, monthlySalary: e.target.value }))} style={fieldStyle} placeholder="Monthly salary" /> : null}
          {isPro ? <input value={form.designation} onChange={(e) => setForm((v) => ({ ...v, designation: e.target.value }))} style={fieldStyle} placeholder="Designation" /> : null}
          {isPro ? <input value={form.department} onChange={(e) => setForm((v) => ({ ...v, department: e.target.value }))} style={fieldStyle} placeholder="Department" /> : null}
          {isPro ? <input value={form.emergencyContactName} onChange={(e) => setForm((v) => ({ ...v, emergencyContactName: e.target.value }))} style={fieldStyle} placeholder="Emergency contact name" /> : null}
          <input value={form.emergencyContactPhone} onChange={(e) => setForm((v) => ({ ...v, emergencyContactPhone: e.target.value }))} style={fieldStyle} placeholder="Emergency contact phone" />
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <textarea value={form.educationSummary} onChange={(e) => setForm((v) => ({ ...v, educationSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Educational qualifications" />
          <textarea value={form.experienceSummary} onChange={(e) => setForm((v) => ({ ...v, experienceSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Experience summary" />
          <textarea value={form.trainingSummary} onChange={(e) => setForm((v) => ({ ...v, trainingSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Training and certifications" />
          <textarea value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Internal note" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={createUser} style={gray800ButtonStyle} disabled={loading || !canCreateRole}>Create user</button>
          <span style={tokenMutedStyle}>
            {capabilities?.canInviteManager ? 'Owners can create managers and salesmen.' : 'Managers can create salesmen only.'}
          </span>
        </div>
      </article>
      ) : null}

      {(!compact || activeTab === 'users') ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Store Users</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} style={{ ...fieldStyle, flex: 1 }} placeholder="Search name, phone, email, employee id, role" />
          <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Search</button>
        </div>
        {staff.length ? (
          <>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Name</th>
                    <th style={tableHeaderCellStyle}>Role</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Employee ID</th>
                    <th style={tableHeaderCellStyle}>Contact</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    {isPro ? <th style={tableHeaderCellStyle}>Designation</th> : null}
                    {isPro ? <th style={tableHeaderCellStyle}>Department</th> : null}
                    {isPro ? <th style={tableHeaderCellStyle}>Salary</th> : null}
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.id}>
                      <td style={tableCellStyle}>
                        <div style={{ fontWeight: 600 }}>{member.full_name || member.email || member.phone || member.user_id}</div>
                        <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>{member.address_text || 'No address'}</div>
                      </td>
                      <td style={tableCellStyle}>{member.role_code}</td>
                      <td style={tableCellStyle}>{member.status}</td>
                      <td style={tableCellStyle}>{member.employee_number || '—'}</td>
                      <td style={tableCellStyle}>
                        {member.email || '—'}
                        <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>{member.phone || '—'}</div>
                      </td>
                      <td style={tableCellStyle}>{member.location_name || '—'}</td>
                      {isPro ? <td style={tableCellStyle}>{member.designation || '—'}</td> : null}
                      {isPro ? <td style={tableCellStyle}>{member.department || '—'}</td> : null}
                      {isPro ? <td style={tableCellStyle}>{member.monthly_salary || 0}</td> : null}
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {capabilities?.canUpdateManager && member.role_code === 'store_salesman' ? (
                            promotingId === member.id ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select value={promoteLocationId} onChange={(e) => setPromoteLocationId(e.target.value)} style={{ ...fieldStyle, width: 140, fontSize: 12 }}>
                                  <option value="">Select location*</option>
                                  {locations.map((loc) => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                  ))}
                                </select>
                                <button onClick={() => {
                                  if (!promoteLocationId) { setMessage('Select a location first.'); return; }
                                  updateMembership(member.id, { roleCode: 'store_manager', locationId: promoteLocationId });
                                  setPromotingId(null);
                                  setPromoteLocationId('');
                                }} style={secondaryButtonStyle} disabled={loading}>Confirm</button>
                                <button onClick={() => { setPromotingId(null); setPromoteLocationId(''); }} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => { setPromotingId(member.id); setPromoteLocationId(member.location_id ?? ''); }} style={secondaryButtonStyle} disabled={loading}>Make Manager</button>
                            )
                          ) : null}
                          {capabilities?.canUpdateManager && member.role_code === 'store_manager' ? (
                            <button onClick={() => updateMembership(member.id, { roleCode: 'store_salesman' })} style={secondaryButtonStyle} disabled={loading}>Make Salesman</button>
                          ) : null}
                          {member.role_code !== 'store_owner' ? (
                            <button onClick={() => updateMembership(member.id, { status: member.status === 'suspended' ? 'active' : 'suspended' })} style={secondaryButtonStyle} disabled={loading}>
                              {member.status === 'suspended' ? 'Activate' : 'Suspend'}
                            </button>
                          ) : null}
                          {editingId !== member.id && member.role_code !== 'store_owner' ? (
                            <button onClick={() => {
                              setEditForm({
                                fullName: member.full_name || '',
                                phone: member.phone || '',
                                email: member.email || '',
                                password: '',
                                address: member.address_text || '',
                              });
                              setEditingId(member.id);
                            }} style={secondaryButtonStyle} disabled={loading}>Edit</button>
                          ) : null}
                          {editingId === member.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)', width: '100%' }}>
                              <input value={editForm.fullName} onChange={(e) => setEditForm((v) => ({ ...v, fullName: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Full name" />
                              <input value={editForm.phone} onChange={(e) => setEditForm((v) => ({ ...v, phone: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Phone" />
                              <input value={editForm.email} onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Email" />
                              <input type="password" value={editForm.password} onChange={(e) => setEditForm((v) => ({ ...v, password: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="New password (leave blank to keep)" />
                              <textarea value={editForm.address} onChange={(e) => setEditForm((v) => ({ ...v, address: e.target.value }))} style={{ ...fieldStyle, fontSize: 12, minHeight: 48 }} placeholder="Address" />
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => {
                                  const update: Record<string, unknown> = {};
                                  if (editForm.fullName.trim()) update.fullName = editForm.fullName.trim();
                                  if (editForm.phone.trim()) update.phone = editForm.phone.trim();
                                  if (editForm.email.trim()) update.email = editForm.email.trim();
                                  if (editForm.password.trim()) update.password = editForm.password.trim();
                                  if (editForm.address.trim()) update.address = editForm.address.trim();
                                  if (!Object.keys(update).length) { setMessage('No changes to save.'); return; }
                                  updateMembership(member.id, update);
                                  setEditingId(null);
                                  setEditForm({ fullName: '', phone: '', email: '', password: '', address: '' });
                                }} style={accentButtonStyle} disabled={loading}>Save</button>
                                <button onClick={() => { setEditingId(null); setEditForm({ fullName: '', phone: '', email: '', password: '', address: '' }); }} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
                              </div>
                            </div>
                          ) : null}
                          {member.role_code === 'store_manager' && capabilities?.canRemoveManager ? (
                            <button onClick={() => updateMembership(member.id, { status: 'removed' })} style={secondaryButtonStyle} disabled={loading}>Remove</button>
                          ) : null}
                          {member.role_code === 'store_salesman' && capabilities?.canRemoveSalesman ? (
                            <button onClick={() => updateMembership(member.id, { status: 'removed' })} style={secondaryButtonStyle} disabled={loading}>Remove</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager
              loading={loading}
              page={page}
              pagination={pagination}
              label="user(s)"
              onPrevious={() => void refresh(Math.max(1, page - 1))}
              onNext={() => void refresh(Math.min(totalPages, page + 1))}
            />
          </>
        ) : (
          <div style={emptyStateStyle}>No store users are loaded yet.</div>
        )}
      </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
