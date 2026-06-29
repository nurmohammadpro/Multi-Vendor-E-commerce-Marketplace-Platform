'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

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
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
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
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [capabilities, setCapabilities] = useState<StaffCapabilities | null>(null);
  const [message, setMessage] = useState('User management is ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const refresh = async () => {
    const payload = await readJson<{ staff: StaffMember[]; capabilities?: StaffCapabilities }>('/api/staff');
    setStaff(payload.staff ?? []);
    setCapabilities(payload.capabilities ?? null);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const canCreateRole =
    (form.roleCode === 'store_manager' && Boolean(capabilities?.canInviteManager))
    || (form.roleCode === 'store_salesman' && Boolean(capabilities?.canInviteSalesman));

  const createUser = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim() || !form.password.trim() || !form.address.trim()) {
      setMessage('Name, phone, email, password, and address are required.');
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<{ employeeNumber?: string; roleCode?: string }>('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
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
      await refresh();
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
      await refresh();
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

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Create user with system access</h3>
        <p style={tokenMutedStyle}>
          Every console user now requires name, phone, email, password, and address. HR details stay attached from day one.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <input value={form.fullName} onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))} style={fieldStyle} placeholder="Full name*" />
          <input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} style={fieldStyle} placeholder="Phone*" />
          <input value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} style={fieldStyle} placeholder="Email*" />
          <input type="password" value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} style={fieldStyle} placeholder="Password*" />
          <input value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} style={fieldStyle} placeholder="Address*" />
          <select value={form.roleCode} onChange={(e) => setForm((v) => ({ ...v, roleCode: e.target.value }))} style={fieldStyle}>
            {capabilities?.canInviteManager ? <option value="store_manager">Manager</option> : null}
            <option value="store_salesman">Salesman</option>
          </select>
          <input type="date" value={form.joinDate} onChange={(e) => setForm((v) => ({ ...v, joinDate: e.target.value }))} style={fieldStyle} />
          <input value={form.monthlySalary} onChange={(e) => setForm((v) => ({ ...v, monthlySalary: e.target.value }))} style={fieldStyle} placeholder="Monthly salary" />
          <input value={form.designation} onChange={(e) => setForm((v) => ({ ...v, designation: e.target.value }))} style={fieldStyle} placeholder="Designation" />
          <input value={form.department} onChange={(e) => setForm((v) => ({ ...v, department: e.target.value }))} style={fieldStyle} placeholder="Department" />
          <input value={form.emergencyContactName} onChange={(e) => setForm((v) => ({ ...v, emergencyContactName: e.target.value }))} style={fieldStyle} placeholder="Emergency contact name" />
          <input value={form.emergencyContactPhone} onChange={(e) => setForm((v) => ({ ...v, emergencyContactPhone: e.target.value }))} style={fieldStyle} placeholder="Emergency contact phone" />
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <textarea value={form.educationSummary} onChange={(e) => setForm((v) => ({ ...v, educationSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Educational qualifications" />
          <textarea value={form.experienceSummary} onChange={(e) => setForm((v) => ({ ...v, experienceSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Experience summary" />
          <textarea value={form.trainingSummary} onChange={(e) => setForm((v) => ({ ...v, trainingSummary: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Training and certifications" />
          <textarea value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Internal note" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={createUser} style={secondaryButtonStyle} disabled={loading || !canCreateRole}>Create user</button>
          <span style={tokenMutedStyle}>
            {capabilities?.canInviteManager ? 'Owners can create managers and salesmen.' : 'Managers can create salesmen only.'}
          </span>
        </div>
      </article>

      <section style={{ display: 'grid', gap: 10 }}>
        {staff.length ? (
          staff.map((member) => (
            <article key={member.id} style={surfaceCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>{member.full_name || member.email || member.phone || member.user_id}</div>
                  <div style={{ color: '#475569' }}>
                    {member.role_code} · {member.status} · {member.employee_number || 'No employee ID'}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {member.email || '—'} · {member.phone || '—'}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {member.designation || 'No designation'} · {member.department || 'No department'} · Salary: {member.monthly_salary || 0}
                  </div>
                  <div style={{ color: '#64748b' }}>{member.address_text || 'No address'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {capabilities?.canUpdateManager && member.role_code === 'store_salesman' ? (
                    <button onClick={() => updateMembership(member.id, { roleCode: 'store_manager' })} style={secondaryButtonStyle} disabled={loading}>
                      Make Manager
                    </button>
                  ) : null}
                  {capabilities?.canUpdateManager && member.role_code === 'store_manager' ? (
                    <button onClick={() => updateMembership(member.id, { roleCode: 'store_salesman' })} style={secondaryButtonStyle} disabled={loading}>
                      Make Salesman
                    </button>
                  ) : null}
                  {member.role_code !== 'store_owner' ? (
                    <button onClick={() => updateMembership(member.id, { status: member.status === 'suspended' ? 'active' : 'suspended' })} style={secondaryButtonStyle} disabled={loading}>
                      {member.status === 'suspended' ? 'Activate' : 'Suspend'}
                    </button>
                  ) : null}
                  {member.role_code === 'store_manager' && capabilities?.canRemoveManager ? (
                    <button onClick={() => updateMembership(member.id, { status: 'removed' })} style={secondaryButtonStyle} disabled={loading}>
                      Remove
                    </button>
                  ) : null}
                  {member.role_code === 'store_salesman' && capabilities?.canRemoveSalesman ? (
                    <button onClick={() => updateMembership(member.id, { status: 'removed' })} style={secondaryButtonStyle} disabled={loading}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div style={emptyStateStyle}>No store users are loaded yet.</div>
        )}
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
