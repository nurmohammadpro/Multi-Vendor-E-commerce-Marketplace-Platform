'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
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
} from '../marketone-theme';
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

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

type Pagination = {
  page: number;
  limit: number;
  total: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && (payload as any).error ? (payload as any).error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function BillingWorkspace({ canManageBilling }: { canManageBilling: boolean }) {
  const compact = useCompactLayout();
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
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'invoices'>('overview');

  const remainingAmount = selectedInvoice
    ? Math.max(0, Number(selectedInvoice.invoice.total_amount) - Number(selectedInvoice.invoice.paid_amount))
    : 0;
  const canUpdateSubscription = Boolean(plans.length && !loading && changeForm.planCode);
  const canPayInvoice = Boolean(selectedInvoice && paymentForm.amount && !loading);

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(invoicePagination.limit),
    });
    if (invoiceSearch.trim()) params.set('search', invoiceSearch.trim());
    if (invoiceStatus) params.set('status', invoiceStatus);
    const [planPayload, subscriptionPayload, invoicePayload] = await Promise.all([
      readJson<{ plans: Plan[] }>('/api/billing/plans'),
      readJson<{ subscription: Subscription }>('/api/billing/subscription'),
      readJson<{ invoices: Invoice[]; pagination?: Pagination }>(`/api/billing/invoices?${params.toString()}`),
    ]);
    setPlans(planPayload.plans ?? []);
    setSubscription(subscriptionPayload.subscription ?? null);
    setInvoices(invoicePayload.invoices ?? []);
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
                {subscription.status} · {subscription.price_amount} / {subscription.billing_cycle}
              </div>
              <div style={{ color: '#64748b' }}>
                Renewal: {subscription.renewal_at ? new Date(subscription.renewal_at).toLocaleString() : '—'}
              </div>
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
          <button onClick={changeSubscription} style={accentButtonStyle} disabled={!canUpdateSubscription}>
            Update Subscription
          </button>
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
                    <th style={tableHeaderCellStyle}>Cycle</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Features</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td style={tableCellStyle}>{plan.name}</td>
                      <td style={tableCellStyle}>{plan.code}</td>
                      <td style={tableCellStyle}>{plan.price_amount}</td>
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
            <button onClick={payInvoice} style={accentButtonStyle} disabled={!canPayInvoice}>Record Payment</button>
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

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
