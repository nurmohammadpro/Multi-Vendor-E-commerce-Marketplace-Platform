'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
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
import { openInvoicePrintWindow } from '../../lib/print-agent';

type Sale = {
  id: string;
  sale_no: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
};

type ReprintResp = { receipt?: any };

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
  const [message, setMessage] = useState('Sales history loads automatically.');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const loadSales = async (p = 1) => {
    setLoading(true);
    try {
      const payload = await readJson<{ sales: Sale[] }>(`/api/pos/sales?page=${p}&limit=${limit}`);
      setSales(payload.sales ?? []);
      setPage(p);
      setTotal(payload.sales?.length === limit ? (p * limit) + 1 : p * limit);
      setMessage(payload.sales?.length ? `Showing ${payload.sales.length} sale(s).` : 'No sales found.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reprint = async (saleId: string) => {
    try {
      const payload = await readJson<ReprintResp>(`/api/pos/sales/${saleId}/reprint`, { method: 'POST' });
      if (payload.receipt) {
        openInvoicePrintWindow(payload.receipt);
        setMessage('Receipt opened for printing.');
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => { void loadSales(1); }, []);

  const currency = (v: number) => v.toFixed(2);
  const pagination: PaginationState = { page, limit, total };

  return (
    <div style={pageShellStyle}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(24px, 2.2vw, 32px)', lineHeight: 1.1, letterSpacing: '-0.03em', fontWeight: 500 }}>
          Sales History
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          View recent sales and reprint invoices.
        </p>
      </div>

      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => loadSales(1)} style={searchButtonStyle} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {sales.length > 0 ? (
            <ListPager
              page={pagination.page}
              pagination={pagination}
              label="sales"
              onPrevious={() => { const np = Math.max(1, page - 1); void loadSales(np); }}
              onNext={() => { void loadSales(page + 1); }}
            />
          ) : null}
        </div>

        {sales.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Sale No</th>
                  <th style={tableHeaderCellStyle}>Total</th>
                  <th style={tableHeaderCellStyle}>Payment</th>
                  <th style={tableHeaderCellStyle}>Date</th>
                  <th style={tableHeaderCellStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td style={tableCellStyle}><strong>{sale.sale_no}</strong></td>
                    <td style={tableCellStyle}>BDT {currency(Number(sale.total_amount))}</td>
                    <td style={tableCellStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: sale.payment_status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                        color: sale.payment_status === 'paid' ? '#16a34a' : '#b45309',
                      }}>
                        {sale.payment_status}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      {new Date(sale.created_at).toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={tableCellStyle}>
                      <button onClick={() => reprint(sale.id)} style={secondaryButtonStyle}>Print Invoice</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>{loading ? 'Loading sales...' : 'No sales found yet.'}</div>
        )}
      </article>

      <p style={{ ...tokenMutedStyle, marginTop: 10 }}>{message}</p>
    </div>
  );
}
// reprint invoices from sales history
