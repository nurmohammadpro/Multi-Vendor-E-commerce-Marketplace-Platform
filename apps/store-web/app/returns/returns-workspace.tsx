'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle } from '../workspace-responsive';
import { openInvoicePrintWindow } from '../../lib/print-agent';

type Sale = {
  id: string;
  sale_no: string;
  total_amount: number;
  payment_status: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
};

type SaleItem = {
  id: string;
  product_name: string;
  sku_code: string;
  variant_label?: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
};

type SaleDetail = {
  id: string;
  sale_no: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: SaleItem[];
};

type RefundReceipt = {
  type: 'refund';
  returnId: string;
  saleId: string;
  saleNo: string;
  reason: string;
  refundAmount: number;
  processedAt: string;
  processedByName: string;
  store: {
    name?: string | null;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    footer?: string | null;
  };
  customer: {
    name?: string | null;
    phone?: string | null;
    shopName?: string | null;
  };
  originalPayments: Array<{
    paymentMethod: string | null;
    amount: number;
    status: string | null;
  }>;
  returnItems: Array<{
    productName: string;
    skuCode: string | null;
    qty: number;
    restockToInventory: boolean;
    lineRefundAmount: number;
  }>;
  totals: {
    originalTotal: number;
    refundAmount: number;
    paidAmount: number;
  };
  printedAt: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

export function ReturnsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get('saleId');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [saleLoading, setSaleLoading] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, { qty: number; refundAmount: number; restock: boolean }>>({});
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [refundReceipt, setRefundReceipt] = useState<RefundReceipt | null>(null);

  const fetchSales = useCallback(async (search?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('query', search);
      const result = await readJson<{ sales: Sale[]; pagination: { total: number } }>(`/api/pos/sales?${params}`);
      setSales(result.sales ?? []);
      setTotal(result.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Auto-load sale from URL search param (e.g. from Sales History "Return" button)
  useEffect(() => {
    if (initialSaleId && !autoLoaded) {
      setAutoLoaded(true);
      void openSale(initialSaleId).then(() => {
        // Clean the saleId from URL so refreshing doesn't re-open
        router.replace('/returns', { scroll: false });
      });
    }
  }, [initialSaleId, autoLoaded, router]);

  useEffect(() => {
    if (!selectedSale && !autoLoaded) {
      void fetchSales(searchQuery || undefined);
    }
  }, [fetchSales, searchQuery, selectedSale, autoLoaded]);

  const openSale = async (saleId: string) => {
    setSaleLoading(true);
    setError('');
    try {
      const data = await readJson<{ sale: SaleDetail; items: SaleItem[]; payments: Array<{ amount: number; status: string }> }>(`/api/pos/sales/${saleId}`);
      const paidAmount = data.payments?.reduce((sum, p) => sum + (p.status === 'paid' ? Number(p.amount) : 0), 0) ?? 0;
      const sale: SaleDetail = { ...data.sale, items: data.items, paid_amount: paidAmount };
      setSelectedSale(sale);
      const initial: Record<string, { qty: number; refundAmount: number; restock: boolean }> = {};
      for (const item of data.items) {
        initial[item.id] = { qty: 1, refundAmount: Number(item.unit_price), restock: true };
      }
      setReturnItems(initial);
      setReason('');
      setSuccess(false);
      setRefundReceipt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sale details');
    } finally {
      setSaleLoading(false);
    }
  };

  const processReturn = async () => {
    if (!selectedSale) return;
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Please provide a reason (at least 3 characters).');
      return;
    }

    const items = Object.entries(returnItems)
      .filter(([_, v]) => v.qty > 0 && v.refundAmount >= 0)
      .map(([saleItemId, v]) => ({
        saleItemId,
        qty: v.qty,
        restockToInventory: v.restock,
        lineRefundAmount: Number(v.refundAmount),
      }));

    if (items.length === 0) {
      setError('Select at least one item to return.');
      return;
    }

    const totalRefund = items.reduce((sum, i) => sum + i.lineRefundAmount, 0);
    if (totalRefund <= 0) {
      setError('Refund amount must be greater than zero.');
      return;
    }

    setProcessing(true);
    setError('');
    try {
      const response = await readJson<{
        saleReturn: { id: string; refundAmount: number; saleNo: string };
        refundReceipt: RefundReceipt | null;
      }>(`/api/pos/sales/${selectedSale.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          refundAmount: Number(totalRefund),
          items,
        }),
      });
      setRefundReceipt(response.refundReceipt ?? null);
      setSuccess(true);
      setMessage(`Return processed for sale ${selectedSale.sale_no}. Refund: ${totalRefund.toFixed(2)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Return failed');
    } finally {
      setProcessing(false);
    }
  };

  const updateReturnItem = (itemId: string, field: 'qty' | 'refundAmount' | 'restock', value: number | boolean) => {
    setReturnItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  // Sale list view
  if (!selectedSale) {
    return (
      <div style={pageShellStyle}>
        {message && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        )}
        <div style={searchRowStyle}>
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fetchSales(searchQuery || undefined); } }}
            style={{ ...fieldStyle, flex: 1, width: 'auto' }}
            placeholder="Search by sale number or customer"
          />
          <button onClick={() => void fetchSales(searchQuery || undefined)} style={searchButtonStyle} disabled={loading}>
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>

        {sales.length === 0 && !loading ? (
          <div style={emptyStateStyle}>
            {searchQuery ? 'No sales found matching your search.' : 'No completed sales found. Complete a sale in POS first.'}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Invoice</th>
                  <th style={tableHeaderCellStyle}>Customer</th>
                  <th style={tableHeaderCellStyle}>Amount</th>
                  <th style={tableHeaderCellStyle}>Status</th>
                  <th style={tableHeaderCellStyle}>Date</th>
                  <th style={tableHeaderCellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td style={tableCellStyle}>{sale.sale_no}</td>
                    <td style={tableCellStyle}>{sale.customer_name || sale.customer_phone || '—'}</td>
                    <td style={tableCellStyle}>{Number(sale.total_amount).toFixed(2)}</td>
                    <td style={tableCellStyle}>{sale.payment_status}</td>
                    <td style={tableCellStyle}>{new Date(sale.created_at).toLocaleDateString()}</td>
                    <td style={tableCellStyle}>
                      <button onClick={() => void openSale(sale.id)} style={accentButtonStyle}>
                        Return
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > limit && (
            <ListPager
              page={page}
              pagination={{ page, total, limit }}
              label="sales"
              onPrevious={() => setPage(Math.max(1, page - 1))}
              onNext={() => { if (page < totalPagesFor({ page, total, limit })) setPage(page + 1); }}
            />
          )}
      </div>
    );
  }

  // Build a ReceiptPayload from refund data for printing
  const buildRefundReceiptPayload = (rr: RefundReceipt) => ({
    saleId: rr.saleId,
    saleNo: rr.saleNo,
    saleType: 'paid' as const,
    paymentStatus: 'refunded',
    note: `Refund: ${rr.reason}`,
    store: rr.store,
    customer: rr.customer,
    preparedBy: rr.processedByName || undefined,
    amountInWords: null,
    items: rr.returnItems.map((ri) => ({
      name: ri.productName,
      skuCode: ri.skuCode,
      qty: ri.qty,
      unitPrice: Math.round(ri.lineRefundAmount / ri.qty * 100) / 100 || 0,
      discountAmount: 0,
      lineTotal: -ri.lineRefundAmount,
    })),
    totals: {
      subtotal: -rr.refundAmount,
      discount: 0,
      vat: 0,
      tax: 0,
      shipping: 0,
      total: -rr.refundAmount,
      paid: -rr.refundAmount,
      due: 0,
      change: 0,
    },
    payments: rr.originalPayments.map((p) => ({
      paymentMethod: p.paymentMethod,
      amount: p.status === 'paid' ? -p.amount : 0,
      status: p.status === 'paid' ? 'refunded' : p.status,
    })),
    printedAt: rr.printedAt,
  });

  const handlePrintRefundReceipt = () => {
    if (!refundReceipt) return;
    openInvoicePrintWindow(buildRefundReceiptPayload(refundReceipt) as any);
  };

  // Return processing view
  if (success) {
    const rr = refundReceipt;
    const hasPayments = rr && rr.originalPayments && rr.originalPayments.length > 0;
    return (
      <div style={pageShellStyle}>
        {/* Success banner */}
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '16px 20px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          <strong>Return processed successfully.</strong> {message}
        </div>

        {/* Refund receipt card */}
        {rr ? (
          <article style={{ ...surfaceCardStyle, marginBottom: 16 }}>
            {/* Store header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{rr.store?.name || 'Store'}</div>
                {rr.store?.phone && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{rr.store.phone}</div>}
                {rr.store?.address && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{rr.store.address}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 2 }}>Refund Receipt</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{rr.saleNo}</div>
                <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{new Date(rr.processedAt).toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Customer & Reason */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Customer</div>
                <div style={{ fontWeight: 600 }}>{rr.customer?.name || 'Walk-in'}</div>
                {rr.customer?.phone && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{rr.customer.phone}</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Processed By</div>
                <div style={{ fontWeight: 600 }}>{rr.processedByName || '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Reason: <span style={{ fontStyle: 'italic' }}>{rr.reason}</span></div>
              </div>
            </div>

            {/* Returned items table */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6 }}>Returned Items</div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Item</th>
                    <th style={tableHeaderCellStyle}>SKU</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Qty</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Refund Amt</th>
                    <th style={tableHeaderCellStyle}>Restock</th>
                  </tr>
                </thead>
                <tbody>
                  {rr.returnItems.map((ri, idx) => (
                    <tr key={idx}>
                      <td style={tableCellStyle}>{ri.productName}</td>
                      <td style={{ ...tableCellStyle, ...tokenMutedStyle }}>{ri.skuCode || '—'}</td>
                      <td style={{ ...tableCellStyle, textAlign: 'center' }}>{ri.qty}</td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                        -{ri.lineRefundAmount.toFixed(2)}
                      </td>
                      <td style={tableCellStyle}>{ri.restockToInventory ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Original payments */}
            {hasPayments && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6, marginTop: 12 }}>Original Payments</div>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Method</th>
                        <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Amount</th>
                        <th style={tableHeaderCellStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rr.originalPayments.map((p, idx) => (
                        <tr key={idx}>
                          <td style={tableCellStyle}>{p.paymentMethod || '—'}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{p.amount.toFixed(2)}</td>
                          <td style={tableCellStyle}>
                            <span style={{
                              display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                              background: p.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: p.status === 'paid' ? '#16a34a' : '#dc2626',
                            }}>
                              {p.status || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Totals */}
            <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--muted)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Original Total</span>
                <span>{rr.totals.originalTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Amount Paid</span>
                <span>{rr.totals.paidAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                <span style={{ color: '#dc2626' }}>Refund Total</span>
                <span style={{ color: '#dc2626' }}>-{rr.totals.refundAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={handlePrintRefundReceipt} style={accentButtonStyle}>
                Print Refund Receipt
              </button>
              <button onClick={() => { setSelectedSale(null); setPage(1); setRefundReceipt(null); }} style={secondaryButtonStyle}>
                Back to Sales List
              </button>
            </div>
          </article>
        ) : (
          <button onClick={() => { setSelectedSale(null); setPage(1); }} style={secondaryButtonStyle}>
            Back to Sales List
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      <button onClick={() => { setSelectedSale(null); setError(''); }} style={{ ...secondaryButtonStyle, marginBottom: 16 }}>
        &larr; Back to Sales List
      </button>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Sale {selectedSale.sale_no}</h3>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          {selectedSale.customer_name ? `Customer: ${selectedSale.customer_name}` : ''}
          {selectedSale.customer_phone ? ` · ${selectedSale.customer_phone}` : ''}
          {' · '}Amount: {Number(selectedSale.total_amount).toFixed(2)} {' · '}Paid: {Number(selectedSale.paid_amount).toFixed(2)}
        </p>
      </article>

      {saleLoading ? (
        <div style={emptyStateStyle}>Loading sale details...</div>
      ) : (
        <>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>SKU</th>
                  <th style={tableHeaderCellStyle}>Qty to Return</th>
                  <th style={tableHeaderCellStyle}>Refund Amount</th>
                  <th style={tableHeaderCellStyle}>Restock</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.items.map((item) => {
                  const ri = returnItems[item.id];
                  return (
                    <tr key={item.id}>
                      <td style={tableCellStyle}>
                        {item.product_name}
                        {item.variant_label ? <span style={tokenMutedStyle}> {'·'} {item.variant_label}</span> : null}
                      </td>
                      <td style={{ ...tableCellStyle, ...tokenMutedStyle }}>{item.sku_code}</td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={0}
                          max={item.qty}
                          value={ri?.qty ?? 0}
                          onChange={(e) => updateReturnItem(item.id, 'qty', Math.max(0, Math.min(item.qty, parseInt(e.target.value) || 0)))}
                          style={{ ...fieldStyle, width: 72 }}
                        />
                        <span style={{ ...tokenMutedStyle, marginLeft: 4, fontSize: 12 }}>/ {item.qty}</span>
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={ri?.refundAmount ?? 0}
                          onChange={(e) => updateReturnItem(item.id, 'refundAmount', Math.max(0, parseFloat(e.target.value) || 0))}
                          style={{ ...fieldStyle, width: 110 }}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={ri?.restock ?? true}
                            onChange={(e) => updateReturnItem(item.id, 'restock', e.target.checked)}
                          />
                          <span style={{ fontSize: 13 }}>Restock</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ ...fieldStyle, minHeight: 80, width: '100%', boxSizing: 'border-box' }}
              placeholder="Reason for return (required)"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={processReturn} style={{ ...accentButtonStyle, background: '#dc2626', borderColor: '#dc2626', color: '#fff' }} disabled={processing}>
              {processing ? 'Processing...' : 'Process Return & Refund'}
            </button>
            <button onClick={() => { setSelectedSale(null); setError(''); }} style={secondaryButtonStyle}>
              Cancel
            </button>
          </div>

          <p style={{ ...tokenMutedStyle, fontSize: 12, marginTop: 12 }}>
            Returns are final. Items will be restocked to inventory based on your selection above.
          </p>
        </>
      )}
    </div>
  );
}
