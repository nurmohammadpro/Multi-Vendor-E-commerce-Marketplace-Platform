'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  metricLabelStyle,
  metricValueStyle,
  neutralButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  sectionPanelStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableActionButtonStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type Plan = {
  id: string;
  code: string;
  name: string;
  price_amount: string | number;
  signup_fee: string | number;
  billing_cycle: string;
  max_users: number;
  max_locations: number;
  trial_days?: number;
  features_json?: string[] | Record<string, unknown> | null;
  status: string;
  is_custom: boolean;
};

type PlanLimits = {
  limits: { maxUsers: number; maxLocations: number; features: string[] } | null;
  usage: { activeUsers: number; totalLocations: number } | null;
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
  signup_fee?: string | number;
  billing_cycle: string;
  max_users?: number;
  max_locations?: number;
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

type Pagination = {
  page: number;
  limit: number;
  total: number;
};

type RenewalRequest = {
  id: string;
  store_id: string;
  plan_code: string;
  plan_name?: string | null;
  billing_cycle: string;
  amount: string | number;
  payment_method: string;
  sender_number: string;
  transaction_id?: string | null;
  note?: string | null;
  status: string;
  decision_note?: string | null;
  created_at: string;
  decided_at?: string | null;
};

// BanglaQR sender numbers: 11-digit Bangladeshi mobile (01XXXXXXXXX) or an
// account/transaction reference. Anything shorter is not enough to match a
// payment against our statement.
const SENDER_NUMBER_PATTERN = /^[0-9+\-\s]{4,32}$/;

function renewalAmount(subscription: Subscription): number {
  return Number(subscription?.price_amount ?? 0);
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function BillingWorkspace({ canManageBilling }: { canManageBilling: boolean }) {
  const compact = useCompactLayout();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimits>({ limits: null, usage: null });
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
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [renewalForm, setRenewalForm] = useState({ senderNumber: '', transactionId: '', note: '' });
  const [renewalError, setRenewalError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'invoices'>('overview');

  const remainingAmount = selectedInvoice
    ? Math.max(0, Number(selectedInvoice.invoice.total_amount) - Number(selectedInvoice.invoice.paid_amount))
    : 0;
  const canUpdateSubscription = Boolean(plans.length && !loading && changeForm.planCode);
  const canPayInvoice = Boolean(selectedInvoice && paymentForm.amount && !loading);
  const senderNumberValid = SENDER_NUMBER_PATTERN.test(renewalForm.senderNumber.trim());
  const canSubmitRenewal = Boolean(subscription && senderNumberValid && !loading);
  const pendingRenewal = renewalRequests.find((request) => request.status === 'pending') ?? null;

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(invoicePagination.limit),
    });
    if (invoiceSearch.trim()) params.set('search', invoiceSearch.trim());
    if (invoiceStatus) params.set('status', invoiceStatus);
    const [planPayload, subscriptionPayload, limitsPayload, invoicePayload, renewalPayload] = await Promise.all([
      readJson<{ plans: Plan[] }>('/api/billing/plans'),
      readJson<{ subscription: Subscription }>('/api/billing/subscription'),
      readJson<PlanLimits>('/api/billing/plan-limits').catch(() => ({ limits: null, usage: null })),
      readJson<{ invoices: Invoice[]; pagination?: Pagination }>(`/api/billing/invoices?${params.toString()}`),
      readJson<{ requests: RenewalRequest[] }>('/api/billing/renewal-requests').catch(() => ({ requests: [] })),
    ]);
    setPlans(planPayload.plans ?? []);
    setSubscription(subscriptionPayload.subscription ?? null);
    setPlanLimits(limitsPayload);
    setInvoices(invoicePayload.invoices ?? []);
    setRenewalRequests(renewalPayload.requests ?? []);
    setInvoicePagination(invoicePayload.pagination ?? { page: nextPage, limit: invoicePagination.limit, total: invoicePayload.invoices?.length ?? 0 });
    setInvoicePage(invoicePayload.pagination?.page ?? nextPage);
    if (subscriptionPayload.subscription?.plan_code) {
      setChangeForm((v) => ({ ...v, planCode: subscriptionPayload.subscription?.plan_code || 'basic' }));
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const totalInvoicePages = Math.max(1, Math.ceil((invoicePagination.total || 0) / (invoicePagination.limit || 20)));

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

  const submitRenewalRequest = async () => {
    if (!senderNumberValid) {
      setRenewalError('Enter the sender number you paid from — it is required to match your payment.');
      return;
    }
    setLoading(true);
    setRenewalError('');
    try {
      await readJson('/api/billing/renewal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'banglaqr',
          senderNumber: renewalForm.senderNumber.trim(),
          transactionId: renewalForm.transactionId.trim() || undefined,
          note: renewalForm.note.trim() || undefined,
        }),
      });
      setRenewalForm({ senderNumber: '', transactionId: '', note: '' });
      await refresh();
      setMessage('Renewal request submitted. We will confirm your payment and activate the subscription.');
    } catch (error) {
      const msg = (error as Error).message;
      setRenewalError(msg);
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!canManageBilling) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Billing access limited</h3>
          <p style={tokenMutedStyle}>Only the store owner can manage billing, plans, and invoice payments.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'overview' | 'plans' | 'invoices')}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'plans', label: 'Plans' },
            { key: 'invoices', label: 'Invoices' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'overview') ? (
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Current Subscription</h3>
          {subscription ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{subscription.plan_name}</div>
              <div style={tokenMutedStyle}>
                {subscription.status} · BDT {Number(subscription.price_amount).toLocaleString()} / {subscription.billing_cycle}
                {Number(subscription.signup_fee ?? 0) > 0 ? ` · BDT ${Number(subscription.signup_fee).toLocaleString()} signup fee` : ''}
              </div>
              <div style={{ color: 'var(--muted-foreground)', marginBottom: 12 }}>
                {subscription.status === 'trial' ? 'Free trial ends' : 'Renewal'}: {subscription.renewal_at ? new Date(subscription.renewal_at).toLocaleString() : '—'}
              </div>
              {planLimits.limits ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div>
                    <span style={tokenMutedStyle}>Users</span>
                    <div style={{ fontWeight: 500 }}>{planLimits.usage?.activeUsers ?? '?'} / {planLimits.limits.maxUsers}</div>
                  </div>
                  <div>
                    <span style={tokenMutedStyle}>Locations</span>
                    <div style={{ fontWeight: 500 }}>{planLimits.usage?.totalLocations ?? '?'} / {planLimits.limits.maxLocations}</div>
                  </div>
                </div>
              ) : null}
              {planLimits.limits?.features?.length ? (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {planLimits.limits.features.map((f) => (
                    <span key={f} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div style={emptyStateStyle}>No active subscription is assigned to this store yet.</div>
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
          <button onClick={changeSubscription} style={gray800ButtonStyle} disabled={!canUpdateSubscription}>
            Update Subscription
          </button>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Renew Subscription</h3>
          <p style={tokenMutedStyle}>
            Pay the plan price through our Bank Asia BanglaQR code, then send us the sender number so the
            payment can be matched against our statement. Renewals are reviewed manually.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '190px 1fr', gap: 14, alignItems: 'start', marginTop: 12 }}>
            <div>
              <img
                src="/banglaqr-payment.png"
                alt="Bank Asia BanglaQR payment code"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6, textAlign: 'center' }}>
                Scan with any BanglaQR app
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Amount to send</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  BDT {renewalAmount(subscription).toLocaleString()}
                  {subscription ? (
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted-foreground)' }}> / {subscription.billing_cycle}</span>
                  ) : null}
                </div>
              </div>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  Sender number <span style={{ color: '#dc2626' }}>*</span>
                </span>
                <input
                  value={renewalForm.senderNumber}
                  onChange={(e) => { setRenewalForm((v) => ({ ...v, senderNumber: e.target.value })); setRenewalError(''); }}
                  style={fieldStyle}
                  placeholder="01XXXXXXXXX"
                  inputMode="tel"
                  autoComplete="off"
                />
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  Required — the mobile or account number you sent the payment from.
                </span>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Transaction ID (optional)</span>
                <input
                  value={renewalForm.transactionId}
                  onChange={(e) => setRenewalForm((v) => ({ ...v, transactionId: e.target.value }))}
                  style={fieldStyle}
                  placeholder="TrxID shown by your BanglaQR app"
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Note (optional)</span>
                <input
                  value={renewalForm.note}
                  onChange={(e) => setRenewalForm((v) => ({ ...v, note: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Anything we should know about this payment"
                />
              </label>
              {renewalError ? <span style={{ fontSize: 12, color: '#dc2626' }}>{renewalError}</span> : null}
              <button onClick={submitRenewalRequest} style={gray800ButtonStyle} disabled={!canSubmitRenewal}>
                {pendingRenewal ? 'Request pending review' : 'Submit Renewal Request'}
              </button>
              {pendingRenewal ? (
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  A request is already awaiting review (sent {new Date(pendingRenewal.created_at).toLocaleString()}).
                </div>
              ) : null}
            </div>
          </div>
          {renewalRequests.length ? (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Renewal Requests</h4>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Requested</th>
                      <th style={tableHeaderCellStyle}>Plan</th>
                      <th style={tableHeaderCellStyle}>Amount</th>
                      <th style={tableHeaderCellStyle}>Sender Number</th>
                      <th style={tableHeaderCellStyle}>Transaction</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Decision Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalRequests.map((request) => (
                      <tr key={request.id}>
                        <td style={tableCellStyle}>{new Date(request.created_at).toLocaleString()}</td>
                        <td style={tableCellStyle}>{request.plan_name || request.plan_code}</td>
                        <td style={tableCellStyle}>BDT {Number(request.amount).toLocaleString()}</td>
                        <td style={tableCellStyle}>{request.sender_number}</td>
                        <td style={tableCellStyle}>{request.transaction_id || '—'}</td>
                        <td style={tableCellStyle}>{request.status}</td>
                        <td style={tableCellStyle}>{request.decision_note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </article>
      </section>
      ) : null}

      {(!compact || activeTab === 'plans' || activeTab === 'invoices') ? (
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {!compact || activeTab === 'plans' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Plans</h3>
          {plans.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Plan</th>
                    <th style={tableHeaderCellStyle}>Code</th>
                    <th style={tableHeaderCellStyle}>Price</th>
                    <th style={tableHeaderCellStyle}>Signup Fee</th>
                    <th style={tableHeaderCellStyle}>Users</th>
                    <th style={tableHeaderCellStyle}>Locations</th>
                    <th style={tableHeaderCellStyle}>Cycle</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Features</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td style={tableCellStyle}>{plan.name} {plan.is_custom ? '(Custom)' : ''}</td>
                      <td style={tableCellStyle}>{plan.code}</td>
                      <td style={tableCellStyle}>BDT {Number(plan.price_amount).toLocaleString()}</td>
                      <td style={tableCellStyle}>BDT {Number(plan.signup_fee).toLocaleString()}</td>
                      <td style={tableCellStyle}>{plan.max_users}</td>
                      <td style={tableCellStyle}>{plan.max_locations}</td>
                      <td style={tableCellStyle}>{plan.billing_cycle}</td>
                      <td style={tableCellStyle}>{plan.status}</td>
                      <td style={tableCellStyle}>{Array.isArray(plan.features_json) ? plan.features_json.join(', ') : 'Feature set configured'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No plan definitions are available yet.</div>
          )}
        </article>
        ) : null}

        {!compact || activeTab === 'invoices' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Invoices</h3>
          <div style={{ ...searchRowStyle, marginBottom: 12 }}>
            <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search invoice no or type" />
            <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)} style={fieldStyle}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
            <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Apply</button>
          </div>
          {invoices.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Invoice</th>
                    <th style={tableHeaderCellStyle}>Type</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Total</th>
                    <th style={tableHeaderCellStyle}>Paid</th>
                    <th style={tableHeaderCellStyle}>Due</th>
                    <th style={tableHeaderCellStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td style={tableCellStyle}>{invoice.invoice_no}</td>
                      <td style={tableCellStyle}>{invoice.invoice_type}</td>
                      <td style={tableCellStyle}>{invoice.status}</td>
                      <td style={tableCellStyle}>{invoice.total_amount}</td>
                      <td style={tableCellStyle}>{invoice.paid_amount}</td>
                      <td style={tableCellStyle}>{invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : '—'}</td>
                      <td style={tableCellStyle}>
                        <button onClick={() => void loadInvoice(invoice.id)} style={tableActionButtonStyle}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No invoices are ready for review yet.</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <span style={tokenMutedStyle}>Page {invoicePage} of {totalInvoicePages} · {invoicePagination.total} invoice(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void refresh(Math.max(1, invoicePage - 1))} style={neutralButtonStyle} disabled={loading || invoicePage <= 1}>Previous</button>
              <button onClick={() => void refresh(Math.min(totalInvoicePages, invoicePage + 1))} style={neutralButtonStyle} disabled={loading || invoicePage >= totalInvoicePages}>Next</button>
            </div>
          </div>
        </article>
        ) : null}
      </section>
      ) : null}

      {(!compact || activeTab === 'invoices') ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Invoice Detail</h3>
        {!selectedInvoice ? (
          <p style={tokenMutedStyle}>Select an invoice to review payments or record a new payment.</p>
        ) : (
          <section style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{selectedInvoice.invoice.invoice_no}</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                {selectedInvoice.invoice.status} · Total: {selectedInvoice.invoice.total_amount}
              </div>
              <div style={{ color: 'var(--muted-foreground)' }}>Remaining balance: {remainingAmount}</div>
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
            <button onClick={payInvoice} style={gray800ButtonStyle} disabled={!canPayInvoice}>Record Payment</button>
            {selectedInvoice.payments.length ? (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Method</th>
                      <th style={tableHeaderCellStyle}>Gateway</th>
                      <th style={tableHeaderCellStyle}>Amount</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Reference</th>
                      <th style={tableHeaderCellStyle}>Paid At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td style={tableCellStyle}>{payment.payment_method}</td>
                        <td style={tableCellStyle}>{payment.gateway_provider || '—'}</td>
                        <td style={tableCellStyle}>{payment.amount}</td>
                        <td style={tableCellStyle}>{payment.status}</td>
                        <td style={tableCellStyle}>{payment.reference_no || 'No reference'}</td>
                        <td style={tableCellStyle}>{payment.paid_at ? new Date(payment.paid_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyStateStyle}>No payment records exist for this invoice yet.</div>
            )}
          </section>
        )}
      </article>
      ) : null}

      <p style={tokenMutedStyle}>{message}</p>
    </section>
  );
}
