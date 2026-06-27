'use client';

import { useEffect, useMemo, useState } from 'react';

type PlatformAdminRow = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  baseRoleCode: string;
  bundleRoleCodes: string[];
  createdAt: string;
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: '#111827',
  border: '1px solid #1f2937',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #374151',
  background: '#0b1220',
  color: '#f9fafb',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #374151',
  background: '#1f2937',
  color: '#f9fafb',
  borderRadius: 12,
  padding: '10px 14px',
  cursor: 'pointer',
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export default function AdminSettingsPage() {
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Platform settings are ready.');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [ownerForm, setOwnerForm] = useState({
    membershipId: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    membershipId: '',
    password: '',
  });

  const refresh = async () => {
    const payload = await readJson<{ admins: PlatformAdminRow[] }>('/api/admins');
    setAdmins(payload.admins ?? []);
    setOwnerForm((current) => ({
      ...current,
      membershipId: current.membershipId || payload.admins?.find((admin) => admin.baseRoleCode !== 'platform_owner')?.membershipId || payload.admins?.[0]?.membershipId || '',
    }));
    setPasswordForm((current) => ({
      ...current,
      membershipId: current.membershipId || payload.admins?.[0]?.membershipId || '',
    }));
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const canCreateAdmin = Boolean(form.fullName.trim() && form.email.trim() && form.password.length >= 10 && !loading);
  const canPromote = Boolean(ownerForm.membershipId && !loading);
  const canResetPassword = Boolean(passwordForm.membershipId && passwordForm.password.length >= 10 && !loading);

  const createAdmin = async () => {
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 10) {
      setMessage('Enter full name, email, and a password of at least 10 characters.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
        }),
      });
      await refresh();
      setForm({ fullName: '', email: '', phone: '', password: '' });
      setMessage('Platform admin created. That password is the login password for the dashboard.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const promoteToOwner = async () => {
    if (!ownerForm.membershipId) {
      setMessage('Select a platform admin to promote.');
      return;
    }

    setLoading(true);
    try {
      await readJson(`/api/admins/${ownerForm.membershipId}/promote-owner`, {
        method: 'POST',
      });
      await refresh();
      setMessage('Platform admin promoted to platform owner.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!passwordForm.membershipId || passwordForm.password.length < 10) {
      setMessage('Select a platform admin and enter a password of at least 10 characters.');
      return;
    }

    setLoading(true);
    try {
      await readJson(`/api/admins/${passwordForm.membershipId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordForm.password }),
      });
      setPasswordForm((current) => ({ ...current, password: '' }));
      setMessage('Platform admin password updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedOwner = useMemo(
    () => admins.find((admin) => admin.membershipId === ownerForm.membershipId) ?? null,
    [admins, ownerForm.membershipId],
  );

  return (
    <main>
      <section style={{ marginBottom: 24, maxWidth: 820 }}>
        <h2 style={{ margin: 0, fontSize: 32 }}>Platform Settings</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6, opacity: 0.8 }}>
          Restricted owner-level and scoped admin configuration changes belong in this settings area.
        </p>
        <p style={{ marginTop: 8, lineHeight: 1.6, opacity: 0.8 }}>
          Bootstrap the first admin with a custom email such as <code>nurprodev@gmail.com</code>, then add more platform
          admins here later during handover.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Platform Admin</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={form.fullName} onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))} style={inputStyle} placeholder="Full name" />
            <input value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} style={inputStyle} placeholder="Email" />
            <input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} style={inputStyle} placeholder="Phone (optional)" />
            <input value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} style={inputStyle} type="password" placeholder="Temporary password" />
            <button onClick={createAdmin} style={buttonStyle} disabled={!canCreateAdmin}>Create Admin</button>
          </div>
          <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.74, lineHeight: 1.5 }}>
            Use this password as the dashboard login password for the new platform admin.
          </p>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Promote to Platform Owner</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={ownerForm.membershipId} onChange={(e) => setOwnerForm({ membershipId: e.target.value })} style={inputStyle}>
              {admins.map((admin) => (
                <option key={admin.membershipId} value={admin.membershipId}>
                  {admin.fullName || admin.email || admin.userId} · {admin.baseRoleCode}
                </option>
              ))}
            </select>
            <button onClick={promoteToOwner} style={buttonStyle} disabled={!canPromote}>
              Promote Selected Admin
            </button>
          </div>
          <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.74, lineHeight: 1.5 }}>
            Use this during handover to make the real owner a platform owner.
          </p>
          {selectedOwner ? (
            <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.78, lineHeight: 1.5 }}>
              Selected: {selectedOwner.fullName || selectedOwner.email || selectedOwner.userId}
            </p>
          ) : null}
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Reset Platform Admin Password</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={passwordForm.membershipId} onChange={(e) => setPasswordForm((v) => ({ ...v, membershipId: e.target.value }))} style={inputStyle}>
              {admins.map((admin) => (
                <option key={admin.membershipId} value={admin.membershipId}>
                  {admin.fullName || admin.email || admin.userId} · {admin.baseRoleCode}
                </option>
              ))}
            </select>
            <input value={passwordForm.password} onChange={(e) => setPasswordForm((v) => ({ ...v, password: e.target.value }))} style={inputStyle} type="password" placeholder="New password" />
            <button onClick={resetPassword} style={buttonStyle} disabled={!canResetPassword}>
              Update Password
            </button>
          </div>
          <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.74, lineHeight: 1.5 }}>
            This is the password the admin uses to sign into the login screen.
          </p>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Access policy</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.6, opacity: 0.78 }}>
            Manage owner privileges, scoped admin roles, and any restrictions around destructive platform actions.
          </p>
        </article>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Platform defaults</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.6, opacity: 0.78 }}>
            Set default operating hours, communication preferences, and systemwide naming so admin output stays
            coherent across teams.
          </p>
        </article>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Governance</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.6, opacity: 0.78 }}>
            Keep sensitive controls visible but deliberate, with audit-friendly settings flows and clear change
            expectations.
          </p>
        </article>
      </section>

      <section style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Current Platform Admins</h3>
        {admins.length ? (
          admins.map((admin) => (
            <article key={admin.membershipId} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{admin.fullName || admin.email || admin.userId}</div>
                  <div style={{ opacity: 0.75 }}>{admin.email || '—'} · {admin.phone || '—'}</div>
                  <div style={{ opacity: 0.8 }}>
                    Base role: {admin.baseRoleCode} · Status: {admin.status}
                  </div>
                </div>
                <div style={{ opacity: 0.72, textAlign: 'right' }}>
                  <div>{new Date(admin.createdAt).toLocaleString()}</div>
                  <div>{admin.bundleRoleCodes.length ? admin.bundleRoleCodes.join(', ') : 'No bundles'}</div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <article style={cardStyle}>
            <p style={{ marginBottom: 0, opacity: 0.78 }}>No platform admins found yet.</p>
          </article>
        )}
      </section>

      <article style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginBottom: 0, opacity: 0.8 }}>{message}</p>
      </article>
    </main>
  );
}
