'use client';

import { useEffect, useState } from 'react';
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

const ALL_FEATURES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'pos', label: 'POS' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'customers', label: 'Customers' },
  { key: 'reports', label: 'Reports' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'support', label: 'Support' },
  { key: 'staff', label: 'Staff' },
  { key: 'expenses', label: 'Daily Expenses' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'banking', label: 'Banking' },
  { key: 'billing', label: 'Billing' },
  { key: 'settings', label: 'Settings' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'session', label: 'Session' },
];

type Plan = {
  id: string;
  code: string;
  name: string;
  price_amount: string;
  signup_fee: string;
  billing_cycle: string;
  max_users: number;
  max_locations: number;
  features_json: string[] | Record<string, unknown> | null;
  is_custom: boolean;
  status: string;
};

type PlanForm = {
  code: string;
  name: string;
  priceAmount: string;
  signupFee: string;
  billingCycle: 'monthly' | 'yearly';
  maxUsers: string;
  maxLocations: string;
  features: string[];
};

const emptyForm: PlanForm = {
  code: '',
  name: '',
  priceAmount: '',
  signupFee: '0',
  billingCycle: 'monthly',
  maxUsers: '1',
  maxLocations: '1',
  features: ['dashboard', 'inventory', 'pos', 'purchases', 'billing', 'settings'],
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && (payload as any).error
        ? (payload as any).error
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

export function BillingWorkspace() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const { plans: planList } = await readJson<{ plans: Plan[] }>('/api/admin/billing/plans');
      setPlans(planList);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditPlan(null);
    setShowCreate(true);
  };

  const openEdit = (plan: Plan) => {
    const features: string[] = Array.isArray(plan.features_json)
      ? plan.features_json
      : plan.features_json && typeof plan.features_json === 'object'
        ? Object.keys(plan.features_json as Record<string, unknown>)
        : [];
    setForm({
      code: plan.code,
      name: plan.name,
      priceAmount: String(Number(plan.price_amount)),
      signupFee: String(Number(plan.signup_fee)),
      billingCycle: plan.billing_cycle as 'monthly' | 'yearly',
      maxUsers: String(plan.max_users),
      maxLocations: String(plan.max_locations),
      features,
    });
    setEditPlan(plan);
    setShowCreate(true);
  };

  const toggleFeature = (key: string) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(key)
        ? prev.features.filter((f) => f !== key)
        : [...prev.features, key],
    }));
  };

  const savePlan = async () => {
    setBusy(true);
    try {
      const body = {
        code: form.code,
        name: form.name,
        priceAmount: Number(form.priceAmount),
        signupFee: Number(form.signupFee),
        billingCycle: form.billingCycle,
        maxUsers: Number(form.maxUsers),
        maxLocations: Number(form.maxLocations),
        features: form.features,
      };

      if (editPlan) {
        await readJson(`/api/admin/billing/plans/${editPlan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage('Plan updated.');
      } else {
        await readJson('/api/admin/billing/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage('Plan created.');
      }

      setShowCreate(false);
      setEditPlan(null);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deactivatePlan = async (planId: string) => {
    setBusy(true);
    try {
      await readJson(`/api/admin/billing/plans/${planId}`, { method: 'DELETE' });
      setMessage('Custom plan deactivated.');
      setDeleteId(null);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const formatFeatures = (plan: Plan) => {
    const features = Array.isArray(plan.features_json)
      ? plan.features_json
      : plan.features_json && typeof plan.features_json === 'object'
        ? Object.keys(plan.features_json as Record<string, unknown>)
        : [];
    return features.length
      ? features.map((f) => f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(', ')
      : 'All basic features';
  };

  return (
    <section style={{ display: 'grid', gap: 20 }}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Plans</CardTitle>
          <Button onClick={openCreate}>Create Custom Plan</Button>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Loading plans…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 pr-4 font-medium">Signup Fee</th>
                    <th className="py-2 pr-4 font-medium">Users</th>
                    <th className="py-2 pr-4 font-medium">Locations</th>
                    <th className="py-2 pr-4 font-medium">Cycle</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Features</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {plan.name}
                        {plan.is_custom && <Badge className="ml-2" variant="secondary">Custom</Badge>}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{plan.code}</td>
                      <td className="py-2 pr-4">BDT {Number(plan.price_amount).toLocaleString()}</td>
                      <td className="py-2 pr-4">BDT {Number(plan.signup_fee).toLocaleString()}</td>
                      <td className="py-2 pr-4">{plan.max_users}</td>
                      <td className="py-2 pr-4">{plan.max_locations}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{plan.billing_cycle}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                          {plan.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 max-w-[200px] truncate text-muted-foreground" title={formatFeatures(plan)}>
                        {formatFeatures(plan)}
                      </td>
                      <td className="py-2">
                        {plan.is_custom && plan.status === 'active' ? (
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                            <Button variant="destructive" size="sm" onClick={() => setDeleteId(plan.id)}>Deactivate</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {message && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm">{message}</p>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Plan Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Edit Custom Plan' : 'Create Custom Plan'}</DialogTitle>
            <DialogDescription>
              {editPlan
                ? 'Update pricing, limits, and feature toggles for this custom plan.'
                : 'Define a custom plan with your own pricing, user/location limits, and feature set.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="e.g. custom_gold" disabled={!!editPlan} />
              </div>
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Custom Gold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Price (BDT/month)</Label>
                <Input type="number" min="0" value={form.priceAmount} onChange={(e) => setForm((p) => ({ ...p, priceAmount: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Signup Fee (BDT)</Label>
                <Input type="number" min="0" value={form.signupFee} onChange={(e) => setForm((p) => ({ ...p, signupFee: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label>Billing Cycle</Label>
                <Select value={form.billingCycle} onValueChange={(v: string) => setForm((p) => ({ ...p, billingCycle: v as 'monthly' | 'yearly' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Max Users</Label>
                <Input type="number" min="1" value={form.maxUsers} onChange={(e) => setForm((p) => ({ ...p, maxUsers: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Max Locations</Label>
                <Input type="number" min="1" value={form.maxLocations} onChange={(e) => setForm((p) => ({ ...p, maxLocations: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Feature Toggles</Label>
              <div className="grid grid-cols-3 gap-2">
                {ALL_FEATURES.map((feature) => (
                  <label key={feature.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.features.includes(feature.key)}
                      onChange={() => toggleFeature(feature.key)}
                      className="size-4"
                    />
                    {feature.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => void savePlan()} disabled={busy || !form.code || !form.name || !form.priceAmount}>
              {busy ? 'Saving…' : editPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Plan</DialogTitle>
            <DialogDescription>
              This will deactivate the custom plan. Stores currently on this plan will need to switch to a different plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void deactivatePlan(deleteId!)} disabled={busy}>
              {busy ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
