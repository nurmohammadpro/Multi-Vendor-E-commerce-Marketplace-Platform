'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  logo_url?: string | null;
  address_text?: string | null;
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

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  price_amount: string;
  billing_cycle: string;
  features_json: string[];
};

type StoreFormState = {
  name: string;
  nameBn: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  locale: StoreLocale;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
  planCode: string;
};

const emptyForm: StoreFormState = {
  name: '',
  nameBn: '',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
  timezone: 'Asia/Dhaka',
  locale: 'en',
  ownerFullName: '',
  ownerEmail: '',
  ownerPhone: '',
  ownerPassword: '',
  planCode: 'basic',
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

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read logo file.'));
    reader.readAsDataURL(file);
  });
}

export function StoresWorkspace() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [message, setMessage] = useState('Platform store operations are ready.');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StoreStatus>('all');
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [form, setForm] = useState<StoreFormState>(emptyForm);
  const [createdLogin, setCreatedLogin] = useState<{
    storeName: string;
    storeCode: string;
    slug: string;
    identifier: string;
    password: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<StoreRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [ownerPasswordTarget, setOwnerPasswordTarget] = useState<StoreRow | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPasswordOwner, setShowPasswordOwner] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  const refresh = async () => {
    const payload = await readJson<{ stores: StoreRow[] }>('/api/stores');
    setStores(payload.stores ?? []);
  };

  const fetchPlans = async () => {
    try {
      const payload = await readJson<{ plans: BillingPlan[] }>('/api/billing/plans');
      setPlans(payload.plans ?? []);
    } catch { /* plans are optional; keep defaults */ }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
    void fetchPlans();
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
    setCreatedLogin(null);
    setFormErrors({});
    setMessage('Ready to add a new store.');
  };

  const clearFormState = () => {
    setEditingStoreId(null);
    setForm({ ...emptyForm, planCode: form.planCode });
    setFormErrors({});
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Store name is required.';
    if (!form.phone.trim()) nextErrors.phone = 'Phone is required.';
    if (!form.ownerFullName.trim() && !editingStoreId) nextErrors.ownerFullName = 'Owner full name is required.';
    if (!editingStoreId && !form.ownerEmail.trim() && !form.ownerPhone.trim()) {
      nextErrors.ownerContact = 'Owner email or phone is required.';
    }
    if (!editingStoreId && form.ownerPassword.length < 10) {
      nextErrors.ownerPassword = 'Use at least 10 characters.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const copyText = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500);
    } catch {
      setMessage('Copy failed. Please select the value manually.');
    }
  };

  const beginEdit = (store: StoreRow) => {
    setEditingStoreId(store.id);
    setForm({
      name: store.name,
      nameBn: '',
      logoUrl: store.logo_url || '',
      address: store.address_text || '',
      phone: store.phone,
      email: store.email || '',
      timezone: 'Asia/Dhaka',
      locale: 'en',
      ownerFullName: store.owner_name || '',
      ownerEmail: store.owner_email || '',
      ownerPhone: '',
      ownerPassword: '',
      planCode: 'basic',
    });
    setMessage(`Editing ${store.name}.`);
  };

  const saveStore = async () => {
    if (!validateForm()) {
      setMessage('Fix the highlighted fields and try again.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        nameBn: form.nameBn.trim() || undefined,
        logoUrl: form.logoUrl.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        timezone: form.timezone.trim() || 'Asia/Dhaka',
        locale: form.locale,
        ownerFullName: form.ownerFullName.trim(),
        ownerEmail: form.ownerEmail.trim() || undefined,
        ownerPhone: form.ownerPhone.trim() || undefined,
        ownerPassword: form.ownerPassword,
        planCode: form.planCode || 'basic',
      };

      if (editingStoreId) {
        await readJson(`/api/stores/${editingStoreId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name,
            nameBn: payload.nameBn ?? null,
            logoUrl: payload.logoUrl ?? null,
            address: payload.address ?? null,
            phone: payload.phone,
            email: payload.email ?? null,
          }),
        });
        setMessage(`Updated ${payload.name}.`);
      } else {
        const created = await readJson<{ store: StoreRow; owner?: { fullName: string; email?: string | null; phone?: string | null }; login?: { identifier: string; password: string } }>('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setCreatedLogin({
          storeName: created.store.name,
          storeCode: created.store.store_code,
          slug: created.store.slug,
          identifier: created.login?.identifier || payload.ownerEmail || payload.ownerPhone || '',
          password: created.login?.password || payload.ownerPassword,
        });
        setMessage(`Created ${payload.name}. Code: ${created.store.store_code}. Slug: ${created.store.slug}.`);
      }

      await refresh();
      if (editingStoreId) {
        resetForm();
      } else {
        clearFormState();
      }
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== deleteTarget.name) {
      setMessage(`Type ${deleteTarget.name} to confirm deletion.`);
      return;
    }

    setLoading(true);
    try {
      await readJson(`/api/stores/${deleteTarget.id}`, { method: 'DELETE' });
      await refresh();
      setMessage(`Deleted ${deleteTarget.name}.`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const rotateOwnerPassword = async () => {
    if (!ownerPasswordTarget || ownerPassword.length < 10) {
      setMessage('Enter a password with at least 10 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await readJson<{ password?: string }>(`/api/stores/${ownerPasswordTarget.id}/owner-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: ownerPassword }),
      });
      setMessage(`Owner password rotated for ${ownerPasswordTarget.name}.`);
      setCreatedLogin((current) => current ? { ...current, password: response.password || ownerPassword } : current);
      setOwnerPasswordTarget(null);
      setOwnerPassword('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please upload an image file for the store logo.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage('Store logo must be 1MB or smaller.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({ ...current, logoUrl: dataUrl }));
      setMessage('Store logo uploaded and ready to save.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      event.target.value = '';
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
              <Label htmlFor="storeName">Store name</Label>
              <Input
                id="storeName"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Demo Store"
              />
              {formErrors.name ? <p className="text-xs text-destructive">{formErrors.name}</p> : null}
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
              <Label htmlFor="storeLogoUrl">Store logo URL</Label>
              <Input
                id="storeLogoUrl"
                type="url"
                value={form.logoUrl}
                onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                placeholder="https://example.com/store-logo.svg"
              />
              <p className="text-xs text-muted-foreground">
                This logo will be shown at the top of the store sidebar.
              </p>
              <Input id="storeLogoFile" type="file" accept="image/*" onChange={(event) => void handleLogoFileChange(event)} />
              {form.logoUrl ? (
                <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                  <img src={form.logoUrl} alt="Store logo preview" className="h-14 w-14 rounded-md object-contain bg-white p-1" />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, logoUrl: '' }))}
                  >
                    Remove logo
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeAddress">Store address</Label>
              <textarea
                id="storeAddress"
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="House, road, area, city"
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
              {formErrors.phone ? <p className="text-xs text-destructive">{formErrors.phone}</p> : null}
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
            {!editingStoreId ? (
              <div className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-3">
                <div className="text-sm font-medium">Store owner login</div>
                <p className="text-xs text-muted-foreground">
                  These credentials are used for the store console. Use at least one login identifier.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="ownerFullName">Owner full name</Label>
                <Input
                  id="ownerFullName"
                  value={form.ownerFullName}
                  onChange={(event) => setForm((current) => ({ ...current, ownerFullName: event.target.value }))}
                  placeholder="Store Owner"
                />
                {formErrors.ownerFullName ? <p className="text-xs text-destructive">{formErrors.ownerFullName}</p> : null}
              </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerEmail">Owner email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                  placeholder="owner@example.com"
                />
              </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerPhone">Owner phone</Label>
                <Input
                  id="ownerPhone"
                  value={form.ownerPhone}
                  onChange={(event) => setForm((current) => ({ ...current, ownerPhone: event.target.value }))}
                  placeholder="+8801000000000"
                />
                {formErrors.ownerContact ? <p className="text-xs text-destructive">{formErrors.ownerContact}</p> : null}
              </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerPassword">Initial password</Label>
                <div className="relative">
                  <Input
                    id="ownerPassword"
                    type={showPasswordOwner ? 'text' : 'password'}
                    value={form.ownerPassword}
                    onChange={(event) => setForm((current) => ({ ...current, ownerPassword: event.target.value }))}
                    placeholder="Create a strong password"
                  />
                  <button type="button" onClick={() => setShowPasswordOwner((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPasswordOwner ? 'Hide password' : 'Show password'}>
                    {showPasswordOwner ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {formErrors.ownerPassword ? <p className="text-xs text-destructive">{formErrors.ownerPassword}</p> : null}
              </div>
            </div>
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                Owner login details are edited from the owner record, not the store profile.
              </div>
            )}
            {!editingStoreId && plans.length > 0 ? (
              <div className="space-y-2">
                <Label>Subscription plan</Label>
                <Select
                  value={form.planCode}
                  onValueChange={(value) => setForm((current) => ({ ...current, planCode: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.code}>
                        {plan.name} ({plan.code}) — {Number(plan.price_amount) === 0 ? 'Free' : `BDT ${Number(plan.price_amount).toFixed(0)}`}/{plan.billing_cycle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {plans.find((p) => p.code === form.planCode) ? (
                  <p className="text-xs text-muted-foreground">
                    Features: {(plans.find((p) => p.code === form.planCode)?.features_json ?? []).join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}
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
            {!editingStoreId ? (
              <p className="text-xs text-muted-foreground">
                Store code and slug are generated automatically when you save the store.
              </p>
            ) : null}
          </CardContent>
          </Card>

          {createdLogin ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm">Created login details</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Share these with the store owner once. The password is shown here for this session only.
                </p>
              </CardHeader>
          <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">Store:</span> {createdLogin.storeName}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">Code:</span> {createdLogin.storeCode}</span>
                  <Button variant="outline" size="sm" onClick={() => void copyText(createdLogin.storeCode, 'code')}>
                    {copiedField === 'code' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">Slug:</span> {createdLogin.slug}</span>
                  <Button variant="outline" size="sm" onClick={() => void copyText(createdLogin.slug, 'slug')}>
                    {copiedField === 'slug' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">Login:</span> {createdLogin.identifier}</span>
                  <Button variant="outline" size="sm" onClick={() => void copyText(createdLogin.identifier, 'identifier')}>
                    {copiedField === 'identifier' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">Password:</span> {createdLogin.password}</span>
                  <Button variant="outline" size="sm" onClick={() => void copyText(createdLogin.password, 'password')}>
                    {copiedField === 'password' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
                    {store.logo_url ? (
                      <div className="text-xs text-muted-foreground">Logo: {store.logo_url}</div>
                    ) : null}
                    {store.address_text ? (
                      <div className="text-xs text-muted-foreground">Address: {store.address_text}</div>
                    ) : null}
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
                    <Button variant="outline" size="sm" onClick={() => setOwnerPasswordTarget(store)} disabled={loading || saving}>
                      Reset owner password
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
                      onClick={() => setDeleteTarget(store)}
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

          <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteConfirmText('');
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete store</DialogTitle>
                <DialogDescription>
                  Type the store name to confirm deletion. This action is only available for inactive stores that are eligible for removal.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="deleteConfirm">Confirm store name</Label>
                <Input
                  id="deleteConfirm"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder={deleteTarget?.name ?? 'Store name'}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => void confirmDelete()} disabled={!deleteTarget || deleteConfirmText.trim() !== deleteTarget.name}>
                  Delete store
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(ownerPasswordTarget)} onOpenChange={(open) => {
            if (!open) {
              setOwnerPasswordTarget(null);
              setOwnerPassword('');
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset owner password</DialogTitle>
                <DialogDescription>
                  This updates the login password for the store owner account linked to {ownerPasswordTarget?.name || 'the store'}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="ownerPasswordReset">New password</Label>
                <div className="relative">
                  <Input
                    id="ownerPasswordReset"
                    type={showPasswordReset ? 'text' : 'password'}
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    placeholder="Create a new password"
                  />
                  <button type="button" onClick={() => setShowPasswordReset((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPasswordReset ? 'Hide password' : 'Show password'}>
                    {showPasswordReset ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOwnerPasswordTarget(null)}>Cancel</Button>
                <Button onClick={() => void rotateOwnerPassword()} disabled={ownerPassword.length < 10}>
                  Update password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
