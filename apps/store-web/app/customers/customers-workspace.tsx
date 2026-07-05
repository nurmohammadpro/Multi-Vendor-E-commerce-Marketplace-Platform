'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  searchButtonStyle,
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

type Pagination = {
  page: number;
  limit: number;
  total: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function CustomersWorkspace() {
  const compact = useCompactLayout();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Customer directory is ready.');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [collectionForm, setCollectionForm] = useState({
    saleId: '',
    amount: '',
    paymentMethod: 'cash',
    referenceNo: '',
    note: '',
  });
  const [activeTab, setActiveTab] = useState<'aging' | 'directory' | 'detail'>('directory');

  const refresh = async (search = query, nextPage = 1) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(pagination.limit),
    });
    if (search.trim()) params.set('query', search.trim());
    const [customersPayload, agingPayload] = await Promise.all([
      readJson<{ customers: Customer[]; pagination?: Pagination }>(`/api/store-ops/customers?${params.toString()}`),
      readJson<{ aging: Aging }>('/api/store-ops/due-sales/aging'),
    ]);
    setCustomers(customersPayload.customers ?? []);
    setPagination(customersPayload.pagination ?? { page: nextPage, limit: pagination.limit, total: customersPayload.customers?.length ?? 0 });
    setPage(customersPayload.pagination?.page ?? nextPage);
    setAging(agingPayload.aging ?? null);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

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
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'aging' | 'directory' | 'detail')}
          tabs={[
            { key: 'directory', label: 'Customers' },
            { key: 'detail', label: 'Due Collection' },
            { key: 'aging', label: 'Aging' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'aging') ? (
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
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(320px, 0.95fr) minmax(420px, 1.05fr)', gap: 16 }}>
        {!compact || activeTab === 'directory' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Customer Directory</h3>
          <div style={{ ...searchRowStyle, marginBottom: 12 }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search name, mobile, email, or shop" />
            <button onClick={() => void refresh(query, 1)} style={searchButtonStyle}>Search</button>
          </div>
          {customers.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Customer</th>
                    <th style={tableHeaderCellStyle}>Shop</th>
                    <th style={tableHeaderCellStyle}>Contact</th>
                    <th style={tableHeaderCellStyle}>Due</th>
                    <th style={tableHeaderCellStyle}>Sales</th>
                    <th style={tableHeaderCellStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td style={tableCellStyle}>{customer.full_name || customer.shop_name || customer.mobile_no || 'Unnamed customer'}</td>
                      <td style={tableCellStyle}>{customer.shop_name || '—'}</td>
                      <td style={tableCellStyle}>{customer.mobile_no || customer.email || '—'}</td>
                      <td style={tableCellStyle}>{customer.outstanding_due_amount ?? 0}</td>
                      <td style={tableCellStyle}>{customer.total_sales_count ?? 0}</td>
                      <td style={tableCellStyle}>
                        <button onClick={() => void loadCustomer(customer.id)} style={tableActionButtonStyle}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No customers matched this search.</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <span style={tokenMutedStyle}>Page {page} of {totalPages} · {pagination.total} customer(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void refresh(query, Math.max(1, page - 1))} style={secondaryButtonStyle} disabled={loading || page <= 1}>Previous</button>
              <button onClick={() => void refresh(query, Math.min(totalPages, page + 1))} style={secondaryButtonStyle} disabled={loading || page >= totalPages}>Next</button>
            </div>
          </div>
        </article>
        ) : null}

        {!compact || activeTab === 'detail' ? (
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

              {selectedCustomer.dueSales.length ? (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Sale</th>
                        <th style={tableHeaderCellStyle}>Outstanding</th>
                        <th style={tableHeaderCellStyle}>Status</th>
                        <th style={tableHeaderCellStyle}>Due Date</th>
                        <th style={tableHeaderCellStyle}>Created</th>
                        <th style={tableHeaderCellStyle}>Select</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCustomer.dueSales.map((sale) => (
                        <tr key={sale.id}>
                          <td style={tableCellStyle}>{sale.sale_no}</td>
                          <td style={{ ...tableCellStyle, color: '#92400e' }}>{sale.outstanding_due_amount}</td>
                          <td style={tableCellStyle}>{sale.payment_status}</td>
                          <td style={tableCellStyle}>{sale.due_date || 'Not set'}</td>
                          <td style={tableCellStyle}>{new Date(sale.created_at).toLocaleString()}</td>
                          <td style={tableCellStyle}>
                            <input
                              type="radio"
                              checked={collectionForm.saleId === sale.id}
                              onChange={() => setCollectionForm((current) => ({
                                ...current,
                                saleId: sale.id,
                                amount: String(sale.outstanding_due_amount),
                              }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={emptyStateStyle}>No due sales remain for this customer.</div>}

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
                <button onClick={collectPayment} style={accentButtonStyle} disabled={loading}>Collect Due</button>
              </div>
            </div>
          ) : (
            <div style={emptyStateStyle}>Select a customer to inspect due sales and collect payments.</div>
          )}
        </article>
        ) : null}
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
