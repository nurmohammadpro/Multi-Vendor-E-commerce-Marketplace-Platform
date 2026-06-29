'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type Customer = {
  id: string;
  full_name?: string | null;
  mobile_no?: string | null;
  email?: string | null;
  shop_name?: string | null;
  address?: string | null;
  outstanding_due_amount?: string | number;
  total_sales_count?: number;
};

type CustomerDetail = {
  customer: Customer;
  dueSales: Array<{
    id: string;
    sale_no: string;
    total_amount: string | number;
    outstanding_due_amount: string | number;
    payment_status: string;
    due_date?: string | null;
    created_at: string;
  }>;
};

type Aging = {
  today_amount: string | number;
  today_count: number;
  days_7_amount: string | number;
  days_7_count: number;
  days_30_amount: string | number;
  days_30_count: number;
  days_90_amount: string | number;
  days_90_count: number;
  days_90_plus_amount: string | number;
  days_90_plus_count: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function CustomersWorkspace() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Customer directory is ready.');
  const [collectionForm, setCollectionForm] = useState({
    saleId: '',
    amount: '',
    paymentMethod: 'cash',
    referenceNo: '',
    note: '',
  });

  const refresh = async (search = query) => {
    const suffix = search.trim() ? `?query=${encodeURIComponent(search.trim())}` : '';
    const [customersPayload, agingPayload] = await Promise.all([
      readJson<{ customers: Customer[] }>(`/api/store-ops/customers${suffix}`),
      readJson<{ aging: Aging }>('/api/store-ops/due-sales/aging'),
    ]);
    setCustomers(customersPayload.customers ?? []);
    setAging(agingPayload.aging ?? null);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const loadCustomer = async (customerId: string) => {
    try {
      const payload = await readJson<CustomerDetail>(`/api/store-ops/customers/${customerId}`);
      setSelectedCustomer(payload);
      setCollectionForm((current) => ({
        ...current,
        saleId: payload.dueSales[0]?.id ?? '',
        amount: payload.dueSales[0]?.outstanding_due_amount ? String(payload.dueSales[0].outstanding_due_amount) : '',
      }));
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const collectPayment = async () => {
    if (!collectionForm.saleId || !collectionForm.amount) {
      setMessage('Select a due sale and enter the collection amount.');
      return;
    }
    setLoading(true);
    try {
      const payload = await readJson<{ saleNo: string; outstandingAmount: number; paymentStatus: string }>(
        `/api/store-ops/due-sales/${collectionForm.saleId}/collections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(collectionForm.amount),
            paymentMethod: collectionForm.paymentMethod,
            referenceNo: collectionForm.referenceNo || undefined,
            note: collectionForm.note || undefined,
          }),
        },
      );
      if (selectedCustomer) {
        await loadCustomer(selectedCustomer.customer.id);
      }
      await refresh();
      setCollectionForm({ saleId: '', amount: '', paymentMethod: 'cash', referenceNo: '', note: '' });
      setMessage(`Collected due for ${payload.saleNo}. Remaining: ${payload.outstandingAmount}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Today</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{aging?.today_amount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{aging?.today_count ?? 0} sale(s)</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>1-7 days</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{aging?.days_7_amount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{aging?.days_7_count ?? 0} sale(s)</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>8-30 days</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{aging?.days_30_amount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{aging?.days_30_count ?? 0} sale(s)</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>31-90 days</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{aging?.days_90_amount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{aging?.days_90_count ?? 0} sale(s)</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>90+ days</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{aging?.days_90_plus_amount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{aging?.days_90_plus_count ?? 0} sale(s)</div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(420px, 1.05fr)', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Customer Directory</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} style={fieldStyle} placeholder="Search name, mobile, email, or shop" />
            <button onClick={() => void refresh()} style={secondaryButtonStyle}>Search</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {customers.length ? (
              customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => void loadCustomer(customer.id)}
                  style={{ ...surfaceCardStyle, padding: 14, textAlign: 'left' }}
                >
                  <div style={{ fontWeight: 600 }}>{customer.full_name || customer.shop_name || customer.mobile_no || 'Unnamed customer'}</div>
                  <div style={{ color: '#475569' }}>
                    {customer.shop_name || 'No shop'} · {customer.mobile_no || 'No mobile'}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    Due: {customer.outstanding_due_amount ?? 0} · Sales: {customer.total_sales_count ?? 0}
                  </div>
                </button>
              ))
            ) : (
              <div style={emptyStateStyle}>No customers matched this search.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Customer Detail & Due Collection</h3>
          {selectedCustomer ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{selectedCustomer.customer.full_name || 'Unnamed customer'}</div>
                <div style={{ color: '#475569' }}>{selectedCustomer.customer.shop_name || 'No shop name'}</div>
                <div style={{ color: '#64748b' }}>
                  {selectedCustomer.customer.mobile_no || 'No mobile'} · {selectedCustomer.customer.email || 'No email'}
                </div>
                <div style={{ color: '#64748b' }}>{selectedCustomer.customer.address || 'No address'}</div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {selectedCustomer.dueSales.length ? selectedCustomer.dueSales.map((sale) => (
                  <label key={sale.id} style={{ ...surfaceCardStyle, padding: 14, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong>{sale.sale_no}</strong>
                      <span style={{ color: '#92400e' }}>{sale.outstanding_due_amount}</span>
                    </div>
                    <div style={{ color: '#475569' }}>
                      Status: {sale.payment_status} · Due date: {sale.due_date || 'Not set'}
                    </div>
                    <div style={{ color: '#64748b' }}>{new Date(sale.created_at).toLocaleString()}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        checked={collectionForm.saleId === sale.id}
                        onChange={() => setCollectionForm((current) => ({
                          ...current,
                          saleId: sale.id,
                          amount: String(sale.outstanding_due_amount),
                        }))}
                      />
                      <span>Select for collection</span>
                    </div>
                  </label>
                )) : <div style={emptyStateStyle}>No due sales remain for this customer.</div>}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <input value={collectionForm.amount} onChange={(event) => setCollectionForm((current) => ({ ...current, amount: event.target.value }))} style={fieldStyle} placeholder="Collection amount" />
                <select value={collectionForm.paymentMethod} onChange={(event) => setCollectionForm((current) => ({ ...current, paymentMethod: event.target.value }))} style={fieldStyle}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mfs">MFS</option>
                  <option value="bank_transfer">Bank</option>
                </select>
                <input value={collectionForm.referenceNo} onChange={(event) => setCollectionForm((current) => ({ ...current, referenceNo: event.target.value }))} style={fieldStyle} placeholder="Reference no (optional)" />
                <textarea value={collectionForm.note} onChange={(event) => setCollectionForm((current) => ({ ...current, note: event.target.value }))} style={{ ...fieldStyle, minHeight: 88 }} placeholder="Collection note (optional)" />
                <button onClick={collectPayment} style={secondaryButtonStyle} disabled={loading}>Collect Due</button>
              </div>
            </div>
          ) : (
            <div style={emptyStateStyle}>Select a customer to inspect due sales and collect payments.</div>
          )}
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
