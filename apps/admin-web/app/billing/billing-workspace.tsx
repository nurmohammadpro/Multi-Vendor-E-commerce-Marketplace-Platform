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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
  { key: 'invoices', label: 'Custom Invoices' },
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
  trial_days?: number;
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
  trialDays: string;
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
  trialDays: '15',
  features: ['dashboard', 'inventory', 'pos', 'purchases', 'billing', 'settings'],
};

type RenewalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type RenewalRequest = {
  id: string;
  store_id: string;
  store_name: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: 'monthly' | 'yearly';
  amount: string;
  payment_method: 'banglaqr' | 'bkash' | 'bank_transfer' | 'cash' | 'other';
  sender_number: string;
  transaction_id: string | null;
  note: string | null;
  status: RenewalStatus;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
};

type RenewalStatusFilter = RenewalStatus | 'all';

type RenewalDecision = {
  request: RenewalRequest;
  action: 'approve' | 'reject';
};

const RENEWAL_STATUS_FILTERS: Array<{ value: RenewalStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RENEWAL_STATUS_VARIANTS: Record<RenewalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  approved: 'secondary',
  rejected: 'destructive',
  cancelled: 'outline',
};

const PAYMENT_METHOD_LABELS: Record<RenewalRequest['payment_method'], string> = {
  banglaqr: 'BanglaQR',
  bkash: 'bKash',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
};

function formatAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString() : '0';
}

