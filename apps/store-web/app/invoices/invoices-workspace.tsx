'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  gray800ButtonStyle,
  neutralButtonStyle,
  pageShellStyle,
  pageTitleStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
} from '../merchflow-theme';
import { ListPager } from '../list-pager';
import { openInvoicePrintWindow, type ReceiptPayload } from '../../lib/print-agent';
import { renderInvoice } from '../../lib/invoice-template';

type InvoiceSale = {
  id: string;
  sale_no: string;
  invoice_no?: string | null;
  sale_date?: string | null;
  total_amount: number;
  paid_amount?: number | string;
  payment_status: string;
  status: string;
  cod_count?: number;
  due_date?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_shop_name?: string | null;
  items_purchased?: string | null;
  created_at: string;
};

type Terms = 'paid' | 'due' | 'cod';

const TERMS_LABEL: Record<Terms, string> = { paid: 'Paid', due: 'Due', cod: 'Cash on Delivery' };

function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error(
        payload && typeof payload === 'object' && 'error' in payload && payload.error
          ? payload.error
          : `Request failed with ${response.status}`,
      );
    }
    return payload as T;
  });
}

function formatMoney(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function termsFor(sale: InvoiceSale): Terms {
  if ((sale.cod_count ?? 0) > 0) return 'cod';
  if (sale.payment_status === 'paid') return 'paid';
  return 'due';
}

function termsBadgeStyle(terms: Terms) {
  if (terms === 'paid') return { background: 'rgba(22,163,74,0.12)', color: '#166534' };
  if (terms === 'cod') return { background: 'rgba(37,99,235,0.12)', color: '#1e40af' };
  return { background: 'rgba(217,119,6,0.14)', color: '#92400e' };
}

export function InvoicesWorkspace() {
  const [invoices, setInvoices] = useState<InvoiceSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;
  const searchRef = useRef<HTMLInputElement>(null);

  const [printingId, setPrintingId] = useState('');
  const [viewPayload, setViewPayload] = useState<ReceiptPayload | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState('');

  const [collectSale, setCollectSale] = useState<InvoiceSale | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState('cash');
  const [collectReference, setCollectReference] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectLoading, setCollectLoading] = useState(false);

  const loadInvoices = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit), sortBy: 'created_at', sortDir: 'desc' });
      const q = searchQuery.trim();
      if (q) params.set('query', q);
      const payload = await readJson<{ sales: InvoiceSale[]; pagination?: { total: number } }>(
        `/api/pos/sales?${params.toString()}`,
      );
      setInvoices(payload.sales ?? []);
      setPage(p);
      setTotal(payload.pagination?.total ?? 0);
      setMessage(
        payload.sales?.length
          ? `Showing ${payload.sales.length} of ${payload.pagination?.total ?? '?'} invoice(s).`
          : 'No invoices found.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { void loadInvoices(1); }, [loadInvoices]);

  const outstandingFor = (sale: InvoiceSale) =>
    Math.max(Number(sale.total_amount ?? 0) - Number(sale.paid_amount ?? 0), 0);

  const fetchInvoicePayload = async (sale: InvoiceSale) => {
    const payload = await readJson<{ receipt: ReceiptPayload }>(`/api/pos/sales/${sale.id}/invoice`, {
      method: 'POST',
    });
    return payload.receipt;
  };

  const handlePrint = async (sale: InvoiceSale) => {
    setPrintingId(sale.id);
    try {
      const receipt = await fetchInvoicePayload(sale);
      openInvoicePrintWindow(receipt, 'a4');
      setMessage(`Invoice ${receipt.invoiceNo ?? sale.sale_no} sent to the browser print dialog.`);
      void loadInvoices(page);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPrintingId('');
    }
  };

  const handleView = async (sale: InvoiceSale) => {
    setViewLoadingId(sale.id);
    try {
      const receipt = await fetchInvoicePayload(sale);
      setViewPayload(receipt);
      void loadInvoices(page);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setViewLoadingId('');
    }
  };

  const openCollect = (sale: InvoiceSale) => {
    setCollectSale(sale);
    setCollectAmount(String(outstandingFor(sale)));
    setCollectMethod('cash');
    setCollectReference('');
    setCollectNote('');
  };

  const submitCollect = async () => {
    if (!collectSale || !Number(collectAmount)) {
      setMessage('Enter a collection amount.');
      return;
    }
    setCollectLoading(true);
    try {
      const payload = await readJson<{ saleNo: string; outstandingAmount: number }>(
        `/api/store-ops/due-sales/${collectSale.id}/collections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(collectAmount),
            paymentMethod: collectMethod,
            referenceNo: collectReference || undefined,
            note: collectNote || undefined,
          }),
        },
      );
      setCollectSale(null);
      setMessage(`Collection posted for ${payload.saleNo}. Remaining due ${formatMoney(payload.outstandingAmount)}.`);
      void loadInvoices(page);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCollectLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    background: 'var(--background)',
    color: 'var(--foreground)',
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={pageTitleStyle}>Invoices</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--muted-foreground)' }}>
          White-label A4 invoices for wholesale and retail customers. Printing an invoice assigns its
          sequential invoice number; collect due payments right from this list.
        </p>
      </div>

      <div style={{ ...surfaceCardStyle, padding: 14 }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadInvoices(1);
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            placeholder="Search by invoice no, sale no, customer, phone or shop name"
          />
          <button type="submit" style={searchButtonStyle} disabled={loading}>Search</button>
          <button
            type="button"
            style={neutralButtonStyle}
            onClick={() => {
              setSearchQuery('');
              void loadInvoices(1);
            }}
          >
            Reset
          </button>
        </form>
        {message ? <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{message}</p> : null}
      </div>

      <div style={surfaceCardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCellStyle, width: '13%' }}>Invoice No</th>
                <th style={{ ...tableHeaderCellStyle, width: '11%' }}>Date</th>
                <th style={{ ...tableHeaderCellStyle, width: '20%' }}>Customer</th>
                <th style={{ ...tableHeaderCellStyle, width: '22%' }}>Items</th>
                <th style={{ ...tableHeaderCellStyle, width: '11%', textAlign: 'right' }}>Total</th>
                <th style={{ ...tableHeaderCellStyle, width: '11%', textAlign: 'right' }}>Paid</th>
                <th style={{ ...tableHeaderCellStyle, width: '10%', textAlign: 'right' }}>Due</th>
                <th style={{ ...tableHeaderCellStyle, width: '12%' }}>Terms</th>
                <th style={{ ...tableHeaderCellStyle, width: '14%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={tableCellStyle} colSpan={9}>Loading invoices…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td style={tableCellStyle} colSpan={9}>No invoices found. Create one from the Point of Sale.</td></tr>
              ) : invoices.map((sale) => {
                const terms = termsFor(sale);
                const outstanding = outstandingFor(sale);
                return (
                  <tr key={sale.id}>
                    <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                      {sale.invoice_no || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{sale.sale_no}</div>
                    </td>
                    <td style={tableCellStyle}>
                      {new Date(sale.sale_date || sale.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td style={tableCellStyle}>
                      {sale.customer_name || 'Walk-in'}
                      {sale.customer_shop_name ? <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{sale.customer_shop_name}</div> : null}
                    </td>
                    <td style={{ ...tableCellStyle, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {(sale.items_purchased || '').slice(0, 60)}{(sale.items_purchased || '').length > 60 ? '…' : ''}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(sale.total_amount)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(sale.paid_amount)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', color: outstanding > 0 ? '#b45309' : undefined }}>
                      {formatMoney(outstanding)}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{ ...termsBadgeStyle(terms), display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                        {TERMS_LABEL[terms]}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => void handleView(sale)} style={{ ...subtleButtonStyle, fontSize: 11 }} disabled={viewLoadingId === sale.id}>
                          {viewLoadingId === sale.id ? '…' : 'View'}
                        </button>
                        <button onClick={() => void handlePrint(sale)} style={{ ...subtleButtonStyle, fontSize: 11 }} disabled={printingId === sale.id}>
                          {printingId === sale.id ? '…' : 'Print A4'}
                        </button>
                        {outstanding > 0 && sale.status !== 'refunded' ? (
                          <button onClick={() => openCollect(sale)} style={{ ...subtleButtonStyle, fontSize: 11, color: '#16a34a' }}>
                            Collect
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListPager
          loading={loading}
          page={page}
          pagination={{ page, limit, total }}
          label="invoices"
          onPrevious={() => { const np = Math.max(1, page - 1); void loadInvoices(np); }}
          onNext={() => { if (page < Math.max(1, Math.ceil(total / limit))) void loadInvoices(page + 1); }}
        />
      </div>

      {viewPayload ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}
          onClick={() => setViewPayload(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ background: 'var(--background)', borderRadius: 12, maxWidth: 860, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 16 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Invoice {viewPayload.invoiceNo || viewPayload.saleNo || ''}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => openInvoicePrintWindow(viewPayload, 'a4')} style={gray800ButtonStyle}>Print</button>
                <button onClick={() => setViewPayload(null)} style={secondaryButtonStyle}>Close</button>
              </div>
            </div>
            <div dangerouslySetInnerHTML={{ __html: renderInvoice(viewPayload, 'a4') }} />
          </div>
        </div>
      ) : null}

      {collectSale ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}
          onClick={() => setCollectSale(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ background: 'var(--background)', borderRadius: 12, maxWidth: 420, width: '100%', padding: 20, display: 'grid', gap: 10 }}
          >
            <strong style={{ fontSize: 15 }}>Collect payment — {collectSale.invoice_no || collectSale.sale_no}</strong>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              Outstanding due: <strong style={{ color: '#b45309' }}>{formatMoney(outstandingFor(collectSale))}</strong>
            </div>
            <input type="number" min="0" step="0.01" value={collectAmount} onChange={(event) => setCollectAmount(event.target.value)} style={inputStyle} placeholder="Amount" aria-label="Collection amount" />
            <select value={collectMethod} onChange={(event) => setCollectMethod(event.target.value)} style={inputStyle} aria-label="Payment method">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mfs">MFS</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
            <input value={collectReference} onChange={(event) => setCollectReference(event.target.value)} style={inputStyle} placeholder="Reference no / transaction id (optional)" />
            <input value={collectNote} onChange={(event) => setCollectNote(event.target.value)} style={inputStyle} placeholder="Note (optional)" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCollectSale(null)} style={neutralButtonStyle}>Cancel</button>
              <button onClick={() => void submitCollect()} style={gray800ButtonStyle} disabled={collectLoading}>
                {collectLoading ? 'Posting…' : 'Post Collection'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
