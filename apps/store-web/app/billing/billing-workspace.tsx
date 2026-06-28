'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  metricLabelStyle,
  metricValueStyle,
  pageShellStyle,
  secondaryButtonStyle,
  tokenMutedStyle,
  surfaceCardStyle,
} from '../motocore-theme';

type Plan = {
  id: string;
  code: 'basic' | 'standard' | 'pro';
  name: string;
  price_amount: string | number;
  billing_cycle: string;
  features_json?: string[] | Record<string, unknown> | null;
  status: string;
};

type Subscription = {
  id: string;
  start_at: string;
  renewal_at?: string | null;
  status: string;
  auto_renew: boolean;
  plan_code: string;
  plan_name: string;
  price_amount: string | number;
  billing_cycle: string;
  features_json?: string[] | Record<string, unknown> | null;
} | null;

type Invoice = {
  id: string;
  invoice_no: string;
  invoice_type: string;
  total_amount: string | number;
  status: string;
  due_at?: string | null;
  issued_at?: string | null;
  paid_at?: string | null;
  paid_amount: string | number;
};

type InvoiceDetail = {
  invoice: Invoice & {
    subtotal_amount?: string | number;
    discount_amount?: string | number;
    tax_amount?: string | number;
  };
  payments: Array<{
    id: string;
    payment_method: string;
    gateway_provider?: string | null;
    amount: string | number;
    reference_no?: string | null;
    status: string;
    paid_at?: string | null;
  }>;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function BillingWorkspace({ canManageBilling }: { canManageBilling: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [message, setMessage] = useState('Billing workspace is ready.');
  const [loading, setLoading] = useState(false);
  const [changeForm, setChangeForm] = useState({ planCode: 'basic', autoRenew: true });
  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: 'gateway',
    gatewayProvider: '',
    amount: '',
    referenceNo: '',
  });

  const remainingAmount = selectedInvoice
    ? Math.max(0, Number(selectedInvoice.invoice.total_amount) - Number(selectedInvoice.invoice.paid_amount))
    : 0;
  const canUpdateSubscription = Boolean(plans.length && !loading && changeForm.planCode);
  const canPayInvoice = Boolean(selectedInvoice && paymentForm.amount && !loading);

  const refresh = async () => {
    const [planPayload, subscriptionPayload, invoicePayload] = await Promise.all([
      readJson<{ plans: Plan[] }>('/api/billing/plans'),
      readJson<{ subscription: Subscription }>('/api/billing/subscription'),
      readJson<{ invoices: Invoice[] }>('/api/billing/invoices'),
    ]);
    setPlans(planPayload.plans ?? []);
    setSubscription(subscriptionPayload.subscription ?? null);
    setInvoices(invoicePayload.invoices ?? []);
    if (subscriptionPayload.subscription?.plan_code) {
      setChangeForm((v) => ({ ...v, planCode: subscriptionPayload.subscription?.plan_code || 'basic' }));
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const loadInvoice = async (invoiceId: string) => {
    try {
      const payload = await readJson<InvoiceDetail>(`/api/billing/invoices/${invoiceId}`);
      setSelectedInvoice(payload);
      setPaymentForm((v) => ({ ...v, amount: String(Number(payload.invoice.total_amount) - Number(payload.invoice.paid_amount)) }));
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const changeSubscription = async () => {
    setLoading(true);
    try {
      await readJson('/api/billing/subscription/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changeForm),
      });
      await refresh();
      setMessage('Subscription updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const payInvoice = async () => {
    if (!selectedInvoice || !paymentForm.amount) return;
    setLoading(true);
    try {
      await readJson(`/api/billing/invoices/${selectedInvoice.invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: paymentForm.paymentMethod,
          gatewayProvider: paymentForm.gatewayProvider || undefined,
          amount: Number(paymentForm.amount),
          referenceNo: paymentForm.referenceNo || undefined,
          status: 'paid',
        }),
      });
      await refresh();
      await loadInvoice(selectedInvoice.invoice.id);
      setMessage('Invoice payment recorded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canManageBilling) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Billing access limited</h3>
          <p style={tokenMutedStyle}>Only the store owner can manage billing, plans, and invoice payments.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Current Subscription</h3>
          {subscription ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{subscription.plan_name}</div>
              <div style={tokenMutedStyle}>
                {subscription.status} · {subscription.price_amount} / {subscription.billing_cycle}
              </div>
              <div style={{ color: '#64748b' }}>
                Renewal: {subscription.renewal_at ? new Date(subscription.renewal_at).toLocaleString() : '—'}
              </div>
            </>
          ) : (
            <p style={tokenMutedStyle}>No active subscription found.</p>
          )}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Change Plan</h3>
          {plans.length ? (
            <select value={changeForm.planCode} onChange={(e) => setChangeForm((v) => ({ ...v, planCode: e.target.value }))} style={{ ...fieldStyle, marginBottom: 10 }}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.code}>
                  {plan.name} · {plan.price_amount} / {plan.billing_cycle}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ ...emptyStateStyle, marginBottom: 10 }}>
              No plans are loaded yet. Connect the billing API before trying to change the subscription.
            </div>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={changeForm.autoRenew} onChange={(e) => setChangeForm((v) => ({ ...v, autoRenew: e.target.checked }))} />
            Auto renew
          </label>
          <button onClick={changeSubscription} style={secondaryButtonStyle} disabled={!canUpdateSubscription}>
            Update Subscription
          </button>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Plans</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {plans.length ? (
              plans.map((plan) => (
                <article key={plan.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{plan.name}</div>
                  <div style={{ color: '#475569' }}>
                    {plan.price_amount} / {plan.billing_cycle}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {Array.isArray(plan.features_json) ? plan.features_json.join(', ') : 'Feature set configured'}
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No plan definitions are available yet.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Invoices</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {invoices.length ? (
              invoices.map((invoice) => (
                <article key={invoice.id} onClick={() => loadInvoice(invoice.id)} style={{ ...surfaceCardStyle, padding: 14, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{invoice.invoice_no}</div>
                  <div style={{ color: '#475569' }}>
                    {invoice.invoice_type} · {invoice.status}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    Total: {invoice.total_amount} · Paid: {invoice.paid_amount}
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No invoices are ready for review yet.</div>
            )}
          </div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Invoice Detail</h3>
        {!selectedInvoice ? (
          <p style={tokenMutedStyle}>Select an invoice to review payments or record a new payment.</p>
        ) : (
          <section style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{selectedInvoice.invoice.invoice_no}</div>
              <div style={{ color: '#475569' }}>
                {selectedInvoice.invoice.status} · Total: {selectedInvoice.invoice.total_amount}
              </div>
              <div style={{ color: '#64748b' }}>Remaining balance: {remainingAmount}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((v) => ({ ...v, paymentMethod: e.target.value }))} style={fieldStyle}>
                <option value="gateway">Gateway</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mfs">MFS</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
              <input value={paymentForm.gatewayProvider} onChange={(e) => setPaymentForm((v) => ({ ...v, gatewayProvider: e.target.value }))} style={fieldStyle} placeholder="Gateway provider" />
              <input value={paymentForm.amount} onChange={(e) => setPaymentForm((v) => ({ ...v, amount: e.target.value }))} style={fieldStyle} placeholder="Amount" />
              <input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm((v) => ({ ...v, referenceNo: e.target.value }))} style={fieldStyle} placeholder="Reference no" />
            </div>
            <button onClick={payInvoice} style={secondaryButtonStyle} disabled={!canPayInvoice}>Record Payment</button>
            <div style={{ display: 'grid', gap: 8 }}>
              {selectedInvoice.payments.length ? (
                selectedInvoice.payments.map((payment) => (
                  <article key={payment.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                    <div style={{ fontWeight: 600 }}>{payment.payment_method}</div>
                    <div style={{ color: '#475569' }}>
                      {payment.status} · {payment.amount}
                    </div>
                    <div style={{ color: '#64748b' }}>{payment.reference_no || 'No reference'}</div>
                  </article>
                ))
              ) : (
                <div style={emptyStateStyle}>No payment records exist for this invoice yet.</div>
              )}
            </div>
          </section>
        )}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
