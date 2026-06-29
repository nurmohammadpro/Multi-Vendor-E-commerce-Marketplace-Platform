'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
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
  cashVarianceAmount: string | number;
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
  const [message, setMessage] = useState('Review pending stock and price approvals here.');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const [overviewPayload, stockPayload, pricePayload] = await Promise.all([
      readJson<{ overview: OwnerOverview }>('/api/store-ops/owner-overview'),
      readJson<{ adjustmentRequests: StockAdjustmentRequest[] }>('/api/inventory/adjustments?status=pending'),
      readJson<{ priceChangeRequests: PriceChangeRequest[] }>('/api/catalog/price-change-requests?status=pending'),
    ]);

    setOverview(overviewPayload.overview ?? null);
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

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Pending stock updates</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stockRequests.length ? stockRequests.map((request) => (
              <article key={request.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{request.product_name} · {request.sku_code}</div>
                <div style={{ color: '#475569' }}>{request.location_name}</div>
                <div style={{ color: '#334155', marginTop: 6 }}>
                  Qty: {String(request.current_qty)} → {String(request.requested_qty)} ({Number(request.qty_delta) >= 0 ? '+' : ''}{String(request.qty_delta)})
                </div>
                <div style={{ color: '#64748b', marginTop: 6 }}>
                  Requested by {request.requested_by_name || 'User'}
                </div>
                <div style={{ marginTop: 8, color: '#334155' }}>{request.reason}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => void decideStock(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                  <button onClick={() => void decideStock(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>Reject</button>
                </div>
              </article>
            )) : (
              <div style={emptyStateStyle}>No pending stock approvals.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Pending price updates</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {priceRequests.length ? priceRequests.map((request) => (
              <article key={request.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>
                  {request.product_name} · {request.sku_code}
                  {request.variant_label ? ` · ${request.variant_label}` : ''}
                </div>
                <div style={{ color: '#334155', marginTop: 6 }}>
                  Sale: {String(request.current_sale_price)} → {String(request.requested_sale_price)}
                </div>
                <div style={{ color: '#475569', marginTop: 4 }}>
                  Cost: {request.current_cost_price ?? '—'} → {request.requested_cost_price ?? '—'} · Compare: {request.current_compare_at_price ?? '—'} → {request.requested_compare_at_price ?? '—'}
                </div>
                <div style={{ color: '#64748b', marginTop: 6 }}>
                  Requested by {request.requested_by_name || 'User'}
                </div>
                <div style={{ marginTop: 8, color: '#334155' }}>{request.reason}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => void decidePrice(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                  <button onClick={() => void decidePrice(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>Reject</button>
                </div>
              </article>
            )) : (
              <div style={emptyStateStyle}>No pending price approvals.</div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
