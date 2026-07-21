'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  searchButtonStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type LedgerRow = {
  id: string;
  location_name: string;
  sku_code: string;
  product_name: string;
  movement_type: string;
  quantity: string | number;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  created_at: string;
  created_by_name: string | null;
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
    throw new Error(
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

function formatQty(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
}

export function StockLedgerWorkspace() {
  const compact = useCompactLayout();
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Stock ledger is ready.');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPagination, setLedgerPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });

  const refreshLedger = async (nextLedgerPage = ledgerPage) => {
    setLoading(true);
    try {
      const ledgerParams = new URLSearchParams({
        page: String(nextLedgerPage),
        limit: String(ledgerPagination.limit),
      });
      const q = ledgerSearch.trim();
      if (q) {
        ledgerParams.set('query', q);
      }
      const ledgerPayload = await readJson<{ ledger: LedgerRow[]; pagination?: PaginationState }>(
        `/api/inventory/ledger?${ledgerParams.toString()}`,
      );
      setLedger(ledgerPayload.ledger ?? []);
      setLedgerPagination(
        ledgerPayload.pagination ?? {
          page: nextLedgerPage,
          limit: ledgerPagination.limit,
          total: ledgerPayload.ledger?.length ?? 0,
        },
      );
      setLedgerPage(ledgerPayload.pagination?.page ?? nextLedgerPage);
      setMessage(
        ledgerPayload.ledger?.length
          ? `Showing ${ledgerPayload.ledger.length} ledger entries.`
          : 'No ledger entries found.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshLedger().catch((error: Error) => setMessage(error.message));
  }, []);

  const handleLedgerSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void refreshLedger(1);
  };

  const totalLedgerPages = totalPagesFor(ledgerPagination);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontSize: 'clamp(24px, 2.2vw, 32px)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            fontWeight: 500,
          }}
        >
          Stock Ledger
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          View complete stock movement history and adjustments.
        </p>
      </div>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: '1fr' }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Stock Movement Ledger</h3>
          <form onSubmit={handleLedgerSearch} style={{ ...searchRowStyle, marginBottom: 12 }}>
            <input
              value={ledgerSearch}
              onChange={(event) => setLedgerSearch(event.target.value)}
              style={{ ...fieldStyle, flex: 1, width: 'auto' }}
              placeholder="Search product, SKU, location, movement"
            />
            <button type="submit" style={searchButtonStyle} disabled={loading}>
              Search
            </button>
          </form>
          {ledger.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Date</th>
                      <th style={tableHeaderCellStyle}>Product</th>
                      <th style={tableHeaderCellStyle}>SKU</th>
                      <th style={tableHeaderCellStyle}>Location</th>
                      <th style={tableHeaderCellStyle}>Movement</th>
                      <th style={tableHeaderCellStyle}>Quantity</th>
                      <th style={tableHeaderCellStyle}>Reference</th>
                      <th style={tableHeaderCellStyle}>Reason</th>
                      <th style={tableHeaderCellStyle}>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((entry) => (
                      <tr key={entry.id}>
                        <td style={tableCellStyle}>{new Date(entry.created_at).toLocaleString()}</td>
                        <td style={tableCellStyle}>{entry.product_name}</td>
                        <td style={tableCellStyle}>{entry.sku_code}</td>
                        <td style={tableCellStyle}>{entry.location_name}</td>
                        <td style={{ ...tableCellStyle, textTransform: 'capitalize' }}>
                          {entry.movement_type}
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'monospace' }}>
                          {formatQty(entry.quantity)}
                        </td>
                        <td style={tableCellStyle}>
                          {entry.reference_type ? `${entry.reference_type} #${entry.reference_id || '—'}` : '—'}
                        </td>
                        <td style={tableCellStyle}>{entry.reason || '—'}</td>
                        <td style={tableCellStyle}>{entry.created_by_name || 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={ledgerPage}
                pagination={ledgerPagination}
                label="ledger entries"
                onPrevious={() => void refreshLedger(Math.max(1, ledgerPage - 1))}
                onNext={() => void refreshLedger(Math.min(totalLedgerPages, ledgerPage + 1))}
              />
            </>
          ) : (
            <div style={emptyStateStyle}>
              {loading ? 'Loading ledger...' : 'No ledger entries yet.'}
            </div>
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