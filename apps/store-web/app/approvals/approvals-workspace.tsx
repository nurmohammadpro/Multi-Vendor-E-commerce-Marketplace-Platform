'use client';

import { useEffect, useRef, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type StockAdjustmentRequest = {
  id: string;
  location_name: string;
  sku_code: string;
  product_name: string;
  current_qty: string | number;
  requested_qty: string | number;
  qty_delta: string | number;
  reason: string;
  status: string;
  requested_by_name?: string | null;
  created_at: string;
};

type PriceChangeRequest = {
  id: string;
  sku_code: string;
  product_name: string;
  variant_label?: string | null;
  current_sale_price: string | number;
  requested_sale_price: string | number;
  current_cost_price?: string | number | null;
  requested_cost_price?: string | number | null;
  current_compare_at_price?: string | number | null;
  requested_compare_at_price?: string | number | null;
  reason: string;
  status: string;
  requested_by_name?: string | null;
  created_at: string;
};

type OwnerOverview = {
  pendingStockApprovals: number;
  pendingPriceApprovals: number;
  totalPendingApprovals: number;
  todayDueCollectionsAmount: string | number;
  todayDueCollectionsCount: number;
  todayCashSalesAmount: string | number;
  todayCashDueCollectionsAmount: string | number;
  todayCashExpenseAmount: string | number;
  expectedCashAmount: string | number;
  countedCashAmount: string | number | null;
  cashVarianceAmount: string | number;
  cashCountNote?: string | null;
  cashCountUpdatedAt?: string | null;
  recentCashCounts?: Array<{
    countDate: string;
    countedCashAmount: string | number;
    expectedCashAmount: string | number;
    varianceAmount: string | number;
    note?: string | null;
    updatedAt: string;
  }>;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function ApprovalsWorkspace({ canApproveInventory }: { canApproveInventory: boolean }) {
  const [overview, setOverview] = useState<OwnerOverview | null>(null);
  const [stockRequests, setStockRequests] = useState<StockAdjustmentRequest[]>([]);
  const [priceRequests, setPriceRequests] = useState<PriceChangeRequest[]>([]);
  const [decisionNote, setDecisionNote] = useState('');
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [cashCountNote, setCashCountNote] = useState('');
  const [message, setMessage] = useState('Review pending stock and price approvals here.');
  const [loading, setLoading] = useState(false);
  const latestRefreshId = useRef(0);
  const countedCashAmountRef = useRef('');
  const cashCountNoteRef = useRef('');

  const applyOverview = (nextOverview: OwnerOverview | null) => {
    const nextCountedCashAmount =
      nextOverview?.countedCashAmount === null || nextOverview?.countedCashAmount === undefined
        ? ''
        : String(nextOverview.countedCashAmount);
    const nextCashCountNote = nextOverview?.cashCountNote ?? '';

    setOverview(nextOverview);
    countedCashAmountRef.current = nextCountedCashAmount;
    cashCountNoteRef.current = nextCashCountNote;
    setCountedCashAmount(nextCountedCashAmount);
    setCashCountNote(nextCashCountNote);
  };

  const refresh = async () => {
    const refreshId = latestRefreshId.current + 1;
    latestRefreshId.current = refreshId;
    const [overviewPayload, stockPayload, pricePayload] = await Promise.all([
      readJson<{ overview: OwnerOverview }>('/api/store-ops/owner-overview'),
      readJson<{ adjustmentRequests: StockAdjustmentRequest[] }>('/api/inventory/adjustments?status=pending'),
      readJson<{ priceChangeRequests: PriceChangeRequest[] }>('/api/catalog/price-change-requests?status=pending'),
    ]);

    if (refreshId !== latestRefreshId.current) {
      return;
    }

    applyOverview(overviewPayload.overview ?? null);
    setStockRequests(stockPayload.adjustmentRequests ?? []);
    setPriceRequests(pricePayload.priceChangeRequests ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const decideStock = async (requestId: string, decision: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await readJson(`/api/inventory/adjustments/${requestId}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionNote: decisionNote || undefined }),
      });
      await refresh();
      setDecisionNote('');
      setMessage(`Stock request ${decision}d successfully.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const decidePrice = async (requestId: string, decision: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await readJson(`/api/catalog/price-change-requests/${requestId}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionNote: decisionNote || undefined }),
      });
      await refresh();
      setDecisionNote('');
      setMessage(`Price request ${decision}d successfully.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveCashCount = async () => {
    const parsedAmount = Number(countedCashAmountRef.current);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setMessage('Enter a valid counted cash amount.');
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<{ overview: OwnerOverview }>('/api/store-ops/owner-cash-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countedCashAmount: parsedAmount,
          note: cashCountNoteRef.current || undefined,
        }),
      });
      latestRefreshId.current += 1;
      applyOverview(payload.overview ?? null);
      setMessage('Cash count saved successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canApproveInventory) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Approvals access limited</h3>
          <p style={tokenMutedStyle}>Only store owners can approve stock and price changes.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Cash variance</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{overview?.cashVarianceAmount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>
            Expected {overview?.expectedCashAmount ?? 0} · Counted {overview?.countedCashAmount ?? 'Not counted yet'}
          </div>
          <div style={{ color: '#64748b', marginTop: 4 }}>
            Sales {overview?.todayCashSalesAmount ?? 0} + due {overview?.todayCashDueCollectionsAmount ?? 0} - expenses {overview?.todayCashExpenseAmount ?? 0}
          </div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Today&apos;s due collections</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{overview?.todayDueCollectionsAmount ?? '—'}</div>
          <div style={{ color: '#64748b' }}>{overview?.todayDueCollectionsCount ?? 0} collection(s)</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Pending stock approvals</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{overview?.pendingStockApprovals ?? '—'}</div>
          <div style={{ color: '#64748b' }}>Quantity updates waiting on owner action.</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Pending price approvals</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{overview?.pendingPriceApprovals ?? '—'}</div>
          <div style={{ color: '#64748b' }}>Pricing changes waiting on owner action.</div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Owner decision note</h3>
        <textarea
          value={decisionNote}
          onChange={(event) => setDecisionNote(event.target.value)}
          style={{ ...fieldStyle, minHeight: 84 }}
          placeholder="Optional note shared with the manager"
        />
        <p style={{ marginBottom: 0, marginTop: 10, color: '#475569' }}>
          {message} Total pending items: {overview?.totalPendingApprovals ?? 0}.
        </p>
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Cash count</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: '#475569' }}>
            Count today&apos;s drawer cash once the owner finishes counting. The saved value becomes the real counted-vs-expected variance.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Counted cash amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={countedCashAmount}
                onChange={(event) => {
                  countedCashAmountRef.current = event.target.value;
                  setCountedCashAmount(event.target.value);
                }}
                style={fieldStyle}
                placeholder="0.00"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Cash count note</span>
              <input
                value={cashCountNote}
                onChange={(event) => {
                  cashCountNoteRef.current = event.target.value;
                  setCashCountNote(event.target.value);
                }}
                style={fieldStyle}
                placeholder="Optional note about the drawer count"
              />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void saveCashCount()} style={secondaryButtonStyle} disabled={loading}>
              Save cash count
            </button>
            <span style={tokenMutedStyle}>
              Expected: {overview?.expectedCashAmount ?? 0} · Variance: {overview?.cashVarianceAmount ?? 0}
            </span>
            {overview?.cashCountUpdatedAt ? (
              <span style={tokenMutedStyle}>Last saved: {new Date(overview.cashCountUpdatedAt).toLocaleString()}</span>
            ) : null}
          </div>
        </div>
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Recent cash counts</h3>
        {overview?.recentCashCounts?.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Date</th>
                  <th style={tableHeaderCellStyle}>Counted</th>
                  <th style={tableHeaderCellStyle}>Expected</th>
                  <th style={tableHeaderCellStyle}>Variance</th>
                  <th style={tableHeaderCellStyle}>Note</th>
                  <th style={tableHeaderCellStyle}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentCashCounts.map((entry) => (
                  <tr key={`${entry.countDate}-${entry.updatedAt}`}>
                    <td style={tableCellStyle}>{entry.countDate}</td>
                    <td style={tableCellStyle}>{entry.countedCashAmount}</td>
                    <td style={tableCellStyle}>{entry.expectedCashAmount}</td>
                    <td style={tableCellStyle}>{entry.varianceAmount}</td>
                    <td style={tableCellStyle}>{entry.note || '—'}</td>
                    <td style={tableCellStyle}>{new Date(entry.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>No saved cash counts yet.</div>
        )}
      </article>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Pending stock updates</h3>
          {stockRequests.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={tableHeaderCellStyle}>Current</th>
                    <th style={tableHeaderCellStyle}>Requested</th>
                    <th style={tableHeaderCellStyle}>Delta</th>
                    <th style={tableHeaderCellStyle}>Requested By</th>
                    <th style={tableHeaderCellStyle}>Reason</th>
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRequests.map((request) => (
                    <tr key={request.id}>
                      <td style={tableCellStyle}>{request.product_name} · {request.sku_code}</td>
                      <td style={tableCellStyle}>{request.location_name}</td>
                      <td style={tableCellStyle}>{String(request.current_qty)}</td>
                      <td style={tableCellStyle}>{String(request.requested_qty)}</td>
                      <td style={tableCellStyle}>{Number(request.qty_delta) >= 0 ? '+' : ''}{String(request.qty_delta)}</td>
                      <td style={tableCellStyle}>{request.requested_by_name || 'User'}</td>
                      <td style={tableCellStyle}>{request.reason}</td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => void decideStock(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                          <button onClick={() => void decideStock(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No pending stock approvals.</div>
          )}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Pending price updates</h3>
          {priceRequests.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>Sale</th>
                    <th style={tableHeaderCellStyle}>Cost</th>
                    <th style={tableHeaderCellStyle}>Compare</th>
                    <th style={tableHeaderCellStyle}>Requested By</th>
                    <th style={tableHeaderCellStyle}>Reason</th>
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {priceRequests.map((request) => (
                    <tr key={request.id}>
                      <td style={tableCellStyle}>
                        {request.product_name} · {request.sku_code}
                        {request.variant_label ? ` · ${request.variant_label}` : ''}
                      </td>
                      <td style={tableCellStyle}>{String(request.current_sale_price)} → {String(request.requested_sale_price)}</td>
                      <td style={tableCellStyle}>{request.current_cost_price ?? '—'} → {request.requested_cost_price ?? '—'}</td>
                      <td style={tableCellStyle}>{request.current_compare_at_price ?? '—'} → {request.requested_compare_at_price ?? '—'}</td>
                      <td style={tableCellStyle}>{request.requested_by_name || 'User'}</td>
                      <td style={tableCellStyle}>{request.reason}</td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => void decidePrice(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                          <button onClick={() => void decidePrice(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No pending price approvals.</div>
          )}
        </article>
      </section>
    </section>
  );
}
