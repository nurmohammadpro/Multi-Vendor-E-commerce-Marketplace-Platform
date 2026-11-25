'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, X, Package, Truck } from 'lucide-react';

import {
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
  emptyStateStyle,
} from '../merchflow-theme';

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
  variant_label?: string | null;
};

type SkuResult = { id: string; sku_code: string; product_name: string; variant_label?: string | null; cost_price?: string | number | null };

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

export function ReceiveTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ purchase: Record<string, any>; items: OrderItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const refreshOrders = useCallback(async () => {
    try {
      const payload = await readJson<{ purchases: OrderRow[] }>('/api/store-ops/purchases?limit=100');
      setOrders(payload.purchases ?? []);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, []);

  useEffect(() => { void refreshOrders(); }, [refreshOrders]);

  const loadDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    try {
      const payload = await readJson<{ purchase: Record<string, any>; items: OrderItem[] }>(`/api/store-ops/purchases/${id}`);
      setDetail(payload);
    } catch (error) {
      toast.error((error as Error).message);
      setDetailId(null);
    }
  };

  const acceptOrder = async () => {
    if (!detailId) return;
    setBusy(true);
    try {
      await readJson(`/api/store-ops/purchases/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      const orderNo = detail?.purchase?.purchase_no ?? detailId;
      toast.success(`Order ${orderNo} accepted.`);
      setDetailId(null);
      setDetail(null);
      await refreshOrders();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const declineOrder = async () => {
    if (!detailId) return;
    setBusy(true);
    try {
      await readJson(`/api/store-ops/purchases/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const orderNo = detail?.purchase?.purchase_no ?? detailId;
      toast.success(`Order ${orderNo} declined.`);
      setDetailId(null);
      setDetail(null);
      await refreshOrders();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Detail view ──
  if (detailId && detail) {
    const order = detail.purchase;
    return (
      <section style={{ display: 'grid', gap: 12 }}>
        {/* Header */}
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <button onClick={() => { setDetailId(null); setDetail(null); }} style={{ ...tokenMutedStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>← Back</button>
              <h3 style={{ margin: '4px 0 0', fontSize: 15 }}>{order.purchase_no} <span style={statusBadge(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</span></h3>
              <p style={{ ...tokenMutedStyle, margin: '4px 0 0' }}>
                {order.supplier_name}
                {order.order_ref ? ` · Ref ${order.order_ref}` : ''}
                {order.expected_date ? ` · expected ${new Date(order.expected_date).toLocaleDateString('en-GB')}` : ''}
              </p>
            </div>
          </div>
        </article>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Deposit</div><div style={{ fontWeight: 700 }}>BDT {money(order.deposit_amount)}</div></article>
          <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Total Value</div><div style={{ fontWeight: 700 }}>BDT {money(order.total_amount)}</div></article>
          <article style={surfaceCardStyle}><div style={tokenMutedStyle}>Items</div><div style={{ fontWeight: 700 }}>{detail.items.length}</div></article>
        </div>

        {/* Line items */}
        <article style={surfaceCardStyle}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Line Items</h4>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Product</th>
                  <th style={tableHeaderCellStyle}>Variant</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Qty</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id}>
                    <td style={tableCellStyle}>{item.product_name_snapshot}<div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{item.sku_code_snapshot}</div></td>
                    <td style={tableCellStyle}>{item.variant_label || '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{qtyText(item.qty)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{money(item.unit_cost)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{money(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Actions */}
        <article style={{ ...surfaceCardStyle, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Accept or decline this order:</p>
          <button onClick={() => void acceptOrder()} style={{ ...gray800ButtonStyle, display: 'flex', alignItems: 'center', gap: 6 }} disabled={busy}>
            <Check size={14} /> Accept
          </button>
          <button onClick={() => void declineOrder()} style={{ ...secondaryButtonStyle, display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--destructive)' }} disabled={busy}>
            <X size={14} style={{ color: 'var(--destructive)' }} /> Decline
          </button>
        </article>
      </section>
    );
  }

  // If detail is loading but no ID set yet
  if (detailId && !detail) {
    return <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted-foreground)' }}>Loading order details…</div>;
  }

  // ── List view ──
  const filtered = orders.filter((o) => {
    const matchSearch = !searchQuery || o.purchase_no.toLowerCase().includes(searchQuery.toLowerCase()) || o.supplier_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !filterStatus || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Receive Orders</h3>
          <p style={{ ...tokenMutedStyle, margin: 0, fontSize: 12 }}>Incoming wholesale orders awaiting your decision.</p>
        </div>
      </article>

      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...fieldStyle, fontSize: 12, width: 220 }}
            placeholder="Search order / company…"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ ...fieldStyle, fontSize: 12 }}
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="partially_received">Part Received</option>
            <option value="fully_received">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div style={emptyStateStyle}>No incoming orders found.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Order</th>
                  <th style={tableHeaderCellStyle}>Company</th>
                  <th style={tableHeaderCellStyle}>Status</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Deposit</th>
                  <th style={tableHeaderCellStyle}>Expected</th>
                  <th style={tableHeaderCellStyle} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id}>
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{order.purchase_no}</div>
                      {order.order_ref ? <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Ref {order.order_ref}</div> : null}
                    </td>
                    <td style={tableCellStyle}>{order.supplier_name}</td>
                    <td style={tableCellStyle}><span style={statusBadge(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</span></td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{money(order.total_amount)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{money(order.deposit_amount)}</td>
                    <td style={tableCellStyle}>{order.expected_date ? new Date(order.expected_date).toLocaleDateString('en-GB') : '—'}</td>
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
