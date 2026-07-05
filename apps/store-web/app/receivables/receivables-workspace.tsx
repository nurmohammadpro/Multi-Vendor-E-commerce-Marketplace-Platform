'use client';

import { useEffect, useState } from 'react';

import { ListPager, type PaginationState } from '../list-pager';
import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type DueSale = {
  id: string;
  sale_no: string;
  total_amount: string | number;
  payment_status: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_shop_name?: string | null;
  customer_address?: string | null;
  due_date?: string | null;
  created_at: string;
  outstanding_due_amount: string | number;
  aging_days: number;
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
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

export function ReceivablesWorkspace() {
  const compact = useCompactLayout();
  const [activeTab, setActiveTab] = useState<'aging' | 'dues' | 'collect'>('dues');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Receivables workspace is ready.');
  const [query, setQuery] = useState('');
  const [dueSales, setDueSales] = useState<DueSale[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0 });
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');

  const refresh = async (search = query, nextPage = page) => {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(pagination.limit) });
    if (search.trim()) params.set('query', search.trim());
    const [salesPayload, agingPayload] = await Promise.all([
      readJson<{ dueSales: DueSale[]; pagination?: PaginationState }>(`/api/store-ops/due-sales?${params.toString()}`),
      readJson<{ aging: Aging }>('/api/store-ops/due-sales/aging'),
    ]);
    setDueSales(salesPayload.dueSales ?? []);
    setPagination(salesPayload.pagination ?? { page: nextPage, limit: pagination.limit, total: salesPayload.dueSales?.length ?? 0 });
    setPage(salesPayload.pagination?.page ?? nextPage);
    setAging(agingPayload.aging ?? null);
    if (!selectedSaleId && salesPayload.dueSales?.[0]?.id) {
      setSelectedSaleId(salesPayload.dueSales[0].id);
      setAmount(String(salesPayload.dueSales[0].outstanding_due_amount ?? ''));
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const selectedSale = dueSales.find((sale) => sale.id === selectedSaleId) ?? null;

  const collectPayment = async () => {
    if (!selectedSaleId || !amount) {
      setMessage('Choose a due sale and enter a collection amount.');
      return;
    }
    setLoading(true);
    try {
      const payload = await readJson<{ saleNo: string; outstandingAmount: number; paymentStatus: string }>(
        `/api/store-ops/due-sales/${selectedSaleId}/collections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(amount),
            paymentMethod,
            referenceNo: referenceNo || undefined,
            note: note || undefined,
          }),
        },
      );
      await refresh(query, 1);
      setReferenceNo('');
      setNote('');
      setAmount('');
      setMessage(`Collection posted for ${payload.saleNo}. Remaining due ${formatMoney(payload.outstandingAmount)}.`);
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
          onChange={(key) => setActiveTab(key as 'aging' | 'dues' | 'collect')}
          tabs={[
            { key: 'dues', label: 'Due List' },
            { key: 'collect', label: 'Collect' },
            { key: 'aging', label: 'Aging' },
          ]}
        />
      ) : null}

      {(!compact || activeTab === 'aging') ? (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricTile label="Today" amount={aging?.today_amount} count={aging?.today_count} />
          <MetricTile label="1-7 days" amount={aging?.days_7_amount} count={aging?.days_7_count} />
          <MetricTile label="8-30 days" amount={aging?.days_30_amount} count={aging?.days_30_count} />
          <MetricTile label="31-90 days" amount={aging?.days_90_amount} count={aging?.days_90_count} />
          <MetricTile label="90+ days" amount={aging?.days_90_plus_amount} count={aging?.days_90_plus_count} />
        </section>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.25fr) minmax(340px, 0.75fr)', gap: 16 }}>
        {(!compact || activeTab === 'dues') ? (
          <article style={surfaceCardStyle}>
            <div style={{ ...searchRowStyle, marginBottom: 12 }}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search sale no, customer, phone, or shop" />
              <button onClick={() => void refresh(query, 1)} style={searchButtonStyle} disabled={loading}>Search</button>
            </div>
            {dueSales.length ? (
              <>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Sale</th>
                        <th style={tableHeaderCellStyle}>Customer</th>
                        <th style={tableHeaderCellStyle}>Contact</th>
                        <th style={tableHeaderCellStyle}>Outstanding</th>
                        <th style={tableHeaderCellStyle}>Aging</th>
                        <th style={tableHeaderCellStyle}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dueSales.map((sale) => (
                        <tr key={sale.id}>
                          <td style={tableCellStyle}>
                            <div>{sale.sale_no}</div>
                            <div style={tokenMutedStyle}>{sale.due_date || sale.created_at.slice(0, 10)}</div>
                          </td>
                          <td style={tableCellStyle}>{sale.customer_name || sale.customer_shop_name || 'Walk-in due customer'}</td>
                          <td style={tableCellStyle}>{sale.customer_phone || sale.customer_email || '—'}</td>
                          <td style={tableCellStyle}>{formatMoney(sale.outstanding_due_amount)}</td>
                          <td style={tableCellStyle}>{sale.aging_days} day(s)</td>
                          <td style={tableCellStyle}>
                            <button
                              onClick={() => {
                                setSelectedSaleId(sale.id);
                                setAmount(String(sale.outstanding_due_amount ?? ''));
                                if (compact) setActiveTab('collect');
                              }}
                              style={secondaryButtonStyle}
                            >
                              Collect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPager
                  page={page}
                  pagination={pagination}
                  loading={loading}
                  label="due sale(s)"
                  onPrevious={() => void refresh(query, Math.max(1, page - 1))}
                  onNext={() => void refresh(query, page + 1)}
                />
              </>
            ) : (
              <div style={emptyStateStyle}>No due sales matched the current search.</div>
            )}
          </article>
        ) : null}

        {(!compact || activeTab === 'collect') ? (
          <article style={surfaceCardStyle}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Collect due payment</div>
            {selectedSale ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={tokenMutedStyle}>
                  {selectedSale.sale_no} · {selectedSale.customer_name || selectedSale.customer_shop_name || 'Walk-in due customer'}
                </div>
                <div style={stackedFilterGridStyle}>
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.01" style={fieldStyle} placeholder="Collection amount" />
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={fieldStyle}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="mfs">MFS</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </select>
                  <input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} style={fieldStyle} placeholder="Reference no" />
                  <input value={note} onChange={(event) => setNote(event.target.value)} style={fieldStyle} placeholder="Collection note" />
                </div>
                <div style={tokenMutedStyle}>
                  Outstanding due {formatMoney(selectedSale.outstanding_due_amount)} · Status {selectedSale.payment_status}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => void collectPayment()} style={accentButtonStyle} disabled={loading}>Post collection</button>
                </div>
              </div>
            ) : (
              <div style={emptyStateStyle}>Pick a due sale from the list to collect payment.</div>
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

function MetricTile({
  label,
  amount,
  count,
}: {
  label: string;
  amount: string | number | null | undefined;
  count: number | null | undefined;
}) {
  return (
    <article style={surfaceCardStyle}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{formatMoney(amount)}</div>
      <div style={{ color: '#64748b' }}>{count ?? 0} due sale(s)</div>
    </article>
  );
}
