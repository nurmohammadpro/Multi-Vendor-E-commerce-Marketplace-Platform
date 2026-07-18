'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  neutralButtonStyle,
  pageShellStyle,
  secondaryButtonStyle,
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

  const pagination: PaginationState = { page, limit, total };
  const currency = (v: number) => v.toFixed(2);
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
        <button type="submit" style={searchQuery ? accentButtonStyle : secondaryButtonStyle} disabled={loading}>
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
          <button onClick={() => loadSales(1)} style={secondaryButtonStyle} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
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
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>
                    <button onClick={() => handleSort('sale_no')} style={sortBtnStyle}>
                      Sale No{sortIndicator('sale_no')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>
                    <button onClick={() => handleSort('customer_name')} style={sortBtnStyle}>
                      Customer{sortIndicator('customer_name')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>
                    <button onClick={() => handleSort('customer_phone')} style={sortBtnStyle}>
                      Mobile{sortIndicator('customer_phone')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>Items</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>
                    <button onClick={() => handleSort('total_amount')} style={sortBtnStyle}>
                      Total{sortIndicator('total_amount')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>
                    <button onClick={() => handleSort('payment_status')} style={sortBtnStyle}>
                      Payment{sortIndicator('payment_status')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>
                    <button onClick={() => handleSort('created_at')} style={sortBtnStyle}>
                      Date{sortIndicator('created_at')}
                    </button>
                  </th>
                  <th style={tableHeaderCellStyle}>Action</th>
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
                        background: sale.payment_status === 'paid' ? 'rgba(34,197,94,0.1)' : sale.payment_status === 'partial' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                        color: sale.payment_status === 'paid' ? '#16a34a' : sale.payment_status === 'partial' ? '#b45309' : '#dc2626',
                      }}>
                        {sale.payment_status}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      {new Date(sale.created_at).toLocaleDateString('en-BD', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={tableCellStyle}>
                      <button
                        onClick={async () => {
                          try {
                            const p = await readJson<any>(`/api/pos/sales/${sale.id}/reprint`, { method: 'POST' });
                            if (p.receipt) { openInvoicePrintWindow(p.receipt); setMessage('Receipt opened for printing.'); }
                          } catch (e) { setMessage((e as Error).message); }
                        }}
                        style={secondaryButtonStyle}
                      >
                        Print Invoice
                      </button>
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
    </div>
  );
}

const sortBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 'inherit', color: 'inherit',
  padding: 0, fontFamily: 'inherit',
};
