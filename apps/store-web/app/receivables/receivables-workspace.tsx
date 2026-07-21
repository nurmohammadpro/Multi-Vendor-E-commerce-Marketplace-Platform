'use client';

import { useEffect, useState } from 'react';

import { ListPager, type PaginationState } from '../list-pager';
import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
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

type Customer = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  shop_name?: string | null;
};

type CustomerLedgerData = {
  customer: {
    id: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  closingBalance: number;
  transactions: Array<{
    tx_date: string;
    tx_ref: string;
    invoice_no: string | null;
    tx_type: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
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

  // Customer ledger state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerCustomerId, setLedgerCustomerId] = useState('');
  const [ledgerFromDate, setLedgerFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [ledgerToDate, setLedgerToDate] = useState(new Date().toISOString().slice(0, 10));
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState<CustomerLedgerData | null>(null);

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

  // Fetch customers for ledger dropdown
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const payload = await readJson<{ customers: Customer[] }>(
          '/api/store-ops/customers?limit=1000'
        );
        setCustomers(payload.customers ?? []);
      } catch (error) {
        console.error('Failed to fetch customers:', error);
      }
    };
    void fetchCustomers();
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

  const fetchLedger = async () => {
    if (!ledgerCustomerId) {
      setMessage('Please select a customer first.');
      return;
    }
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({
        customerId: ledgerCustomerId,
        fromDate: ledgerFromDate,
        toDate: ledgerToDate,
      });
      const payload = await readJson<CustomerLedgerData>(
        `/api/store-ops/receivables/customer-ledger?${params.toString()}`
      );
      setLedgerData(payload);
      setMessage('Ledger loaded successfully.');
    } catch (error) {
      setMessage((error as Error).message);
      setLedgerData(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const exportLedgerCsv = () => {
    if (!ledgerData) return;
    const customerName = ledgerData.customer.fullName;
    const rows = [
      ['Customer Ledger', customerName],
      ['Period', `${ledgerData.fromDate} to ${ledgerData.toDate}`],
      ['Opening Balance', formatMoney(ledgerData.openingBalance)],
      ['Closing Balance', formatMoney(ledgerData.closingBalance)],
      [],
      ['Date', 'Reference', 'Invoice', 'Type', 'Debit', 'Credit', 'Balance'],
    ];

    ledgerData.transactions.forEach((tx) => {
      rows.push([
        tx.tx_date,
        tx.tx_ref || '',
        tx.invoice_no || '',
        tx.tx_type,
        tx.debit > 0 ? formatMoney(tx.debit) : '—',
        tx.credit > 0 ? formatMoney(tx.credit) : '—',
        formatMoney(tx.runningBalance),
      ]);
    });

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-ledger-${customerName}-${ledgerData.fromDate}-to-${ledgerData.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('CSV export downloaded.');
  };

  const exportLedgerPdf = () => {
    if (!ledgerData) return;
    const customerName = ledgerData.customer.fullName;
    const rows = ledgerData.transactions.map((tx) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${tx.tx_date}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${tx.tx_ref || ''}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${tx.invoice_no || ''}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-transform: capitalize;">${tx.tx_type}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${tx.debit > 0 ? formatMoney(tx.debit) : '—'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${tx.credit > 0 ? formatMoney(tx.credit) : '—'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${formatMoney(tx.runningBalance)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Ledger - ${customerName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .info { font-size: 12px; color: #666; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f5f5f5; padding: 8px; border: 1px solid #ddd; font-weight: 600; text-align: left; }
          td { padding: 8px; border: 1px solid #ddd; }
          .opening { background: #f9f9f9; font-weight: 600; }
          .closing { background: #f9f9f9; font-weight: 700; border-top: 2px solid #333; }
          @media print {
            body { margin: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Customer Ledger</h1>
        <div class="info">
          <strong>Customer:</strong> ${customerName}<br>
          ${ledgerData.customer.phone ? `<strong>Phone:</strong> ${ledgerData.customer.phone}<br>` : ''}
          ${ledgerData.customer.email ? `<strong>Email:</strong> ${ledgerData.customer.email}<br>` : ''}
          ${ledgerData.customer.address ? `<strong>Address:</strong> ${ledgerData.customer.address}<br>` : ''}
          <strong>Period:</strong> ${ledgerData.fromDate} to ${ledgerData.toDate}<br>
          <strong>Opening Balance:</strong> BDT ${formatMoney(ledgerData.openingBalance)}<br>
          <strong>Closing Balance:</strong> BDT ${formatMoney(ledgerData.closingBalance)}
        </div>
        <table>
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #ddd;">Date</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Reference</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Invoice</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Type</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Debit</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Credit</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr class="opening">
              <td colspan="4" style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">Opening Balance</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${formatMoney(ledgerData.openingBalance)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
            </tr>
            ${rows}
            <tr class="closing">
              <td colspan="4" style="padding: 8px; border: 1px solid #ddd; font-weight: 700;">Closing Balance</td>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 700;">${formatMoney(ledgerData.closingBalance)}</td>
            </tr>
          </tbody>
        </table>
        <button onclick="window.print()" style="margin-top: 20px; padding: 8px 16px; background: var(--foreground); color: var(--background); border: 1px solid var(--foreground); cursor: pointer;">Print / Save as PDF</button>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 250);
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '12px' }}>
            <button onClick={() => setLedgerOpen(true)} style={gray800ButtonStyle}>Customer Ledger</button>
          </div>
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

      {/* Customer Ledger Modal */}
      {ledgerOpen ? (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setLedgerOpen(false); setLedgerData(null); }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 900, width: '95%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Customer Ledger</h3>
              <button onClick={() => { setLedgerOpen(false); setLedgerData(null); }} style={{ ...secondaryButtonStyle, minWidth: 40 }}>✕</button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <select value={ledgerCustomerId} onChange={(e) => setLedgerCustomerId(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 180 }}>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name} {c.shop_name ? `(${c.shop_name})` : ''}</option>)}
              </select>
              <input type="date" value={ledgerFromDate} onChange={(e) => setLedgerFromDate(e.target.value)} style={{ ...fieldStyle, width: 150 }} placeholder="From date" />
              <input type="date" value={ledgerToDate} onChange={(e) => setLedgerToDate(e.target.value)} style={{ ...fieldStyle, width: 150 }} placeholder="To date" />
              <button onClick={fetchLedger} style={searchButtonStyle} disabled={ledgerLoading || !ledgerCustomerId}>
                {ledgerLoading ? 'Loading...' : 'Load Ledger'}
              </button>
            </div>

            {/* Export buttons */}
            {ledgerData ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={exportLedgerCsv} style={gray800ButtonStyle}>Export CSV</button>
                  <button onClick={exportLedgerPdf} style={accentButtonStyle}>Export PDF (A4)</button>
                </div>

                {/* Ledger summary */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
                  <span><strong>Opening:</strong> BDT {formatMoney(ledgerData.openingBalance)}</span>
                  <span><strong>Closing:</strong> BDT {formatMoney(ledgerData.closingBalance)}</span>
                  <span><strong>Transactions:</strong> {ledgerData.transactions.length}</span>
                </div>

                {/* Ledger table preview */}
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead><tr>
                      <th style={tableHeaderCellStyle}>Date</th>
                      <th style={tableHeaderCellStyle}>Reference</th>
                      <th style={tableHeaderCellStyle}>Invoice</th>
                      <th style={tableHeaderCellStyle}>Type</th>
                      <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Debit</th>
                      <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Credit</th>
                      <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Balance</th>
                    </tr></thead>
                    <tbody>
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={4} style={{ ...tableCellStyle, fontWeight: 600 }}>Opening Balance</td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatMoney(ledgerData.openingBalance)}</td>
                        <td style={tableCellStyle}></td>
                        <td style={tableCellStyle}></td>
                      </tr>
                      {ledgerData.transactions.map((tx, i) => (
                        <tr key={i}>
                          <td style={tableCellStyle}>{tx.tx_date}</td>
                          <td style={tableCellStyle}>{tx.tx_ref || ''}</td>
                          <td style={tableCellStyle}>{tx.invoice_no || ''}</td>
                          <td style={{ ...tableCellStyle, textTransform: 'capitalize' }}>{tx.tx_type}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{tx.debit > 0 ? formatMoney(tx.debit) : '—'}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{tx.credit > 0 ? formatMoney(tx.credit) : '—'}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatMoney(tx.runningBalance)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f8fafc', borderTop: '2px solid #1e293b' }}>
                        <td colSpan={4} style={{ ...tableCellStyle, fontWeight: 700 }}>Closing Balance</td>
                        <td style={tableCellStyle}></td>
                        <td style={tableCellStyle}></td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatMoney(ledgerData.closingBalance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={emptyStateStyle}>Select a customer and date range, then click Load Ledger.</div>
            )}
          </div>
        </div>
      ) : null}
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
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{formatMoney(amount)}</div>
      <div style={{ color: 'var(--muted-foreground)' }}>{count ?? 0} due sale(s)</div>
    </article>
  );
}
