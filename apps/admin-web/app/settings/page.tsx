'use client';

import { useEffect, useMemo, useState } from 'react';
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
              <Input value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} type="password" placeholder="Temporary password" />
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
              <Button onClick={promoteToOwner} disabled={!canPromote} variant="outline">
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
              <Input value={passwordForm.password} onChange={(e) => setPasswordForm((v) => ({ ...v, password: e.target.value }))} type="password" placeholder="New password" />
              <Button onClick={resetPassword} disabled={!canResetPassword} variant="outline">
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
                  <div className="text-xs text-muted-foreground text-right">
                    <div>{new Date(admin.createdAt).toLocaleString()}</div>
                    <div>{admin.bundleRoleCodes.length ? admin.bundleRoleCodes.join(', ') : 'No bundles'}</div>
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
    </main>
  );
}
