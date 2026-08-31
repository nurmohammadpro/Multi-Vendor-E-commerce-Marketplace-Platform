'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
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
} from '../merchflow-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle, useCompactLayout } from '../workspace-responsive';
import { printProductLabel } from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { toast } from 'sonner';

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
  is_trackable?: boolean;
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
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
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
  const compact = useCompactLayout();
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
  const [stockControlOpen, setStockControlOpen] = useState(false);
  const [printingSkuId, setPrintingSkuId] = useState<string | null>(null);

  // Serial visibility state
  const [expandedSkuId, setExpandedSkuId] = useState<string | null>(null);
  const [serials, setSerials] = useState<Record<string, Array<{ id: string; serial_number: string; imei_number?: string | null; tracking_values?: Record<string, string> | null; status: string }>>>({});
  const [serialLoading, setSerialLoading] = useState(false);
  const [imeiSearch, setImeiSearch] = useState('');
  const [imeiResult, setImeiResult] = useState<{ found: boolean; serial?: any; balance?: any } | null>(null);

  const printBalanceLabel = async (balance: Balance) => {
    setPrintingSkuId(balance.sku_id);
    try {
      const profile = loadWorkstationProfile();
      await printProductLabel({
        sku: balance.sku_code,
        productName: balance.product_name,
        storeName: 'Store',
        sellingPrice: null,
        printerName: profile.labelPrinterName || undefined,
        widthMm: 40,
        heightMm: 25,
        barcodeType: '128',
        copies: 1,
        border: true,
      }, profile.agentUrl);
      toast.success(`Label printed for ${balance.sku_code}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPrintingSkuId(null);
    }
  };

  const fetchSerials = async (skuId: string) => {
    if (expandedSkuId === skuId) {
      setExpandedSkuId(null);
      return;
    }
    setExpandedSkuId(skuId);
    if (serials[skuId]) return; // Already loaded
    setSerialLoading(true);
    try {
      const data = await readJson<{ serials: any[] }>(`/api/inventory/device-serials?skuId=${skuId}&limit=200`);
      setSerials((prev) => ({ ...prev, [skuId]: data.serials || [] }));
    } catch { /* ignore */ }
    finally { setSerialLoading(false); }
  };

  const searchByImei = async () => {
    if (!imeiSearch.trim()) { setImeiResult(null); return; }
    try {
      // Try IMEI first, then serial number
      let data = await readJson<{ serials: any[] }>(`/api/inventory/device-serials/search/all?imeiNumber=${encodeURIComponent(imeiSearch.trim())}&limit=1`);
      if (data.serials?.length > 0) {
        setImeiResult({ found: true, serial: data.serials[0] });
        setMessage(`Found serial: ${data.serials[0].serial_number || imeiSearch}`);
        return;
      }
      data = await readJson<{ serials: any[] }>(`/api/inventory/device-serials/search/all?serialNumber=${encodeURIComponent(imeiSearch.trim())}&limit=1`);
      if (data.serials?.length > 0) {
        setImeiResult({ found: true, serial: data.serials[0] });
        setMessage(`Found serial: ${data.serials[0].serial_number || imeiSearch}`);
      } else {
        setImeiResult({ found: false });
        setMessage(`No serial found for "${imeiSearch}"`);
      }
    } catch {
      setImeiResult({ found: false });
      setMessage(`No serial found for "${imeiSearch}"`);
    }
  };

  const selectedSku = useMemo(
    () => skuResults.find((sku) => sku.id === selectedSkuId) ?? null,
    [skuResults, selectedSkuId],
  );
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

  const directAdjustStock = async () => {
    if (!selectedLocationId || !selectedSkuId || quantity === '') {
      setMessage('Select a location, select a SKU, and enter the new stock quantity.');
      return;
    }
    if (!reason.trim()) {
      setMessage('Enter a reason for the stock adjustment.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/inventory/balances/direct-adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: selectedLocationId,
          skuId: selectedSkuId,
          onHandQty: Number(quantity),
          reservedQty: 0,
          damagedQty: 0,
          returnedQty: 0,
          reason,
        }),
      });
      await refreshInventory(balancePage, 1, ledgerPage, selectedLocationId);
      setMessage('Stock updated successfully.');
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
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
              Rows: <strong>{balanceSummary.visibleRows}</strong>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
              On hand: <strong>{formatQty(balanceSummary.onHand)}</strong>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
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
        <div style={{ ...searchRowStyle, marginBottom: 12 }}>
          <input value={balanceSearch} onChange={(event) => setBalanceSearch(event.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search product, SKU, or location" />
          <button onClick={() => void refreshInventory(1, adjustmentPage, ledgerPage, selectedLocationId)} style={searchButtonStyle} disabled={loading}>Search</button>
        </div>
        <div style={{ ...searchRowStyle, marginBottom: 12 }}>
          <input value={imeiSearch} onChange={(e) => setImeiSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchByImei()} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search by IMEI or serial number" />
          <button onClick={searchByImei} style={searchButtonStyle}>Find Serial</button>
        </div>
        {imeiResult && imeiResult.found && imeiResult.serial && (
          <div style={{ ...surfaceCardStyle, marginBottom: 12, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Serial Found</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              <span>Serial: <strong>{imeiResult.serial.serial_number}</strong></span>
              {imeiResult.serial.imei_number && <span style={{ marginLeft: 12 }}>IMEI: <strong>{imeiResult.serial.imei_number}</strong></span>}
              <span style={{ marginLeft: 12 }}>Status: <strong>{imeiResult.serial.status}</strong></span>
            </div>
            {imeiResult.serial.tracking_values && Object.keys(imeiResult.serial.tracking_values).length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(imeiResult.serial.tracking_values).map(([key, val]) => (
                  <span key={key} style={{ fontSize: 11, background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>{key}: {String(val)}</span>
                ))}
              </div>
            )}
          </div>
        )}
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
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <>
                      <tr key={`${balance.location_id}-${balance.sku_id}`} style={balance.is_trackable ? { cursor: 'pointer' } : undefined} onClick={balance.is_trackable ? () => fetchSerials(balance.sku_id) : undefined}>
                        <td style={tableCellStyle}>
                          {balance.is_trackable && (
                            <span style={{ marginRight: 4, fontSize: 10, color: 'var(--muted-foreground)' }}>
                              {expandedSkuId === balance.sku_id ? '▼' : '▶'}
                            </span>
                          )}
                          {balance.product_name}
                        </td>
                        <td style={tableCellStyle}>{balance.sku_code}</td>
                        <td style={tableCellStyle}>{balance.location_name}</td>
                        <td style={tableCellStyle}>{formatQty(balance.on_hand_qty)}</td>
                        <td style={tableCellStyle}>{formatQty(balance.available_qty)}</td>
                        <td style={tableCellStyle}>{formatQty(balance.reserved_qty)}</td>
                        <td style={tableCellStyle}>{new Date(balance.updated_at).toLocaleString()}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); void printBalanceLabel(balance); }}
                              style={{ ...subtleButtonStyle, fontSize: 11, padding: '4px 8px' }}
                              disabled={printingSkuId === balance.sku_id}
                            >
                              {printingSkuId === balance.sku_id ? 'Printing...' : 'Print Label'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
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
                                setStockControlOpen(true);
                              }}
                              style={secondaryButtonStyle}
                              disabled={loading}
                            >
                              Stock Control
                            </button>
                          </div>
                        </td>
                      </tr>
                      {balance.is_trackable && expandedSkuId === balance.sku_id && (
                        <tr key={`serials-${balance.sku_id}`}>
                          <td colSpan={8} style={{ padding: '0 16px 12px' }}>
                            <div style={{ background: 'var(--muted)', borderRadius: 8, padding: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Serial Numbers</div>
                              {serialLoading ? (
                                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Loading...</div>
                              ) : (serials[balance.sku_id]?.length ?? 0) === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No serials found</div>
                              ) : (
                                <div style={{ display: 'grid', gap: 4 }}>
                                  {serials[balance.sku_id]?.map((serial) => (
                                    <div key={serial.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--card)', borderRadius: 6, fontSize: 12 }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{serial.serial_number}</span>
                                      {serial.imei_number && <span style={{ color: 'var(--muted-foreground)' }}>IMEI: {serial.imei_number}</span>}
                                      <span style={{ marginLeft: 'auto', padding: '2px 6px', borderRadius: 4, background: serial.status === 'in_stock' ? '#dcfce7' : serial.status === 'sold' ? '#fee2e2' : '#e0e7ff', fontSize: 10, fontWeight: 500 }}>{serial.status}</span>
                                      {serial.tracking_values && Object.keys(serial.tracking_values).length > 0 && (
                                        <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                                          {Object.entries(serial.tracking_values).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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

      {stockControlOpen ? (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setStockControlOpen(false)}>
          <div style={{
            background: 'var(--card)', borderRadius: 16, padding: 24, maxWidth: 480, width: '95%',
            maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Stock Control</h3>
              <button onClick={() => setStockControlOpen(false)} style={{ ...secondaryButtonStyle, minWidth: 40, fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ ...tokenMutedStyle, marginBottom: 12 }}>
              {canRequestAdjustInventory
                ? 'Search for a SKU, enter the target quantity, and submit a change request for owner approval.'
                : 'Browse live stock quantities below. Changes require owner approval.'}
            </p>
            {!canRequestAdjustInventory ? (
              <div style={{ ...emptyStateStyle, marginBottom: 12 }}>Your role can review inventory, but stock changes are restricted.</div>
            ) : null}
            <div style={{ ...searchRowStyle, marginBottom: 12 }}>
              <input
                value={skuSearch}
                onChange={(event) => setSkuSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchSkus();
                  }
                }}
                style={{ ...fieldStyle, flex: 1, width: 'auto' }}
                placeholder="Search SKU or product"
              />
              <button onClick={searchSkus} style={searchButtonStyle} disabled={loading}>
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
              {canDirectAdjustInventory ? (
                <button onClick={directAdjustStock} style={searchButtonStyle} disabled={loading}>
                  Update Stock
                </button>
              ) : (
                <button
                  onClick={requestAdjustment}
                  style={{ ...gray800ButtonStyle, ...(!canRequestAdjustInventory ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                  disabled={!canRequestAdjustInventory || loading}
                >
                  Request Change
                </button>
              )}
            </div>
            {selectedSku ? (
              <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted-foreground)' }}>
                Selected: {selectedSku.product_name} · {selectedSku.sku_code}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
