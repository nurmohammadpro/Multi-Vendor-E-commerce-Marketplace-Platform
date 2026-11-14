'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  dangerButtonStyle,
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
} from '../merchflow-theme';
import { ListPager } from '../list-pager';
import { searchRowStyle } from '../workspace-responsive';
import { openInvoicePrintWindow } from '../../lib/print-agent';

type Sale = {
  id: string;
  sale_no: string;
  total_amount: number;
  payment_status: string;
  status: string;
  returned_amount?: number;
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
  refundMethod?: string | null;
  refundReference?: string | null;
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
  const [refundMethod, setRefundMethod] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [refundReceipt, setRefundReceipt] = useState<RefundReceipt | null>(null);

  // Returns export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [exportMonth, setExportMonth] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportData, setExportData] = useState<any>(null);

  // Sorting state
  type SortField = 'sale_no' | 'customer_name' | 'total_amount' | 'payment_status' | 'created_at';
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadSales = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit), sortBy, sortDir });
      const q = searchQuery.trim();
      if (q) params.set('query', q);
      const result = await readJson<{ sales: Sale[]; pagination: { total: number } }>(`/api/pos/sales?${params}`);
      setSales(result.sales ?? []);
      setPage(p);
      setTotal(result.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortBy, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // Set default export dates (current month)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setExportFromDate(firstDay.toISOString().slice(0, 10));
    setExportToDate(lastDay.toISOString().slice(0, 10));
  }, []);

  const fetchReturnsReport = async () => {
    setExportLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (exportMonth) {
        params.set('month', exportMonth);
      } else if (exportFromDate && exportToDate) {
        params.set('fromDate', exportFromDate);
        params.set('toDate', exportToDate);
      } else {
        setError('Please select a date range or month.');
        setExportLoading(false);
        return;
      }
      const data = await readJson<any>(`/api/pos/returns-report?${params.toString()}`);
      setExportData(data);
      setMessage(`Returns report loaded: ${data.summary?.totalReturns ?? 0} returns, total BDT ${data.summary?.totalRefunds ?? 0}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load returns report');
    } finally {
      setExportLoading(false);
    }
  };

  const exportReturnsCsv = () => {
    if (!exportData) return;
    const rows: string[][] = [
      ['Returns Report', `Period: ${exportData.period.fromDate} to ${exportData.period.toDate}`],
      ['Summary', ''],
      ['Total Returns', String(exportData.summary.totalReturns)],
      ['Total Refunds', formatMoney(exportData.summary.totalRefunds)],
      [],
      ['Date', 'Sale No', 'Customer', 'Phone', 'Reason', 'Refund Amount', 'Processed By', 'Status'],
    ];
    exportData.returns.forEach((r: any) => {
      rows.push([
        new Date(r.returnDate).toLocaleDateString(),
        r.saleNo,
        r.customerName || 'Walk-in',
        r.customerPhone || '',
        r.reason,
        formatMoney(r.refundAmount),
        r.processedByName || '—',
        r.returnStatus,
      ]);
    });
    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `returns-report-${exportData.period.fromDate}-to-${exportData.period.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('CSV export downloaded.');
  };

  const formatMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paymentBadgeStyle = (status: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: status === 'paid' ? 'rgba(34,197,94,0.1)' :
      status === 'partial' || status === 'returned_partially' ? 'rgba(234,179,8,0.1)' :
      status === 'refunded' ? 'rgba(107,114,128,0.15)' : 'rgba(239,68,68,0.1)',
    color: status === 'paid' ? '#16a34a' :
      status === 'partial' || status === 'returned_partially' ? '#b45309' :
      status === 'refunded' ? '#6b7280' : '#dc2626',
  });

  const displayStatus = (status: string, paymentStatus: string): string => {
    if (paymentStatus === 'refunded') return 'Returned';
    if (status === 'returned_partially') return 'Partially Returned';
    return paymentStatus;
  };

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
      void loadSales(1);
    }
  }, [loadSales, selectedSale, autoLoaded]);

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
      setRefundMethod('');
      setRefundReference('');
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
          refundMethod: refundMethod || undefined,
          refundReference: refundReference.trim() || undefined,
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

  // Returns Export Modal (renders as overlay before sale list check)
  if (exportOpen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} onClick={() => { setExportOpen(false); setExportData(null); }}>
        <div style={{
          background: '#fff', borderRadius: 6, padding: 10, maxWidth: 500, width: '95%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Export Returns Report</h3>
            <button onClick={() => { setExportOpen(false); setExportData(null); }} style={{ ...secondaryButtonStyle, minWidth: 40 }}>✕</button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Report Period</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>Month (optional)</label>
                <input
                  type="month"
                  value={exportMonth}
                  onChange={(e) => {
                    setExportMonth(e.target.value);
                    if (e.target.value) {
                      const [year, month] = e.target.value.split('-');
                      const firstDay = `${year}-${month}-01`;
                      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                      const lastDayStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                      setExportFromDate(firstDay);
                      setExportToDate(lastDayStr);
                    }
                  }}
                  style={fieldStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>From Date</label>
                  <input
                    type="date"
                    value={exportFromDate}
                    onChange={(e) => { setExportFromDate(e.target.value); setExportMonth(''); }}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>To Date</label>
                  <input
                    type="date"
                    value={exportToDate}
                    onChange={(e) => { setExportToDate(e.target.value); setExportMonth(''); }}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={fetchReturnsReport} style={searchButtonStyle} disabled={exportLoading}>
              {exportLoading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>

          {exportData ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={exportReturnsCsv} style={gray800ButtonStyle}>Export CSV</button>
              </div>
              <div style={{ background: 'var(--muted)', padding: 10, borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Report Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
                  <div>Total Returns: <strong>{exportData.summary.totalReturns}</strong></div>
                  <div>Total Refunds: <strong>BDT {formatMoney(exportData.summary.totalRefunds)}</strong></div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // Sale list view
  if (!selectedSale) {
    return (
      <div style={pageShellStyle}>
        {message && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        )}
        <div style={{ ...searchRowStyle, marginBottom: 10 }}>
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void loadSales(1); } }}
            style={{ ...fieldStyle, flex: 1, width: 'auto' }}
            placeholder="Search by sale number or customer"
          />
          <button onClick={() => void loadSales(1)} style={searchButtonStyle} disabled={loading}>
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>

        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => void loadSales(1)} style={secondaryButtonStyle} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button onClick={() => setExportOpen(true)} style={gray800ButtonStyle}>Export Returns Report</button>
          </div>

          {sales.length === 0 && !loading ? (
            <div style={emptyStateStyle}>
              {searchQuery ? 'No sales found matching your search.' : 'No completed sales found. Complete a sale in POS first.'}
            </div>
          ) : (
            <div style={tableWrapStyle}>
              <table style={{ ...tableStyle, tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCellStyle, width: '15%' }}>
                      <button onClick={() => handleSort('sale_no')} style={sortBtnStyle}>
                        Invoice{sortIndicator('sale_no')}
                      </button>
                    </th>
                    <th style={{ ...tableHeaderCellStyle, width: '20%' }}>
                      <button onClick={() => handleSort('customer_name')} style={sortBtnStyle}>
                        Customer{sortIndicator('customer_name')}
                      </button>
                    </th>
                    <th style={{ ...tableHeaderCellStyle, width: '12%', textAlign: 'right' }}>
                      <button onClick={() => handleSort('total_amount')} style={sortBtnStyle}>
                        Amount{sortIndicator('total_amount')}
                      </button>
                    </th>
                    <th style={{ ...tableHeaderCellStyle, width: '16%' }}>
                      <button onClick={() => handleSort('payment_status')} style={sortBtnStyle}>
                        Status{sortIndicator('payment_status')}
                      </button>
                    </th>
                    <th style={{ ...tableHeaderCellStyle, width: '17%' }}>
                      <button onClick={() => handleSort('created_at')} style={sortBtnStyle}>
                        Date{sortIndicator('created_at')}
                      </button>
                    </th>
                    <th style={{ ...tableHeaderCellStyle, width: '20%' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const isRefunded = sale.payment_status === 'refunded';
                    return (
                      <tr key={sale.id}>
                        <td style={tableCellStyle}><strong>{sale.sale_no}</strong></td>
                        <td style={tableCellStyle}>{sale.customer_name || sale.customer_phone || '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          BDT {Number(sale.total_amount).toFixed(2)}
                        </td>
                        <td style={tableCellStyle}>
                          <span style={paymentBadgeStyle(
                            isRefunded ? 'refunded' :
                            sale.status === 'returned_partially' ? 'returned_partially' :
                            sale.payment_status
                          )}>
                            {displayStatus(sale.status, sale.payment_status)}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          {new Date(sale.created_at).toLocaleDateString('en-BD', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </td>
                        <td style={tableCellStyle}>
                          {isRefunded ? (
                            <span style={{ ...tokenMutedStyle, fontSize: 11 }}>Fully Returned</span>
                          ) : (
                            <button onClick={() => void openSale(sale.id)} style={gray800ButtonStyle}>
                              Return
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > limit && (
            <div style={{ marginTop: 12 }}>
              <ListPager
                page={page}
                pagination={{ page, total, limit }}
                label="sales"
                onPrevious={() => { const np = Math.max(1, page - 1); void loadSales(np); }}
                onNext={() => { if (page < Math.ceil(total / limit)) void loadSales(page + 1); }}
              />
            </div>
          )}
        </article>
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
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '16px 20px', borderRadius: 6, marginBottom: 10, fontSize: 14 }}>
          <strong>Return processed successfully.</strong> {message}
        </div>

        {/* Refund receipt card */}
        {rr ? (
          <article style={{ ...surfaceCardStyle, marginBottom: 10 }}>
            {/* Store header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Customer</div>
                <div style={{ fontWeight: 600 }}>{rr.customer?.name || 'Walk-in'}</div>
                {rr.customer?.phone && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{rr.customer.phone}</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Processed By</div>
                <div style={{ fontWeight: 600 }}>{rr.processedByName || '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Reason: <span style={{ fontStyle: 'italic' }}>{rr.reason}</span></div>
                {rr.refundMethod && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    Refund via {rr.refundMethod}{rr.refundReference ? ` · Ref: ${rr.refundReference}` : ''}
                  </div>
                )}
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
            <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--muted)', borderRadius: 6 }}>
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={handlePrintRefundReceipt} style={gray800ButtonStyle}>
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
      
      <button onClick={() => { setSelectedSale(null); setError(''); }} style={{ ...secondaryButtonStyle, marginBottom: 10 }}>
        &larr; Back to Sales List
      </button>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
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

          <div style={{ marginTop: 10 }}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ ...fieldStyle, minHeight: 80, width: '100%', boxSizing: 'border-box' }}
              placeholder="Reason for return (required)"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>Refund Method</label>
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={{ ...fieldStyle, width: 180 }}>
                <option value="">Select method</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mfs">Mobile Banking</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>Reference</label>
              <input
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                placeholder="Txn / cheque no. (optional)"
                style={{ ...fieldStyle, width: 200 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={processReturn} style={dangerButtonStyle} disabled={processing}>
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

const sortBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 'inherit', color: 'inherit',
  padding: 0, fontFamily: 'inherit',
};