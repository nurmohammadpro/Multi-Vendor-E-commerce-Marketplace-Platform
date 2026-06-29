'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type Location = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  status: string;
};

type Balance = {
  location_id: string;
  location_name: string;
  sku_id: string;
  sku_code: string;
  product_name: string;
  on_hand_qty: string | number;
  available_qty: string | number;
  reserved_qty: string | number;
  updated_at: string;
};

type AdjustmentRequest = {
  id: string;
  location_id: string;
  location_name: string;
  sku_id: string;
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

type LedgerRow = {
  id: string;
  sku_id: string;
  sku_code: string;
  product_name: string;
  location_name: string;
  movement_type: string;
  qty_delta: string | number;
  note?: string | null;
  actor_name?: string | null;
  created_at: string;
};

type SkuResult = {
  id: string;
  sku_code: string;
  product_name: string;
  variant_label?: string | null;
  sale_price?: string | number | null;
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

export function InventoryWorkspace({
  canViewInventory,
  canAdjustInventory,
  canDirectAdjustInventory,
  canRequestAdjustInventory,
  canApproveInventory,
}: {
  canViewInventory: boolean;
  canAdjustInventory: boolean;
  canDirectAdjustInventory: boolean;
  canRequestAdjustInventory: boolean;
  canApproveInventory: boolean;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRequest[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<SkuResult[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [message, setMessage] = useState('Inventory live workspace is ready.');
  const [loading, setLoading] = useState(false);

  const selectedSku = useMemo(
    () => skuResults.find((sku) => sku.id === selectedSkuId) ?? null,
    [skuResults, selectedSkuId],
  );
  const canInitializeStock = Boolean(selectedLocationId && selectedSkuId && quantity && !loading);
  const canRequestAdjustment = Boolean(selectedLocationId && selectedSkuId && quantity && reason.trim() && !loading);

  const refreshInventory = async (locationId = selectedLocationId) => {
    const [locationPayload, balancePayload, adjustmentPayload, ledgerPayload] = await Promise.all([
      readJson<{ locations: Location[] }>('/api/inventory/locations'),
      readJson<{ balances: Balance[] }>(
        locationId ? `/api/inventory/balances?locationId=${encodeURIComponent(locationId)}` : '/api/inventory/balances',
      ),
      readJson<{ adjustmentRequests: AdjustmentRequest[] }>('/api/inventory/adjustments'),
      readJson<{ ledger: LedgerRow[] }>('/api/inventory/ledger'),
    ]);

    setLocations(locationPayload.locations ?? []);
    setBalances(balancePayload.balances ?? []);
    setAdjustments(adjustmentPayload.adjustmentRequests ?? []);
    setLedger(ledgerPayload.ledger ?? []);
    if (!selectedLocationId && locationPayload.locations?.[0]?.id) {
      setSelectedLocationId(locationPayload.locations[0].id);
    }
  };

  useEffect(() => {
    void refreshInventory().catch((error: Error) => setMessage(error.message));
  }, []);

  const searchSkus = async () => {
    if (!skuSearch.trim()) {
      setSkuResults([]);
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<{ skus: SkuResult[] }>(
        `/api/catalog/skus/search?q=${encodeURIComponent(skuSearch.trim())}&limit=20`,
      );
      setSkuResults(payload.skus ?? []);
      setMessage(`Found ${payload.skus?.length ?? 0} SKU(s) for inventory actions.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const initializeStock = async () => {
    if (!selectedLocationId || !selectedSkuId || !quantity) {
      setMessage('Select a location, select a SKU, and enter quantity.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/inventory/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: selectedLocationId,
          skuId: selectedSkuId,
          quantity: Number(quantity),
          note: reason || undefined,
        }),
      });
      await refreshInventory(selectedLocationId);
      setMessage('Initial stock posted successfully.');
      setQuantity('');
      setReason('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const requestAdjustment = async () => {
    if (!selectedLocationId || !selectedSkuId || quantity === '') {
      setMessage('Select a location, select a SKU, and enter the requested final quantity.');
      return;
    }
    if (!reason.trim()) {
      setMessage('Enter a reason for the adjustment request.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/inventory/adjustments/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: selectedLocationId,
          skuId: selectedSkuId,
          requestedQty: Number(quantity),
          reason,
        }),
      });
      await refreshInventory(selectedLocationId);
      setMessage('Adjustment request submitted for owner approval.');
      setQuantity('');
      setReason('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const decideAdjustment = async (requestId: string, decision: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await readJson(`/api/inventory/adjustments/${requestId}/${decision}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decisionNote: decisionNote || undefined,
        }),
      });
      await refreshInventory(selectedLocationId);
      setMessage(`Adjustment ${decision}d successfully.`);
      setDecisionNote('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewInventory) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Inventory access limited</h3>
          <p style={tokenMutedStyle}>Your role can’t view inventory data.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Live Balances</h3>
          <select
            value={selectedLocationId}
            onChange={(event) => {
              const nextLocationId = event.target.value;
              setSelectedLocationId(nextLocationId);
              void refreshInventory(nextLocationId).catch((error: Error) => setMessage(error.message));
            }}
            style={{ ...fieldStyle, marginBottom: 12 }}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} — {location.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'grid', gap: 10 }}>
            {balances.length ? (
              balances.map((balance) => (
                <article key={`${balance.location_id}-${balance.sku_id}`} style={{ ...surfaceCardStyle, padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{balance.product_name}</div>
                  <div style={{ color: '#475569' }}>
                    {balance.sku_code} · {balance.location_name}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    On hand: {Number(balance.on_hand_qty)} · Available: {Number(balance.available_qty)} · Reserved: {Number(balance.reserved_qty)}
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No balances found for the current filter.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Stock Actions</h3>
          {!canAdjustInventory ? (
            <p style={tokenMutedStyle}>Your role can review inventory, but stock changes are restricted.</p>
          ) : !canDirectAdjustInventory ? (
            <p style={tokenMutedStyle}>You can request quantity changes, but only owner-level roles can post stock directly.</p>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
            <input
              value={skuSearch}
              onChange={(event) => setSkuSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchSkus();
                }
              }}
              style={fieldStyle}
              placeholder="Search SKU or product"
            />
            <button onClick={searchSkus} style={secondaryButtonStyle} disabled={loading}>
              Search
            </button>
          </div>
          <select value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)} style={{ ...fieldStyle, marginBottom: 12 }}>
            <option value="">Select SKU</option>
            {skuResults.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.sku_code} — {sku.product_name}
                {sku.variant_label ? ` · ${sku.variant_label}` : ''}
              </option>
            ))}
          </select>
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} style={{ ...fieldStyle, marginBottom: 12 }} placeholder="Quantity or requested final qty" />
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} style={{ ...fieldStyle, minHeight: 88, marginBottom: 12 }} placeholder="Reason / note" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={initializeStock} style={secondaryButtonStyle} disabled={!canInitializeStock || !canDirectAdjustInventory}>
              Initialize Stock
            </button>
            <button onClick={requestAdjustment} style={secondaryButtonStyle} disabled={!canRequestAdjustment || !canRequestAdjustInventory}>
              Request Change
            </button>
          </div>
          {selectedSku ? (
            <p style={{ marginTop: 12, marginBottom: 0, color: '#475569' }}>
              Selected: {selectedSku.product_name} · {selectedSku.sku_code}
            </p>
          ) : null}
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Adjustment Queue</h3>
          <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} style={{ ...fieldStyle, minHeight: 72, marginBottom: 12 }} placeholder="Decision note for approve/reject" />
          <div style={{ display: 'grid', gap: 10 }}>
            {adjustments.length ? (
              adjustments.map((request) => (
                <article key={request.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{request.product_name}</div>
                      <div style={{ color: '#475569' }}>
                        {request.sku_code} · {request.location_name}
                      </div>
                      <div style={{ color: '#64748b' }}>
                        Current: {Number(request.current_qty)} → Requested: {Number(request.requested_qty)} ({Number(request.qty_delta) >= 0 ? '+' : ''}{Number(request.qty_delta)})
                      </div>
                      <div style={{ color: '#475569' }}>Reason: {request.reason}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ marginBottom: 8 }}>{request.status}</div>
                      {request.status === 'pending' && canApproveInventory ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => decideAdjustment(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>
                            Approve
                          </button>
                          <button onClick={() => decideAdjustment(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No adjustment requests yet.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Ledger</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {ledger.length ? (
              ledger.slice(0, 12).map((entry) => (
                <article key={entry.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{entry.product_name}</div>
                  <div style={{ color: '#475569' }}>
                    {entry.sku_code} · {entry.location_name}
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {entry.movement_type} · {Number(entry.qty_delta) >= 0 ? '+' : ''}{Number(entry.qty_delta)}
                  </div>
                  <div style={{ color: '#475569' }}>
                    {entry.actor_name || 'System'} · {new Date(entry.created_at).toLocaleString()}
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No ledger entries yet.</div>
            )}
          </div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
