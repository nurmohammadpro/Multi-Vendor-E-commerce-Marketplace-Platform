'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  accentButtonStyle,
  dangerButtonStyle,
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';

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

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
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
  const [balanceSearch, setBalanceSearch] = useState('');
  const [adjustmentSearch, setAdjustmentSearch] = useState('');
  const [adjustmentStatus, setAdjustmentStatus] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [balancePage, setBalancePage] = useState(1);
  const [adjustmentPage, setAdjustmentPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [balancePagination, setBalancePagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [adjustmentPagination, setAdjustmentPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [ledgerPagination, setLedgerPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
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

  const refreshInventory = async (
    nextBalancePage = balancePage,
    nextAdjustmentPage = adjustmentPage,
    nextLedgerPage = ledgerPage,
    locationId = selectedLocationId,
  ) => {
    const balanceParams = new URLSearchParams({ page: String(nextBalancePage), limit: String(balancePagination.limit) });
    const adjustmentParams = new URLSearchParams({ page: String(nextAdjustmentPage), limit: String(adjustmentPagination.limit) });
    const ledgerParams = new URLSearchParams({ page: String(nextLedgerPage), limit: String(ledgerPagination.limit) });
    if (locationId) balanceParams.set('locationId', locationId);
    if (balanceSearch.trim()) balanceParams.set('search', balanceSearch.trim());
    if (adjustmentSearch.trim()) adjustmentParams.set('search', adjustmentSearch.trim());
    if (adjustmentStatus) adjustmentParams.set('status', adjustmentStatus);
    if (ledgerSearch.trim()) ledgerParams.set('search', ledgerSearch.trim());
    if (selectedSkuId) ledgerParams.set('skuId', selectedSkuId);

    const [locationPayload, balancePayload, adjustmentPayload, ledgerPayload] = await Promise.all([
      readJson<{ locations: Location[] }>('/api/inventory/locations'),
      readJson<{ balances: Balance[]; pagination?: PaginationState }>(`/api/inventory/balances?${balanceParams.toString()}`),
      readJson<{ adjustmentRequests: AdjustmentRequest[]; pagination?: PaginationState }>(`/api/inventory/adjustments?${adjustmentParams.toString()}`),
      readJson<{ ledger: LedgerRow[]; pagination?: PaginationState }>(`/api/inventory/ledger?${ledgerParams.toString()}`),
    ]);

    setLocations(locationPayload.locations ?? []);
    setBalances(balancePayload.balances ?? []);
    setAdjustments(adjustmentPayload.adjustmentRequests ?? []);
    setLedger(ledgerPayload.ledger ?? []);
    setBalancePagination(balancePayload.pagination ?? { page: nextBalancePage, limit: balancePagination.limit, total: balancePayload.balances?.length ?? 0 });
    setAdjustmentPagination(adjustmentPayload.pagination ?? { page: nextAdjustmentPage, limit: adjustmentPagination.limit, total: adjustmentPayload.adjustmentRequests?.length ?? 0 });
    setLedgerPagination(ledgerPayload.pagination ?? { page: nextLedgerPage, limit: ledgerPagination.limit, total: ledgerPayload.ledger?.length ?? 0 });
    setBalancePage(balancePayload.pagination?.page ?? nextBalancePage);
    setAdjustmentPage(adjustmentPayload.pagination?.page ?? nextAdjustmentPage);
    setLedgerPage(ledgerPayload.pagination?.page ?? nextLedgerPage);
    if (!selectedLocationId && locationPayload.locations?.[0]?.id) {
      setSelectedLocationId(locationPayload.locations[0].id);
    }
  };

  useEffect(() => {
    void refreshInventory(1, 1, 1).catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedLocationId && locations[0]?.id) {
      const firstLocationId = locations[0].id;
      setSelectedLocationId(firstLocationId);
      void refreshInventory(1, adjustmentPage, ledgerPage, firstLocationId).catch((error: Error) => setMessage(error.message));
    }
  }, [locations, selectedLocationId, adjustmentPage, ledgerPage]);

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
      await refreshInventory(1, adjustmentPage, ledgerPage, selectedLocationId);
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
      await refreshInventory(balancePage, 1, ledgerPage, selectedLocationId);
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
      await refreshInventory(balancePage, adjustmentPage, ledgerPage, selectedLocationId);
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

  const totalBalancePages = totalPagesFor(balancePagination);
  const totalAdjustmentPages = totalPagesFor(adjustmentPagination);
  const totalLedgerPages = totalPagesFor(ledgerPagination);
  const balanceSummary = useMemo(
    () => ({
      visibleRows: balances.length,
      onHand: balances.reduce((sum, balance) => sum + Number(balance.on_hand_qty ?? 0), 0),
      available: balances.reduce((sum, balance) => sum + Number(balance.available_qty ?? 0), 0),
    }),
    [balances],
  );

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {!locations.length ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Inventory setup</h3>
          <p style={tokenMutedStyle}>
            This store does not have an active stock location yet. A default location is now provisioned automatically, so refresh the page if balances were blank before.
          </p>
        </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Live Balances</h3>
            <p style={{ ...tokenMutedStyle, marginBottom: 0 }}>
              Stock should appear here as soon as the store has an active location and sellable SKUs.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.22)', background: '#fff', fontSize: 13 }}>
              Rows: <strong>{balanceSummary.visibleRows}</strong>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.22)', background: '#fff', fontSize: 13 }}>
              On hand: <strong>{formatQty(balanceSummary.onHand)}</strong>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.22)', background: '#fff', fontSize: 13 }}>
              Available: <strong>{formatQty(balanceSummary.available)}</strong>
            </div>
          </div>
        </div>
        <select
          value={selectedLocationId}
          onChange={(event) => {
            const nextLocationId = event.target.value;
            setSelectedLocationId(nextLocationId);
            void refreshInventory(1, adjustmentPage, ledgerPage, nextLocationId).catch((error: Error) => setMessage(error.message));
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
          <input value={balanceSearch} onChange={(event) => setBalanceSearch(event.target.value)} style={fieldStyle} placeholder="Search product, SKU, or location" />
          <button onClick={() => void refreshInventory(1, adjustmentPage, ledgerPage, selectedLocationId)} style={secondaryButtonStyle} disabled={loading}>Search</button>
        </div>
        {balances.length ? (
          <>
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
                    <th style={tableHeaderCellStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={`${balance.location_id}-${balance.sku_id}`}>
                      <td style={tableCellStyle}>{balance.product_name}</td>
                      <td style={tableCellStyle}>{balance.sku_code}</td>
                      <td style={tableCellStyle}>{balance.location_name}</td>
                      <td style={tableCellStyle}>{formatQty(balance.on_hand_qty)}</td>
                      <td style={tableCellStyle}>{formatQty(balance.available_qty)}</td>
                      <td style={tableCellStyle}>{formatQty(balance.reserved_qty)}</td>
                      <td style={tableCellStyle}>{new Date(balance.updated_at).toLocaleString()}</td>
                      <td style={tableCellStyle}>
                        <button
                          onClick={() => {
                            setSelectedLocationId(balance.location_id);
                            setSelectedSkuId(balance.sku_id);
                            setSkuSearch(balance.sku_code);
                            setSkuResults([
                              {
                                id: balance.sku_id,
                                sku_code: balance.sku_code,
                                product_name: balance.product_name,
                              },
                            ]);
                            setMessage(`Loaded ${balance.sku_code} into stock control.`);
                          }}
                          style={secondaryButtonStyle}
                          disabled={loading}
                        >
                          Use in Stock Control
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager
              loading={loading}
              page={balancePage}
              pagination={balancePagination}
              label="balance row(s)"
              onPrevious={() => void refreshInventory(Math.max(1, balancePage - 1), adjustmentPage, ledgerPage, selectedLocationId)}
              onNext={() => void refreshInventory(Math.min(totalBalancePages, balancePage + 1), adjustmentPage, ledgerPage, selectedLocationId)}
            />
          </>
        ) : (
          <div style={emptyStateStyle}>No balances found yet. Products will appear here automatically after at least one active stock location exists for this store.</div>
        )}
      </article>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: '1.1fr 0.9fr' }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Stock Control</h3>
          <p style={{ ...tokenMutedStyle, marginBottom: 12 }}>
            Search an existing SKU, then initialize opening quantity or send an approval request for changes.
          </p>
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

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Adjustment Queue</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(140px, 180px) auto', gap: 8, marginBottom: 12 }}>
            <input value={adjustmentSearch} onChange={(event) => setAdjustmentSearch(event.target.value)} style={fieldStyle} placeholder="Search product, SKU, location, reason" />
            <select value={adjustmentStatus} onChange={(event) => setAdjustmentStatus(event.target.value)} style={fieldStyle}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button onClick={() => void refreshInventory(balancePage, 1, ledgerPage, selectedLocationId)} style={secondaryButtonStyle} disabled={loading}>Search</button>
          </div>
          <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} style={{ ...fieldStyle, minHeight: 72, marginBottom: 12 }} placeholder="Decision note for approve/reject" />
          {adjustments.length ? (
            <>
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
                              <button onClick={() => decideAdjustment(request.id, 'approve')} style={accentButtonStyle} disabled={loading}>Approve</button>
                              <button onClick={() => decideAdjustment(request.id, 'reject')} style={dangerButtonStyle} disabled={loading}>Reject</button>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={adjustmentPage}
                pagination={adjustmentPagination}
                label="request(s)"
                onPrevious={() => void refreshInventory(balancePage, Math.max(1, adjustmentPage - 1), ledgerPage, selectedLocationId)}
                onNext={() => void refreshInventory(balancePage, Math.min(totalAdjustmentPages, adjustmentPage + 1), ledgerPage, selectedLocationId)}
              />
            </>
          ) : (
            <div style={emptyStateStyle}>No adjustment requests yet.</div>
          )}
        </article>

      </section>

      <article style={{ ...surfaceCardStyle, borderStyle: 'solid' }}>
        <h3 style={{ marginTop: 0 }}>Ledger</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
          <input value={ledgerSearch} onChange={(event) => setLedgerSearch(event.target.value)} style={fieldStyle} placeholder="Search product, SKU, location, movement" />
          <button onClick={() => void refreshInventory(balancePage, adjustmentPage, 1, selectedLocationId)} style={secondaryButtonStyle} disabled={loading}>Search</button>
        </div>
        {ledger.length ? (
          <>
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
                  {ledger.map((entry) => (
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
            <ListPager
              loading={loading}
              page={ledgerPage}
              pagination={ledgerPagination}
              label="ledger row(s)"
              onPrevious={() => void refreshInventory(balancePage, adjustmentPage, Math.max(1, ledgerPage - 1), selectedLocationId)}
              onNext={() => void refreshInventory(balancePage, adjustmentPage, Math.min(totalLedgerPages, ledgerPage + 1), selectedLocationId)}
            />
          </>
        ) : (
          <div style={emptyStateStyle}>No ledger entries yet.</div>
        )}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
