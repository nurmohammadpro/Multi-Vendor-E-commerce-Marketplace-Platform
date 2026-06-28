'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type StoreStatus = 'pending' | 'active' | 'suspended' | 'inactive';
type StoreLocale = 'en' | 'bn';

type StoreRow = {
  id: string;
  store_code: string;
  name: string;
  slug: string;
  phone: string;
  email?: string | null;
  status: StoreStatus;
  subscription_status: string;
  owner_name?: string | null;
  owner_email?: string | null;
  staff_count: number;
  billing_status?: string | null;
  billing_due_at?: string | null;
  subscription_start_at?: string | null;
  subscription_end_at?: string | null;
  subscription_auto_renew?: boolean | null;
  deactivation_review_at?: string | null;
  delete_eligible_at?: string | null;
  can_delete?: boolean;
  should_deactivate_review?: boolean;
};

type StoreFormState = {
  storeCode: string;
  name: string;
  nameBn: string;
  slug: string;
  phone: string;
  email: string;
  timezone: string;
  locale: StoreLocale;
};

const emptyForm: StoreFormState = {
  storeCode: '',
  name: '',
  nameBn: '',
  slug: '',
  phone: '',
  email: '',
  timezone: 'Asia/Dhaka',
  locale: 'en',
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusTone(status: StoreStatus) {
  if (status === 'active') return 'default';
  if (status === 'inactive') return 'secondary';
  if (status === 'suspended') return 'outline';
  return 'outline';
}

export function StoresWorkspace() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [message, setMessage] = useState('Platform store operations are ready.');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StoreStatus>('all');
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [form, setForm] = useState<StoreFormState>(emptyForm);

  const refresh = async () => {
    const payload = await readJson<{ stores: StoreRow[] }>('/api/stores');
    setStores(payload.stores ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const filteredStores = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stores.filter((store) => {
      const matchesStatus = statusFilter === 'all' ? true : store.status === statusFilter;
      const matchesSearch = !term
        || [store.name, store.store_code, store.slug, store.owner_name, store.owner_email]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, stores]);

  const resetForm = () => {
    setEditingStoreId(null);
    setForm(emptyForm);
    setMessage('Ready to add a new store.');
  };

  const beginEdit = (store: StoreRow) => {
    setEditingStoreId(store.id);
    setForm({
      storeCode: store.store_code,
      name: store.name,
      nameBn: '',
      slug: store.slug,
      phone: store.phone,
      email: store.email || '',
      timezone: 'Asia/Dhaka',
      locale: 'en',
    });
    setMessage(`Editing ${store.name}.`);
  };

  const saveStore = async () => {
    setSaving(true);
    try {
      const payload = {
        storeCode: form.storeCode.trim(),
        name: form.name.trim(),
        nameBn: form.nameBn.trim() || undefined,
        slug: form.slug.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        timezone: form.timezone.trim() || 'Asia/Dhaka',
        locale: form.locale,
      };

      if (editingStoreId) {
        await readJson(`/api/stores/${editingStoreId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name,
            nameBn: payload.nameBn ?? null,
            phone: payload.phone,
            email: payload.email ?? null,
          }),
        });
        setMessage(`Updated ${payload.name}.`);
      } else {
        await readJson('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setMessage(`Created ${payload.name}.`);
      }

      await refresh();
      resetForm();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (storeId: string, status: StoreStatus) => {
    setLoading(true);
    try {
      await readJson(`/api/stores/${storeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refresh();
      setMessage(`Store status changed to ${status}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const deleteStore = async (store: StoreRow) => {
    if (!store.can_delete) {
      setMessage('This store is not yet eligible for deletion.');
      return;
    }

    const confirmed = window.confirm(`Delete ${store.name}? This cannot be undone.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      await readJson(`/api/stores/${store.id}`, { method: 'DELETE' });
      await refresh();
      setMessage(`Deleted ${store.name}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-[var(--erp-card-py)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Billing guardrails</div>
              <p className="text-sm text-muted-foreground">
                Stores become review-ready 7 days after the due date. Only inactive stores that stayed overdue for 3 months can be deleted manually.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">7 days → deactivation review</Badge>
              <Badge variant="destructive">3 months → delete eligible</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{editingStoreId ? 'Edit store' : 'Create store'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Stores start active. Admins may only delete a store after it is inactive and overdue by three months.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="storeCode">Store code</Label>
              <Input
                id="storeCode"
                value={form.storeCode}
                disabled={Boolean(editingStoreId)}
                onChange={(event) => setForm((current) => ({ ...current, storeCode: event.target.value }))}
                placeholder="STORE001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeName">Store name</Label>
              <Input
                id="storeName"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Demo Store"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeNameBn">Store name bn</Label>
              <Input
                id="storeNameBn"
                value={form.nameBn}
                onChange={(event) => setForm((current) => ({ ...current, nameBn: event.target.value }))}
                placeholder="ডেমো স্টোর"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeSlug">Slug</Label>
              <Input
                id="storeSlug"
                value={form.slug}
                disabled={Boolean(editingStoreId)}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                placeholder="demo-store"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storePhone">Phone</Label>
              <Input
                id="storePhone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+8801000000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeEmail">Email</Label>
              <Input
                id="storeEmail"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="owner@example.com"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="storeTimezone">Timezone</Label>
                <Input
                  id="storeTimezone"
                  value={form.timezone}
                  onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                  placeholder="Asia/Dhaka"
                />
              </div>
              <div className="space-y-2">
                <Label>Locale</Label>
                <Select
                  value={form.locale}
                  onValueChange={(value) => setForm((current) => ({ ...current, locale: value as StoreLocale }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="bn">Bangla</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => void saveStore()} disabled={saving || loading}>
                {editingStoreId ? 'Save changes' : 'Create store'}
              </Button>
              <Button variant="outline" onClick={resetForm} disabled={saving || loading}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-[var(--erp-card-py)]">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="searchStores">Search</Label>
                  <Input
                    id="searchStores"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, code, slug"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status filter</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | StoreStatus)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={resetForm} className="w-full">
                    New store
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {filteredStores.map((store) => (
            <Card key={store.id}>
              <CardContent className="pt-[var(--erp-card-py)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold">{store.name}</div>
                      <Badge variant={statusTone(store.status)}>{store.status}</Badge>
                      {store.should_deactivate_review ? <Badge variant="secondary">billing overdue</Badge> : null}
                      {store.can_delete ? <Badge variant="destructive">delete eligible</Badge> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {store.store_code} · {store.slug} · Staff {store.staff_count}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Owner: {store.owner_name || '—'} · {store.owner_email || store.email || '—'}
                    </div>
                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                      <div>Subscription: {store.subscription_status}</div>
                      <div>Billing: {store.billing_status || '—'}</div>
                      <div>Due: {formatDate(store.billing_due_at)}</div>
                      <div>Deactivation review: {formatDate(store.deactivation_review_at)}</div>
                      <div>Delete eligible: {formatDate(store.delete_eligible_at)}</div>
                      <div>Auto renew: {store.subscription_auto_renew ? 'Yes' : 'No'}</div>
                    </div>
                    {store.should_deactivate_review ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-200">
                        This store is past the billing grace period. Admins may deactivate it now, but it will not be deleted automatically.
                      </div>
                    ) : null}
                    {store.can_delete ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        This store is inactive and has passed the three-month window. Manual deletion is allowed.
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    <Button variant="outline" size="sm" onClick={() => beginEdit(store)} disabled={loading || saving}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void changeStatus(store.id, 'active')}
                      disabled={loading || saving}
                    >
                      Activate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void changeStatus(store.id, 'suspended')}
                      disabled={loading || saving}
                    >
                      Suspend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void changeStatus(store.id, 'inactive')}
                      disabled={loading || saving}
                    >
                      Deactivate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void deleteStore(store)}
                      disabled={loading || saving || !store.can_delete}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredStores.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                No stores matched your filters.
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Operator notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Active and inactive states are separate from billing eligibility.</p>
              <p>Stores become review-ready seven days after the subscription due date.</p>
              <p>Admins can only delete stores that are inactive and overdue by three months.</p>
              <p>No store is deleted automatically.</p>
              <p>{message}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
