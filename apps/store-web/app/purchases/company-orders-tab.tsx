'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  neutralButtonStyle,
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
import { openChallanPrintWindow } from '../../lib/challan-template';

type Supplier = { id: string; company_name: string; contact_name?: string | null; phone?: string | null; address?: string | null };
type Location = { id: string; code: string; name: string };
type OrderRow = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  supplier_name: string;
  status: string;
  order_ref?: string | null;
  expected_date?: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  deposit_amount?: string | number;
  payment_status: string;
  item_count: number;
};
type OrderItem = {
  id: string;
  product_name_snapshot: string;
  sku_code_snapshot: string;
  qty: string | number;
  estimated_qty?: string | number | null;
  received_qty?: string | number;
  unit_cost: string | number;
  line_total: string | number;
  unit?: string | null;
};
type OrderPayment = { id: string; amount: string | number; payment_method: string; reference_no?: string | null; payment_kind?: string | null; paid_at?: string | null };
type OrderDelivery = {
  id: string;
  delivery_no: string;
  truck_no?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  challan_no?: string | null;
  delivery_cost?: string | number;
  received_qty?: string | number;
  delivered_at?: string | null;
};
type OrderDetail = {
  purchase: Record<string, any>;
  items: OrderItem[];
  payments: OrderPayment[];
  deliveries: OrderDelivery[];
};
type SkuResult = { id: string; sku_code: string; product_name: string; variant_label?: string | null; cost_price?: string | number | null };
type Line = { skuId: string; skuCode: string; productName: string; estimatedQty: string; unitCost: string };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Ordered',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  partially_received: 'Part received',
  fully_received: 'Completed',
  received: 'Completed',
  cancelled: 'Cancelled',
};

const money = (v: string | number | undefined) =>
  Number(Number(v ?? 0).toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (v: string | number | undefined) => {
  const n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, '');
};

function statusBadge(status: string) {
  const palette: Record<string, { bg: string; fg: string }> = {
    draft: { bg: 'rgba(100,116,139,0.14)', fg: '#334155' },
    confirmed: { bg: 'rgba(37,99,235,0.14)', fg: '#1e40af' },
    shipped: { bg: 'rgba(217,119,6,0.16)', fg: '#92400e' },
    partially_received: { bg: 'rgba(217,119,6,0.16)', fg: '#92400e' },
    fully_received: { bg: 'rgba(22,163,74,0.14)', fg: '#166534' },
    received: { bg: 'rgba(22,163,74,0.14)', fg: '#166534' },
    cancelled: { bg: 'rgba(239,68,68,0.14)', fg: '#991b1b' },
  };
  const s = palette[status] ?? palette.draft;
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...{ background: s.bg, color: s.fg } };
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string; message?: string | string[] } | null;
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    if (payload && typeof payload === 'object') {
      const err = payload as { error?: string; message?: string | string[] };
      if (typeof err.error === 'string') message = err.error;
      else if (typeof err.message === 'string') message = err.message;
      else if (Array.isArray(err.message) && err.message.length) message = err.message[0];
    }
    throw new Error(message);
  }
  return payload as T;
}