function formatLabel(value: string | null | undefined) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function readErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as { error?: unknown; message?: unknown };
  for (const candidate of [record.message, record.error]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate) && candidate.length) return candidate.map(String).join(', ');
  }
  return '';
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(readErrorDetail(payload) || `Request failed with ${response.status}`);
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
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatusFilter>('all');
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [decision, setDecision] = useState<RenewalDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

  const refresh = async () => {
    try {
      const { plans: planList } = await readJson<{ plans: Plan[] }>('/api/admin/billing/plans');
      setPlans(planList);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const refreshRenewals = async (status: RenewalStatusFilter) => {
    setRenewalLoading(true);
    try {
      const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
      const payload = await readJson<{ requests: RenewalRequest[] }>(
        `/api/admin/billing/renewal-requests${query}`,
      );
      const requests = [...(payload.requests ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRenewalRequests(requests);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setRenewalLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void refreshRenewals(renewalStatus);
  }, [renewalStatus]);

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
      trialDays: String(plan.trial_days ?? 15),
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
        trialDays: Number(form.trialDays),
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

  const pendingCount = renewalRequests.filter((request) => request.status === 'pending').length;

  const openDecision = (request: RenewalRequest, action: 'approve' | 'reject') => {
    setDecision({ request, action });
    setDecisionNote('');
  };

  const closeDecision = () => {
    setDecision(null);
    setDecisionNote('');
  };

  const submitDecision = async () => {
    if (!decision) return;
    setDecisionBusy(true);
    try {
      await readJson(`/api/admin/billing/renewal-requests/${decision.request.id}/${decision.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: decisionNote.trim() || undefined }),
      });
      setMessage(
        `Renewal request for ${decision.request.store_name} ${
          decision.action === 'approve' ? 'approved.' : 'rejected.'
        }`,
      );
      closeDecision();
      await refreshRenewals(renewalStatus);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setDecisionBusy(false);
    }
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Signup Fee</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      {plan.name}
                      {plan.is_custom ? (
                        <Badge className="ml-2" variant="secondary">Custom</Badge>
                      ) : (
                        <Badge className="ml-2" variant="outline">System</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{plan.code}</TableCell>
                    <TableCell>BDT {Number(plan.price_amount).toLocaleString()}</TableCell>
                    <TableCell>BDT {Number(plan.signup_fee).toLocaleString()}</TableCell>
                    <TableCell>{plan.max_users}</TableCell>
                    <TableCell>{plan.max_locations}</TableCell>
                    <TableCell className="text-muted-foreground">{plan.billing_cycle}</TableCell>
                    <TableCell>
                      <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                        {plan.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={formatFeatures(plan)}>
                      {formatFeatures(plan)}
                    </TableCell>
                    <TableCell>
                      {plan.status === 'active' ? (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                          <Button variant="destructive" size="sm" onClick={() => setDeleteId(plan.id)}>Deactivate</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Renewal Requests</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manual renewals paid outside the platform. Tenants scan our Bank Asia BanglaQR merchant
              code and send the number the money was sent from, so match the sender number against our
              statement before approving.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <Badge>{pendingCount} pending</Badge>}
            <Select
              value={renewalStatus}
              onValueChange={(value: string) => setRenewalStatus(value as RenewalStatusFilter)}
            >
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RENEWAL_STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {renewalLoading && renewalRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Loading renewal requests…</p>
          ) : renewalRequests.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No renewal requests yet. When a tenant pays manually and submits a renewal request, it will appear here for review.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Sender Number</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Tenant Note</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renewalRequests.map((request) => (
                  <TableRow
                    key={request.id}
                    className={request.status === 'pending' ? 'bg-amber-500/5' : undefined}
                  >
                    <TableCell className="font-medium">{request.store_name}</TableCell>
                    <TableCell>
                      <div>{request.plan_name}</div>
                      <div className="text-xs text-muted-foreground">{request.plan_code}</div>
                    </TableCell>
                    <TableCell className="font-medium">BDT {formatAmount(request.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatLabel(request.billing_cycle)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[request.payment_method] ?? formatLabel(request.payment_method)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                        {request.sender_number}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {request.transaction_id || '—'}
                    </TableCell>
                    <TableCell
                      className="max-w-[220px] truncate text-muted-foreground"
                      title={request.note || ''}
                    >
                      {request.note || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={RENEWAL_STATUS_VARIANTS[request.status] ?? 'outline'}>
                          {formatLabel(request.status)}
                        </Badge>
                        {request.decision_note ? (
                          <span
                            className="max-w-[200px] truncate text-xs text-muted-foreground"
                            title={request.decision_note}
                          >
                            {request.decision_note}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(request.created_at)}</TableCell>
                    <TableCell>
                      {request.status === 'pending' ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => openDecision(request, 'approve')}>Approve</Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDecision(request, 'reject')}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                <Label>Price (BDT/{form.billingCycle === 'yearly' ? 'year' : 'month'})</Label>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Free Trial (days)</Label>
                <Input type="number" min="0" max="365" value={form.trialDays} onChange={(e) => setForm((p) => ({ ...p, trialDays: e.target.value }))} />
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

      {/* Renewal Request Decision */}
      <Dialog open={!!decision} onOpenChange={(open) => { if (!open) closeDecision(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === 'approve' ? 'Approve Renewal Request' : 'Reject Renewal Request'}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === 'approve'
                ? 'Confirm the sender number matches our Bank Asia statement. Approving cancels the current subscription and starts a fresh billing cycle for this store.'
                : 'Rejecting leaves the current subscription untouched and closes the request.'}
            </DialogDescription>
          </DialogHeader>

          {decision ? (
            <div className="grid gap-1.5 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Store</span>
                <span className="font-medium">{decision.request.store_name}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">
                  {decision.request.plan_name} ({decision.request.plan_code})
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">BDT {formatAmount(decision.request.amount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Sender number</span>
                <span className="font-mono font-semibold">{decision.request.sender_number}</span>
              </div>
              {decision.request.transaction_id ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="font-mono text-xs">{decision.request.transaction_id}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="renewalDecisionNote">Decision note (optional)</Label>
            <Textarea
              id="renewalDecisionNote"
              rows={3}
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder="e.g. Payment confirmed against the Bank Asia statement for the sender number"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDecision}>Cancel</Button>
            <Button
              variant={decision?.action === 'reject' ? 'destructive' : 'default'}
              onClick={() => void submitDecision()}
              disabled={decisionBusy}
            >
              {decisionBusy
                ? 'Saving…'
                : decision?.action === 'approve'
                  ? 'Approve request'
                  : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
