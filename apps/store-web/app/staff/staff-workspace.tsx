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
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function StaffWorkspace() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [message, setMessage] = useState('Staff management is ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    invitedEmail: '',
    invitedPhone: '',
    roleCode: 'store_salesman',
  });
  const canInvite = Boolean((form.invitedEmail.trim() || form.invitedPhone.trim()) && !loading);

  const refresh = async () => {
    const payload = await readJson<{ staff: StaffMember[] }>('/api/staff');
    setStaff(payload.staff ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const invite = async () => {
    if (!form.invitedEmail && !form.invitedPhone) {
      setMessage('Enter email or phone for the invitation.');
      return;
    }
    setLoading(true);
    try {
      const payload = await readJson<{ invitationToken?: string }>('/api/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedEmail: form.invitedEmail || undefined,
          invitedPhone: form.invitedPhone || undefined,
          roleCode: form.roleCode,
        }),
      });
      await refresh();
      setForm({ invitedEmail: '', invitedPhone: '', roleCode: 'store_salesman' });
      setMessage(`Invitation created.${payload.invitationToken ? ` Token: ${payload.invitationToken}` : ''}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateMembership = async (membershipId: string, payload: Partial<Pick<StaffMember, 'status' | 'role_code'>>) => {
    setLoading(true);
    try {
      await readJson(`/api/staff/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: payload.status,
          roleCode: payload.role_code,
        }),
      });
      await refresh();
      setMessage('Membership updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Invite Staff</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input value={form.invitedEmail} onChange={(e) => setForm((v) => ({ ...v, invitedEmail: e.target.value }))} style={fieldStyle} placeholder="Email" />
          <input value={form.invitedPhone} onChange={(e) => setForm((v) => ({ ...v, invitedPhone: e.target.value }))} style={fieldStyle} placeholder="Phone" />
          <select value={form.roleCode} onChange={(e) => setForm((v) => ({ ...v, roleCode: e.target.value }))} style={fieldStyle}>
            <option value="store_owner">Owner</option>
            <option value="store_manager">Manager</option>
            <option value="store_salesman">Salesman</option>
          </select>
          <button onClick={invite} style={secondaryButtonStyle} disabled={!canInvite}>Invite</button>
        </div>
      </article>

      <section style={{ display: 'grid', gap: 10 }}>
        {staff.length ? (
          staff.map((member) => (
            <article key={member.id} style={surfaceCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{member.full_name || member.email || member.phone || member.user_id}</div>
                  <div style={{ color: '#475569' }}>
                    {member.role_code} · {member.status}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {member.email || '—'} · {member.phone || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => updateMembership(member.id, { role_code: 'store_manager' })} style={secondaryButtonStyle} disabled={loading}>Make Manager</button>
                  <button onClick={() => updateMembership(member.id, { role_code: 'store_salesman' })} style={secondaryButtonStyle} disabled={loading}>Make Salesman</button>
                  <button onClick={() => updateMembership(member.id, { status: member.status === 'suspended' ? 'active' : 'suspended' })} style={secondaryButtonStyle} disabled={loading}>
                    {member.status === 'suspended' ? 'Activate' : 'Suspend'}
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div style={emptyStateStyle}>No staff members are loaded yet.</div>
        )}
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
