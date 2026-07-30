'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  neutralButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { ListPager, type PaginationState } from '../list-pager';
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
  items_purchased?: string | null;
  created_at: string;
};

type SortField = 'sale_no' | 'customer_name' | 'customer_phone' | 'total_amount' | 'payment_status' | 'created_at';

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

export function SalesHistoryWorkspace() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const limit = 15;
  const searchRef = useRef<HTMLInputElement>(null);

  // Sales report export state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const loadSales = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit), sortBy, sortDir });
      const q = searchQuery.trim();
      if (q) params.set('query', q);
      const payload = await readJson<{ sales: Sale[]; pagination?: { total: number } }>(
        `/api/pos/sales?${params.toString()}`,
      );
      setSales(payload.sales ?? []);
      setPage(p);
      setTotal(payload.pagination?.total ?? 0);
      setMessage(
        payload.sales?.length
          ? `Showing ${payload.sales.length} of ${payload.pagination?.total ?? '?'} sale(s).`
          : 'No sales found.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortBy, sortDir]);

  useEffect(() => { void loadSales(1); }, [loadSales]);

  // Set default dates for report (current month)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setReportFromDate(firstDay.toISOString().slice(0, 10));
    setReportToDate(lastDay.toISOString().slice(0, 10));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadSales(1);
  };

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

  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportMonth) {
        params.set('month', reportMonth);
      } else if (reportFromDate && reportToDate) {
        params.set('fromDate', reportFromDate);
        params.set('toDate', reportToDate);
      } else {
        setMessage('Please select a date range or month.');
        setReportLoading(false);
        return;
      }

      const payload = await readJson<any>(
        `/api/pos/sales-report?${params.toString()}`
      );
      setReportData(payload);
      setMessage('Sales report loaded successfully.');
    } catch (error) {
      setMessage((error as Error).message);
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  const exportReportCsv = () => {
    if (!reportData) return;

    const rows = [
      ['Sales Report', `Period: ${reportData.period.fromDate} to ${reportData.period.toDate}`],
      ['Summary Statistics', ''],
      ['Total Sales', formatMoney(reportData.summary.totalSales)],
      ['Total Discounts', formatMoney(reportData.summary.totalDiscounts)],
      ['Total Tax', formatMoney(reportData.summary.totalTax)],
      ['Net Sales', formatMoney(reportData.summary.netSales)],
      ['Total Orders', reportData.summary.totalOrders],
      ['Paid Orders', reportData.summary.paidOrders],
      ['Partial Orders', reportData.summary.partialOrders],
      ['Unpaid Orders', reportData.summary.unpaidOrders],
      [],
      ['Date', 'Sale No', 'Customer', 'Phone', 'Items', 'Total', 'Discount', 'Tax', 'Payment Status', 'Fulfillment Status'],
    ];

    reportData.sales.forEach((sale: any) => {
      rows.push([
        new Date(sale.createdAt).toLocaleDateString(),
        sale.saleNo,
        sale.customerName || 'Walk-in',
        sale.customerPhone || '',
        sale.itemsPurchased || '',
        formatMoney(sale.totalAmount),
        formatMoney(sale.discountAmount),
        formatMoney(sale.taxAmount),
        sale.paymentStatus,
        sale.fulfillmentStatus,
      ]);
    });

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${reportData.period.fromDate}-to-${reportData.period.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('CSV export downloaded.');
  };

  const exportReportPdf = () => {
    if (!reportData) return;

    const salesRows = reportData.sales.map((sale: any) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(sale.createdAt).toLocaleDateString()}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${sale.saleNo}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${sale.customerName || 'Walk-in'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${sale.customerPhone || '—'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 10px;">${sale.itemsPurchased || '—'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${formatMoney(sale.totalAmount)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${formatMoney(sale.discountAmount)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${formatMoney(sale.taxAmount)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${sale.paymentStatus}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${sale.fulfillmentStatus}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .info { font-size: 12px; color: #666; margin-bottom: 15px; }
          .summary { background: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .summary-item { font-size: 12px; }
          .summary-item strong { display: block; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f5f5f5; padding: 8px; border: 1px solid #ddd; font-weight: 600; text-align: left; }
          td { padding: 8px; border: 1px solid #ddd; }
          @media print {
            body { margin: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Sales Report</h1>
        <div class="info">
          <strong>Period:</strong> ${reportData.period.fromDate} to ${reportData.period.toDate}
        </div>

        <div class="summary">
          <div class="summary-grid">
            <div class="summary-item"><strong>Total Sales</strong> BDT ${formatMoney(reportData.summary.totalSales)}</div>
            <div class="summary-item"><strong>Total Discounts</strong> BDT ${formatMoney(reportData.summary.totalDiscounts)}</div>
            <div class="summary-item"><strong>Total Tax</strong> BDT ${formatMoney(reportData.summary.totalTax)}</div>
            <div class="summary-item"><strong>Net Sales</strong> BDT ${formatMoney(reportData.summary.netSales)}</div>
            <div class="summary-item"><strong>Total Orders</strong> ${reportData.summary.totalOrders}</div>
            <div class="summary-item"><strong>Paid Orders</strong> ${reportData.summary.paidOrders}</div>
            <div class="summary-item"><strong>Partial Orders</strong> ${reportData.summary.partialOrders}</div>
            <div class="summary-item"><strong>Unpaid Orders</strong> ${reportData.summary.unpaidOrders}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #ddd;">Date</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Sale No</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Customer</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Phone</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Items</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Total</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Discount</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Tax</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Payment</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Fulfillment</th>
            </tr>
          </thead>
          <tbody>
            ${salesRows}
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

  const pagination: PaginationState = { page, limit, total };
  const currency = (v: number) => v.toFixed(2);
  const formatMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalPage = total > 0 ? Math.ceil(total / limit) : 1;

  return (
    <div style={pageShellStyle}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(24px, 2.2vw, 32px)', lineHeight: 1.1, letterSpacing: '-0.03em', fontWeight: 500 }}>
          Sales History
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          View, search, and reprint past sales.
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search by sale no, customer name, mobile..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
        />
        <button type="submit" style={searchQuery ? searchButtonStyle : secondaryButtonStyle} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        {searchQuery ? (
          <button
            type="button"
            style={neutralButtonStyle}
            onClick={() => {
              setSearchQuery('');
              setPage(1);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => loadSales(1)} style={secondaryButtonStyle} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button onClick={() => setReportOpen(true)} style={gray800ButtonStyle}>Export Report</button>
          </div>
          {sales.length > 0 && total > limit ? (
            <ListPager
              page={pagination.page}
              pagination={pagination}
              label="sales"
              onPrevious={() => { const np = Math.max(1, page - 1); void loadSales(np); }}
              onNext={() => { if (page < totalPage) void loadSales(page + 1); }}
            />
          ) : null}
        </div>

        {sales.length ? (
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCellStyle, width: '11%' }}>
                    <button onClick={() => handleSort('sale_no')} style={sortBtnStyle}>
                      Sale No{sortIndicator('sale_no')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '15%' }}>
                    <button onClick={() => handleSort('customer_name')} style={sortBtnStyle}>
                      Customer{sortIndicator('customer_name')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '13%' }}>
                    <button onClick={() => handleSort('customer_phone')} style={sortBtnStyle}>
                      Mobile{sortIndicator('customer_phone')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '18%' }}>Items</th>
                  <th style={{ ...tableHeaderCellStyle, width: '10%', textAlign: 'right' }}>
                    <button onClick={() => handleSort('total_amount')} style={sortBtnStyle}>
                      Total{sortIndicator('total_amount')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '11%' }}>
                    <button onClick={() => handleSort('payment_status')} style={sortBtnStyle}>
                      Payment{sortIndicator('payment_status')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '12%' }}>
                    <button onClick={() => handleSort('created_at')} style={sortBtnStyle}>
                      Date{sortIndicator('created_at')}
                    </button>
                  </th>
                  <th style={{ ...tableHeaderCellStyle, width: '14%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td style={tableCellStyle}><strong>{sale.sale_no}</strong></td>
                    <td style={tableCellStyle}>{sale.customer_name || '—'}</td>
                    <td style={tableCellStyle}>{sale.customer_phone || '—'}</td>
                    <td style={{ ...tableCellStyle, fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sale.items_purchased || '—'}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      BDT {currency(Number(sale.total_amount))}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background:
                          sale.payment_status === 'paid' ? 'rgba(34,197,94,0.1)' :
                          sale.payment_status === 'refunded' ? 'rgba(107,114,128,0.15)' :
                          sale.status === 'returned_partially' ? 'rgba(234,179,8,0.1)' :
                          sale.payment_status === 'partial' ? 'rgba(234,179,8,0.1)' :
                          'rgba(239,68,68,0.1)',
                        color:
                          sale.payment_status === 'paid' ? '#16a34a' :
                          sale.payment_status === 'refunded' ? '#6b7280' :
                          sale.status === 'returned_partially' ? '#b45309' :
                          sale.payment_status === 'partial' ? '#b45309' : '#dc2626',
                      }}>
                        {sale.payment_status === 'refunded'
                          ? 'Returned'
                          : sale.status === 'returned_partially'
                            ? 'Partially Returned'
                            : sale.payment_status}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      {new Date(sale.created_at).toLocaleDateString('en-BD', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ ...tableCellStyle, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        onClick={async () => {
                          try {
                            const p = await readJson<any>(`/api/pos/sales/${sale.id}/reprint`, { method: 'POST' });
                            if (p.receipt) { openInvoicePrintWindow(p.receipt); setMessage('Receipt opened for printing.'); }
                          } catch (e) { setMessage((e as Error).message); }
                        }}
                        style={secondaryButtonStyle}
                      >
                        Print
                      </button>
                      {sale.payment_status === 'refunded' ? (
                        <span style={{ ...tokenMutedStyle, fontSize: 11 }}>Returned</span>
                      ) : (
                        <Link
                          href={`/returns?saleId=${sale.id}`}
                          style={subtleButtonStyle}
                        >
                          Return
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>{loading ? 'Loading sales...' : 'No sales found.'}</div>
        )}
      </article>

      <p style={{ ...tokenMutedStyle, marginTop: 10 }}>{message}</p>

      {/* Sales Report Export Modal */}
      {reportOpen ? (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setReportOpen(false); setReportData(null); }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 500, width: '95%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Export Sales Report</h3>
              <button onClick={() => { setReportOpen(false); setReportData(null); }} style={{ ...secondaryButtonStyle, minWidth: 40 }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Report Period</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>Month (optional)</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => {
                      setReportMonth(e.target.value);
                      if (e.target.value) {
                        const [year, month] = e.target.value.split('-');
                        const firstDay = `${year}-${month}-01`;
                        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                        const lastDayStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                        setReportFromDate(firstDay);
                        setReportToDate(lastDayStr);
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
                      value={reportFromDate}
                      onChange={(e) => {
                        setReportFromDate(e.target.value);
                        setReportMonth(''); // Clear month when custom date is used
                      }}
                      style={fieldStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>To Date</label>
                    <input
                      type="date"
                      value={reportToDate}
                      onChange={(e) => {
                        setReportToDate(e.target.value);
                        setReportMonth(''); // Clear month when custom date is used
                      }}
                      style={fieldStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={fetchReport} style={searchButtonStyle} disabled={reportLoading}>
                {reportLoading ? 'Loading...' : 'Generate Report'}
              </button>
            </div>

            {reportData ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button onClick={exportReportCsv} style={gray800ButtonStyle}>Export CSV</button>
                  <button onClick={exportReportPdf} style={accentButtonStyle}>Export PDF (A4)</button>
                </div>

                <div style={{ background: 'var(--muted)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Report Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
                    <div>Total Sales: <strong>BDT {formatMoney(reportData.summary.totalSales)}</strong></div>
                    <div>Net Sales: <strong>BDT {formatMoney(reportData.summary.netSales)}</strong></div>
                    <div>Total Orders: <strong>{reportData.summary.totalOrders}</strong></div>
                    <div>Paid Orders: <strong>{reportData.summary.paidOrders}</strong></div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const sortBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 'inherit', color: 'inherit',
  padding: 0, fontFamily: 'inherit',
};