export function CompanyOrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [store, setStore] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositReference, setDepositReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mfs' | 'bank_transfer'>('bank_transfer');
  const [lines, setLines] = useState<Line[]>([]);
  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState<SkuResult[]>([]);
  const [skuSearching, setSkuSearching] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await readJson<{ purchases: OrderRow[] }>('/api/store-ops/purchases?limit=25');
      setOrders(payload.purchases ?? []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void Promise.all([
      readJson<{ suppliers: Supplier[] }>('/api/store-ops/suppliers?limit=200').then((p) => setSuppliers(p.suppliers ?? [])).catch(() => {}),
      readJson<{ locations: Location[] }>('/api/inventory/locations').then((p) => setLocations(p.locations ?? [])).catch(() => {}),
      readJson<{ store?: Record<string, any> }>('/api/store/profile').then((p) => setStore(p.store ?? {})).catch(() => {}),
    ]);
  }, [refresh]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setDetail(null);
    try {
      const payload = await readJson<OrderDetail>(`/api/store-ops/purchases/${id}`);
      setDetail(payload);
    } catch (error) {
      toast.error((error as Error).message);
      setDetailId(null);
    }
  }, []);

  const searchSkus = async () => {
    if (!skuQuery.trim()) return;
    setSkuSearching(true);
    try {
      const payload = await readJson<{ skus: SkuResult[] }>(`/api/catalog/skus/search?q=${encodeURIComponent(skuQuery.trim())}&limit=20`);
      setSkuResults(payload.skus ?? []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSkuSearching(false);
    }
  };

  const addLine = (sku: SkuResult) => {
    setLines((current) => [
      ...current,
      {
        skuId: sku.id,
        skuCode: sku.sku_code,
        productName: sku.product_name + (sku.variant_label ? ` · ${sku.variant_label}` : ''),
        estimatedQty: '1',
        unitCost: sku.cost_price != null ? String(sku.cost_price) : '',
      },
    ]);
    setSkuResults([]);
    setSkuQuery('');
  };

  const createOrder = async () => {
    if (!supplierId) { toast.error('Select a company.'); return; }
    const validLines = lines.filter((l) => Number(l.estimatedQty) > 0);
    if (!validLines.length) { toast.error('Add at least one line item.'); return; }
    setBusy(true);
    try {
      const payload = await readJson<{ purchaseId: string; purchaseNo: string }>('/api/store-ops/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          locationId: locationId || undefined,
          purchaseDate: new Date().toISOString().slice(0, 10),
          orderRef: orderRef || undefined,
          expectedDate: expectedDate || undefined,
          note: note || undefined,
          status: 'draft',
          depositAmount: Number(depositAmount) || 0,
          depositReference: depositReference || undefined,
          paymentMethod,
          items: validLines.map((l) => ({
            skuId: l.skuId,
            qty: Number(l.estimatedQty),
            estimatedQty: Number(l.estimatedQty),
            unitCost: Number(l.unitCost) || 0,
          })),
        }),
      });
      toast.success(`Order ${payload.purchaseNo} created.`);
      setShowCreate(false);
      setLines([]); setOrderRef(''); setExpectedDate(''); setNote(''); setDepositAmount(''); setDepositReference('');
      await refresh();
      await loadDetail(payload.purchaseId);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patchOrder = async (patch: Record<string, unknown>) => {
    if (!detailId) return;
    setBusy(true);
    try {
      await readJson(`/api/store-ops/purchases/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await loadDetail(detailId);
      await refresh();
      toast.success('Order updated.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const printChallan = (delivery: OrderDelivery) => {
    if (!detail) return;
    const supplier = suppliers.find((s) => s.id === detail.purchase.supplier_id);
    openChallanPrintWindow({
      challanNo: delivery.challan_no,
      deliveryNo: delivery.delivery_no,
      date: delivery.delivered_at,
      orderRef: detail.purchase.order_ref,
      truckNo: delivery.truck_no,
      driverName: delivery.driver_name,
      driverPhone: delivery.driver_phone,
      store,
      supplier: supplier ? { companyName: supplier.company_name, contactName: supplier.contact_name, phone: supplier.phone } : { companyName: detail.purchase.supplier_name },
      items: (detail.items || []).map((i) => ({ productName: i.product_name_snapshot, skuCode: i.sku_code_snapshot, qty: delivery.received_qty ?? i.qty, unit: i.unit ?? null })),
      note: delivery.truck_no ? `Delivered by truck ${delivery.truck_no}` : null,
    });
  };

  // ── Detail view ──
  if (detailId) {
    return (
      <OrderDetailView
        detail={detail}
        busy={busy}
        onBack={() => { setDetailId(null); setDetail(null); }}
        onPatch={patchOrder}
        onPrintChallan={printChallan}
        onReload={() => void loadDetail(detailId)}
      />
    );
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14 }}>Company Orders</h3>
            <p style={{ ...tokenMutedStyle, margin: '2px 0 0' }}>Order from a company, send a deposit, track confirmation, shipment, and deliveries.</p>
          </div>
          <button onClick={() => setShowCreate((v) => !v)} style={gray800ButtonStyle}>
            {showCreate ? 'Close' : 'New Order'}
          </button>
        </div>

        {showCreate ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Company *</span>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={fieldStyle}>
                  <option value="">Select company</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Location</span>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={fieldStyle}>
                  <option value="">Default</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Order Ref</span>
                <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} style={fieldStyle} placeholder="Company order no" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Expected Date</span>
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={fieldStyle} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Deposit Amount</span>
                <input type="number" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} style={fieldStyle} placeholder="0.00" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Deposit Reference</span>
                <input value={depositReference} onChange={(e) => setDepositReference(e.target.value)} style={fieldStyle} placeholder="Txn / slip no" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Method</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} style={fieldStyle}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="mfs">MFS</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} style={fieldStyle} placeholder="Optional" />
            </label>

            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchSkus(); } }} style={{ ...fieldStyle, flex: 1 }} placeholder="Search product / SKU to add a line" />
                <button onClick={() => void searchSkus()} style={searchButtonStyle} disabled={skuSearching}>{skuSearching ? '…' : 'Search'}</button>
              </div>
              {skuResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 4, marginBottom: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                  {skuResults.map((sku) => (
                    <button key={sku.id} onClick={() => addLine(sku)} style={{ ...subtleButtonStyle, justifyContent: 'flex-start', textAlign: 'left' }}>
                      {sku.product_name}{sku.variant_label ? ` · ${sku.variant_label}` : ''} <span style={{ color: 'var(--muted-foreground)' }}>({sku.sku_code})</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {lines.length ? (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Item</th>
                        <th style={{ ...tableHeaderCellStyle, width: 120 }}>Est. Qty</th>
                        <th style={{ ...tableHeaderCellStyle, width: 120 }}>Unit Cost</th>
                        <th style={{ ...tableHeaderCellStyle, width: 60 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <tr key={line.skuId}>
                          <td style={tableCellStyle}>{line.productName}<div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{line.skuCode}</div></td>
                          <td style={tableCellStyle}>
                            <input type="number" min="0" value={line.estimatedQty} onChange={(e) => setLines((cur) => cur.map((l, i) => i === index ? { ...l, estimatedQty: e.target.value } : l))} style={{ ...fieldStyle, minHeight: 24 }} />
                          </td>
                          <td style={tableCellStyle}>
                            <input type="number" min="0" value={line.unitCost} onChange={(e) => setLines((cur) => cur.map((l, i) => i === index ? { ...l, unitCost: e.target.value } : l))} style={{ ...fieldStyle, minHeight: 24 }} />
                          </td>
                          <td style={tableCellStyle}>
                            <button onClick={() => setLines((cur) => cur.filter((_, i) => i !== index))} style={{ ...subtleButtonStyle, fontSize: 11 }}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={tokenMutedStyle}>No line items yet.</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowCreate(false)} style={neutralButtonStyle}>Cancel</button>
              <button onClick={() => void createOrder()} style={gray800ButtonStyle} disabled={busy}>{busy ? 'Saving…' : 'Place Order'}</button>
            </div>
          </div>
        ) : null}
      </article>

      <article style={surfaceCardStyle}>
        {loading ? (
          <div style={tokenMutedStyle}>Loading orders…</div>
        ) : orders.length === 0 ? (
          <div style={emptyStateStyle}>No company orders yet. Create one to start the deposit-first flow.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Order</th>
                  <th style={tableHeaderCellStyle}>Company</th>
                  <th style={tableHeaderCellStyle}>Status</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Deposit</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Total</th>
                  <th style={tableHeaderCellStyle}>Expected</th>
                  <th style={tableHeaderCellStyle} />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{order.purchase_no}</div>
                      {order.order_ref ? <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Ref {order.order_ref}</div> : null}
                    </td>
                    <td style={tableCellStyle}>{order.supplier_name}</td>
                    <td style={tableCellStyle}><span style={statusBadge(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</span></td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{money(order.deposit_amount)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{money(order.total_amount)}</td>
                    <td style={tableCellStyle}>{order.expected_date ? new Date(order.expected_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td style={tableCellStyle}>
                      <button onClick={() => void loadDetail(order.id)} style={{ ...subtleButtonStyle, fontSize: 11 }}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}

function OrderDetailView({
  detail,
  busy,
  onBack,
  onPatch,
  onPrintChallan,
  onReload,
}: {
  detail: OrderDetail | null;
  busy: boolean;
  onBack: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onPrintChallan: (delivery: OrderDelivery) => void;
  onReload: () => void;
}) {
  // Shipment form
  const [truckNo, setTruckNo] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  // Receive form
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);
  // Payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'mfs' | 'bank_transfer'>('bank_transfer');
  const [payRef, setPayRef] = useState('');

  if (!detail) return <div style={tokenMutedStyle}>Loading order…</div>;

  const order = detail.purchase;
  const status: string = order.status;
  const canConfirm = status === 'draft';
  const canShip = status === 'draft' || status === 'confirmed';
  const canReceive = ['confirmed', 'shipped', 'partially_received'].includes(status);
  // Shipment/receive card stays available for shipped and partially received orders
  const showShipmentCard = canShip || canReceive;
  const outstanding = Math.max(Number(order.total_amount ?? 0) - Number(order.paid_amount ?? 0), 0);

  const submitReceive = async () => {
    const items = Object.entries(receiveQty)
      .map(([purchaseItemId, value]) => ({ purchaseItemId, qty: Number(value) || 0 }))
      .filter((line) => line.qty > 0);
    if (!items.length) { toast.error('Enter a received quantity for at least one line.'); return; }
    setReceiving(true);
    try {
      await readJson(`/api/store-ops/purchases/${order.id}/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckNo: truckNo || undefined,
          challanNo: challanNo || undefined,
          driverName: driverName || undefined,
          driverPhone: driverPhone || undefined,
          deliveryCost: Number(deliveryCost) || undefined,
          items,
        }),
      });
      toast.success('Delivery received into stock.');
      setReceiveQty({});
      onReload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setReceiving(false);
    }
  };

  const submitPayment = async () => {
    if (!Number(payAmount)) { toast.error('Enter an amount.'); return; }
    try {
      await readJson(`/api/store-ops/purchases/${order.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(payAmount), paymentMethod: payMethod, referenceNo: payRef || undefined, paymentKind: 'settlement' }),
      });
      toast.success('Payment recorded.');
      setPayAmount(''); setPayRef('');
      onReload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <button onClick={onBack} style={{ ...tokenMutedStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>← All orders</button>
            <h3 style={{ margin: '4px 0 0', fontSize: 15 }}>{order.purchase_no} <span style={statusBadge(status)}>{STATUS_LABEL[status] ?? status}</span></h3>
            <p style={{ ...tokenMutedStyle, margin: '4px 0 0' }}>
              {order.supplier_name}
              {order.order_ref ? ` · Ref ${order.order_ref}` : ''}
              {order.expected_date ? ` · expected ${new Date(order.expected_date).toLocaleDateString('en-GB')}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canConfirm ? <button style={gray800ButtonStyle} disabled={busy} onClick={() => void onPatch({ status: 'confirmed' })}>Confirm</button> : null}
            {status !== 'cancelled' && status !== 'fully_received' && status !== 'received' ? (
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => void onPatch({ status: 'cancelled' })}>Cancel</button>
            ) : null}
          </div>
        </div>
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Deposit</div><div style={{ fontWeight: 700 }}>BDT {money(order.deposit_amount)}</div></article>
        <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Total</div><div style={{ fontWeight: 700 }}>BDT {money(order.total_amount)}</div></article>
        <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Paid</div><div style={{ fontWeight: 700 }}>BDT {money(order.paid_amount)}</div></article>
        <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Outstanding</div><div style={{ fontWeight: 700, color: outstanding > 0 ? '#b45309' : undefined }}>BDT {money(outstanding)}</div></article>
      </div>

      <article style={surfaceCardStyle}>
        <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Line items</h4>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Item</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Ordered</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Received</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Unit Cost</th>
                {canReceive ? <th style={{ ...tableHeaderCellStyle, textAlign: 'right', width: 130 }}>Receive now</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td style={tableCellStyle}>{item.product_name_snapshot}<div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{item.sku_code_snapshot}</div></td>
                  <td style={{ ...tableCellStyle, textAlign: 'right' }}>{qtyText(item.estimated_qty ?? item.qty)}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right' }}>{qtyText(item.received_qty)}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{money(item.unit_cost)}</td>
                  {canReceive ? (
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        value={receiveQty[item.id] ?? ''}
                        onChange={(e) => setReceiveQty((cur) => ({ ...cur, [item.id]: e.target.value }))}
                        style={{ ...fieldStyle, minHeight: 24, textAlign: 'right', width: 100 }}
                        placeholder="0"
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {showShipmentCard ? (
        <article style={surfaceCardStyle}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>{canShip ? 'Shipment details' : 'Delivery'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <input value={truckNo} onChange={(e) => setTruckNo(e.target.value)} style={fieldStyle} placeholder="Truck no" />
            <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} style={fieldStyle} placeholder="Challan no" />
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} style={fieldStyle} placeholder="Driver name" />
            <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} style={fieldStyle} placeholder="Driver phone" />
            <input type="number" min="0" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} style={fieldStyle} placeholder="Delivery cost" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {canShip ? (
            <button style={secondaryButtonStyle} disabled={busy} onClick={() => void onPatch({ status: 'shipped', truckNo, challanNo, driverName, driverPhone, deliveryCost: Number(deliveryCost) || undefined })}>
              Mark shipped
            </button>
            ) : null}
            <button style={gray800ButtonStyle} disabled={receiving} onClick={() => void submitReceive()}>
              {receiving ? 'Receiving…' : 'Receive delivery'}
            </button>
          </div>
        </article>
      ) : null}

      {outstanding > 0 && status !== 'cancelled' ? (
        <article style={surfaceCardStyle}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Record payment</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <input type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={fieldStyle} placeholder={`Amount (due ${money(outstanding)})`} />
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)} style={fieldStyle}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mfs">MFS</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)} style={fieldStyle} placeholder="Reference" />
            <button style={gray800ButtonStyle} onClick={() => void submitPayment()}>Post payment</button>
          </div>
        </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Deliveries</h4>
        {detail.deliveries.length === 0 ? (
          <div style={tokenMutedStyle}>No deliveries received yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {detail.deliveries.map((delivery) => (
              <div key={delivery.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{delivery.delivery_no}</strong>
                  <span style={{ color: 'var(--muted-foreground)' }}> · {qtyText(delivery.received_qty)} units
                    {delivery.truck_no ? ` · truck ${delivery.truck_no}` : ''}
                    {delivery.challan_no ? ` · challan ${delivery.challan_no}` : ''}
                  </span>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                    {delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString('en-GB') : ''}
                  </div>
                </div>
                <button onClick={() => onPrintChallan(delivery)} style={{ ...subtleButtonStyle, fontSize: 11 }}>Print challan</button>
              </div>
            ))}
          </div>
        )}
      </article>

      <article style={surfaceCardStyle}>
        <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Payments</h4>
        {detail.payments.length === 0 ? (
          <div style={tokenMutedStyle}>No payments recorded.</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {detail.payments.map((payment) => (
              <div key={payment.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>
                  <strong style={{ textTransform: 'capitalize' }}>{payment.payment_kind ?? 'settlement'}</strong>
                  <span style={{ color: 'var(--muted-foreground)' }}> · {payment.payment_method}{payment.reference_no ? ` · ${payment.reference_no}` : ''}</span>
                </span>
                <span style={{ fontFamily: 'monospace' }}>BDT {money(payment.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
