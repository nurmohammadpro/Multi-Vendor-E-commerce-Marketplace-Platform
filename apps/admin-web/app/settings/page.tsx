'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

type PlatformSettings = {
  accessPolicy: {
    ownerControlsDestructiveActions: boolean;
    managerCanManageSalesmen: boolean;
    managerCanRemoveSalesmen: boolean;
  };
  defaults: {
    operatingHours: string;
    notificationsEmail: string;
    reportWindowDays: number;
  };
  governance: {
    requireConfirmationForDeletes: boolean;
    auditRetentionDays: number;
    changeReviewMinutes: number;
  };
};

const defaultSettings: PlatformSettings = {
  accessPolicy: {
    ownerControlsDestructiveActions: true,
    managerCanManageSalesmen: true,
    managerCanRemoveSalesmen: false,
  },
  defaults: {
    operatingHours: '09:00-18:00',
    notificationsEmail: 'ops@example.com',
    reportWindowDays: 30,
  },
  governance: {
    requireConfirmationForDeletes: true,
    auditRetentionDays: 365,
    changeReviewMinutes: 15,
  },
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
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
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
  const [editForm, setEditForm] = useState({
    membershipId: '',
    fullName: '',
    email: '',
    phone: '',
  });
  const [showPasswordCreate, setShowPasswordCreate] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'promote' | 'password'; membershipId: string } | null>(null);

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
    const settingsPayload = await readJson<{ settings?: PlatformSettings }>('/api/platform/settings');
    setSettings({
      accessPolicy: { ...defaultSettings.accessPolicy, ...settingsPayload.settings?.accessPolicy },
      defaults: { ...defaultSettings.defaults, ...settingsPayload.settings?.defaults },
      governance: { ...defaultSettings.governance, ...settingsPayload.settings?.governance },
    });
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const canCreateAdmin = Boolean(form.fullName.trim() && form.email.trim() && form.password.length >= 10 && !loading);
  const canPromote = Boolean(ownerForm.membershipId && !loading);
  const canResetPassword = Boolean(passwordForm.membershipId && passwordForm.password.length >= 10 && !loading);
  const canEditAdmin = Boolean(editForm.membershipId && editForm.fullName.trim() && editForm.email.trim() && !loading);

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

  const editAdmin = async () => {
    if (!editForm.membershipId || !editForm.fullName.trim() || !editForm.email.trim()) {
      setMessage('Select an admin and enter name/email.');
      return;
    }

    setLoading(true);
    try {
      await readJson(`/api/admins/${editForm.membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email,
          phone: editForm.phone || undefined,
        }),
      });
      await refresh();
      setEditForm({ membershipId: '', fullName: '', email: '', phone: '' });
      setMessage('Platform admin updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openEditAdmin = (admin: PlatformAdminRow) => {
    setEditForm({
      membershipId: admin.membershipId,
      fullName: admin.fullName || '',
      email: admin.email || '',
      phone: admin.phone || '',
    });
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

  const saveSettings = async () => {
    setLoading(true);
    try {
      await readJson('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setMessage('Platform settings updated.');
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
      <section className="mb-6 max-w-[820px]">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Platform Settings</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          Restricted owner-level and scoped admin configuration changes belong in this settings area.
        </p>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Bootstrap the first admin with a custom email such as <code>nurprodev@gmail.com</code>, then add more platform
          admins here later during handover.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Add Platform Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <Input value={form.fullName} onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))} placeholder="Full name" />
              <Input value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} placeholder="Email" />
              <Input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder="Phone (optional)" />
              <div className="relative">
                <Input value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} type={showPasswordCreate ? 'text' : 'password'} placeholder="Temporary password" />
                <button type="button" onClick={() => setShowPasswordCreate((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPasswordCreate ? 'Hide password' : 'Show password'}>
                  {showPasswordCreate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={createAdmin} disabled={!canCreateAdmin}>Create Admin</Button>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
              Use this password as the dashboard login password for the new platform admin.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Promote to Platform Owner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <select
                value={ownerForm.membershipId}
                onChange={(e) => setOwnerForm({ membershipId: e.target.value })}
                className="border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs h-10"
              >
                {admins.map((admin) => (
                  <option key={admin.membershipId} value={admin.membershipId}>
                    {admin.fullName || admin.email || admin.userId} · {admin.baseRoleCode}
                  </option>
                ))}
              </select>
              <Button onClick={() => setConfirmAction({ type: 'promote', membershipId: ownerForm.membershipId })} disabled={!canPromote} variant="outline">
                Promote Selected Admin
              </Button>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
              Use this during handover to make the real owner a platform owner.
            </p>
            {selectedOwner ? (
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Selected: {selectedOwner.fullName || selectedOwner.email || selectedOwner.userId}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reset Platform Admin Password</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <select
                value={passwordForm.membershipId}
                onChange={(e) => setPasswordForm((v) => ({ ...v, membershipId: e.target.value }))}
                className="border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs h-10"
              >
                {admins.map((admin) => (
                  <option key={admin.membershipId} value={admin.membershipId}>
                    {admin.fullName || admin.email || admin.userId} · {admin.baseRoleCode}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Input value={passwordForm.password} onChange={(e) => setPasswordForm((v) => ({ ...v, password: e.target.value }))} type={showPasswordReset ? 'text' : 'password'} placeholder="New password" />
                <button type="button" onClick={() => setShowPasswordReset((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPasswordReset ? 'Hide password' : 'Show password'}>
                  {showPasswordReset ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={() => setConfirmAction({ type: 'password', membershipId: passwordForm.membershipId })} disabled={!canResetPassword} variant="outline">
                Update Password
              </Button>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
              This is the password the admin uses to sign into the login screen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Owners control destructive actions</span>
              <input
                type="checkbox"
                checked={settings.accessPolicy.ownerControlsDestructiveActions}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  accessPolicy: { ...current.accessPolicy, ownerControlsDestructiveActions: e.target.checked },
                }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Managers can manage salesmen</span>
              <input
                type="checkbox"
                checked={settings.accessPolicy.managerCanManageSalesmen}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  accessPolicy: { ...current.accessPolicy, managerCanManageSalesmen: e.target.checked },
                }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Managers can remove salesmen</span>
              <input
                type="checkbox"
                checked={settings.accessPolicy.managerCanRemoveSalesmen}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  accessPolicy: { ...current.accessPolicy, managerCanRemoveSalesmen: e.target.checked },
                }))}
              />
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Platform defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={settings.defaults.operatingHours}
              onChange={(e) => setSettings((current) => ({
                ...current,
                defaults: { ...current.defaults, operatingHours: e.target.value },
              }))}
              placeholder="09:00-18:00"
            />
            <Input
              value={settings.defaults.notificationsEmail}
              onChange={(e) => setSettings((current) => ({
                ...current,
                defaults: { ...current.defaults, notificationsEmail: e.target.value },
              }))}
              placeholder="ops@example.com"
            />
            <Input
              type="number"
              value={settings.defaults.reportWindowDays}
              onChange={(e) => setSettings((current) => ({
                ...current,
                defaults: { ...current.defaults, reportWindowDays: Number(e.target.value || 0) },
              }))}
              placeholder="30"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Governance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Require delete confirmation</span>
              <input
                type="checkbox"
                checked={settings.governance.requireConfirmationForDeletes}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  governance: { ...current.governance, requireConfirmationForDeletes: e.target.checked },
                }))}
              />
            </label>
            <Input
              type="number"
              value={settings.governance.auditRetentionDays}
              onChange={(e) => setSettings((current) => ({
                ...current,
                governance: { ...current.governance, auditRetentionDays: Number(e.target.value || 0) },
              }))}
              placeholder="365"
            />
            <Input
              type="number"
              value={settings.governance.changeReviewMinutes}
              onChange={(e) => setSettings((current) => ({
                ...current,
                governance: { ...current.governance, changeReviewMinutes: Number(e.target.value || 0) },
              }))}
              placeholder="15"
            />
            <Button onClick={saveSettings} disabled={loading} variant="outline" className="w-full">
              Save Platform Settings
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Current Platform Admins</h3>
        {admins.length ? (
          admins.map((admin) => (
            <Card key={admin.membershipId}>
              <CardContent className="pt-[var(--erp-card-py)]">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-lg font-semibold">{admin.fullName || admin.email || admin.userId}</div>
                    <div className="text-sm text-muted-foreground">{admin.email || '—'} · {admin.phone || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      Base role: {admin.baseRoleCode} · Status: {admin.status}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-xs text-muted-foreground text-right">
                      <div>{new Date(admin.createdAt).toLocaleString()}</div>
                      <div>{admin.bundleRoleCodes.length ? admin.bundleRoleCodes.join(', ') : 'No bundles'}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEditAdmin(admin)}>
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-[var(--erp-card-py)]">
              <p className="text-sm text-muted-foreground">No platform admins found yet.</p>
            </CardContent>
          </Card>
        )}
      </section>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Operator Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>

      {editForm.membershipId && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Edit Platform Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <Input value={editForm.fullName} onChange={(e) => setEditForm((v) => ({ ...v, fullName: e.target.value }))} placeholder="Full name" />
              <Input value={editForm.email} onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))} placeholder="Email" />
              <Input value={editForm.phone} onChange={(e) => setEditForm((v) => ({ ...v, phone: e.target.value }))} placeholder="Phone (optional)" />
              <div className="flex gap-2">
                <Button onClick={editAdmin} disabled={!canEditAdmin}>Save Changes</Button>
                <Button onClick={() => setEditForm({ membershipId: '', fullName: '', email: '', phone: '' })} variant="outline">Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>{confirmAction.type === 'promote' ? 'Confirm Promotion' : 'Confirm Password Reset'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {confirmAction.type === 'promote'
                  ? 'Are you sure you want to promote this admin to platform owner? This is a powerful role upgrade.'
                  : 'Are you sure you want to reset this admin\'s password? They will need the new password to log in.'}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (confirmAction.type === 'promote') {
                      void promoteToOwner();
                    } else {
                      void resetPassword();
                    }
                    setConfirmAction(null);
                  }}
                  variant={confirmAction.type === 'promote' ? 'default' : 'destructive'}
                >
                  {confirmAction.type === 'promote' ? 'Promote' : 'Reset Password'}
                </Button>
                <Button onClick={() => setConfirmAction(null)} variant="outline">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
