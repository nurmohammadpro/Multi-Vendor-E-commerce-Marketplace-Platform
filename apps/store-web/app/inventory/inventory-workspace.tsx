'use client';

import { useEffect, useMemo, useState } from 'react';

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
          {balances.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>SKU</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={tableHeaderCellStyle}>On Hand</th>
                    <th style={tableHeaderCellStyle}>Available</th>
                    <th style={tableHeaderCellStyle}>Reserved</th>
                    <th style={tableHeaderCellStyle}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={`${balance.location_id}-${balance.sku_id}`}>
                      <td style={tableCellStyle}>{balance.product_name}</td>
                      <td style={tableCellStyle}>{balance.sku_code}</td>
                      <td style={tableCellStyle}>{balance.location_name}</td>
                      <td style={tableCellStyle}>{Number(balance.on_hand_qty)}</td>
                      <td style={tableCellStyle}>{Number(balance.available_qty)}</td>
                      <td style={tableCellStyle}>{Number(balance.reserved_qty)}</td>
                      <td style={tableCellStyle}>{new Date(balance.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No balances found for the current filter.</div>
          )}
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
          {adjustments.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={tableHeaderCellStyle}>Current</th>
                    <th style={tableHeaderCellStyle}>Requested</th>
                    <th style={tableHeaderCellStyle}>Delta</th>
                    <th style={tableHeaderCellStyle}>Reason</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((request) => (
                    <tr key={request.id}>
                      <td style={tableCellStyle}>{request.product_name} · {request.sku_code}</td>
                      <td style={tableCellStyle}>{request.location_name}</td>
                      <td style={tableCellStyle}>{Number(request.current_qty)}</td>
                      <td style={tableCellStyle}>{Number(request.requested_qty)}</td>
                      <td style={tableCellStyle}>{Number(request.qty_delta) >= 0 ? '+' : ''}{Number(request.qty_delta)}</td>
                      <td style={tableCellStyle}>{request.reason}</td>
                      <td style={tableCellStyle}>{request.status}</td>
                      <td style={tableCellStyle}>
                        {request.status === 'pending' && canApproveInventory ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => decideAdjustment(request.id, 'approve')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                            <button onClick={() => decideAdjustment(request.id, 'reject')} style={secondaryButtonStyle} disabled={loading}>Reject</button>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No adjustment requests yet.</div>
          )}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Ledger</h3>
          {ledger.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={tableHeaderCellStyle}>Movement</th>
                    <th style={tableHeaderCellStyle}>Qty</th>
                    <th style={tableHeaderCellStyle}>Actor</th>
                    <th style={tableHeaderCellStyle}>Note</th>
                    <th style={tableHeaderCellStyle}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 20).map((entry) => (
                    <tr key={entry.id}>
                      <td style={tableCellStyle}>{entry.product_name} · {entry.sku_code}</td>
                      <td style={tableCellStyle}>{entry.location_name}</td>
                      <td style={tableCellStyle}>{entry.movement_type}</td>
                      <td style={tableCellStyle}>{Number(entry.qty_delta) >= 0 ? '+' : ''}{Number(entry.qty_delta)}</td>
                      <td style={tableCellStyle}>{entry.actor_name || 'System'}</td>
                      <td style={tableCellStyle}>{entry.note || '—'}</td>
                      <td style={tableCellStyle}>{new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No ledger entries yet.</div>
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
