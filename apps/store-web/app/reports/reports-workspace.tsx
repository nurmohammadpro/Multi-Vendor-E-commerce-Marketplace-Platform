'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  metricLabelStyle,
  metricValueStyle,
  pageShellStyle,
  pageTitleStyle,
  sectionIntroStyle,
  sectionLabelStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type SalesReport = {
  summary: {
    total_sales_amount: string | number;
    total_orders_count: number;
    total_discount_amount: string | number;
    total_tax_amount: string | number;
  };
  recentSales: Array<{
    sale_no: string;
    total_amount: string | number;
    payment_status: string;
    fulfillment_status: string;
    created_at: string;
  }>;
};

type InventoryReport = {
  summary: {
    sku_count: number;
    total_on_hand_qty: string | number;
    total_available_qty: string | number;
  };
  balances: Array<{
    location_name: string;
    sku_code: string;
    product_name: string;
    on_hand_qty: string | number;
    available_qty: string | number;
    updated_at: string;
  }>;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function ReportsWorkspace({ canViewReports }: { canViewReports: boolean }) {
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [inventory, setInventory] = useState<InventoryReport | null>(null);
  const [message, setMessage] = useState('Reports workspace is ready.');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const [salesPayload, inventoryPayload] = await Promise.all([
      readJson<SalesReport>('/api/reports/sales'),
      readJson<InventoryReport>('/api/reports/inventory'),
    ]);
    setSales(salesPayload);
    setInventory(inventoryPayload);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const createExport = async (exportType: 'sales' | 'inventory' | 'billing' | 'support') => {
    setLoading(true);
    try {
      const payload = await readJson<{ exportJob: { id: string; export_type: string; status: string } }>('/api/reports/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportType, filters: {} }),
      });
      setMessage(`Export queued: ${payload.exportJob.export_type} (${payload.exportJob.id})`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewReports) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Reports access limited</h3>
          <p style={tokenMutedStyle}>Your role can’t view sales reports or export jobs.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Total Sales</div>
          <div style={metricValueStyle}>{sales?.summary.total_sales_amount ?? '—'}</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Orders</div>
          <div style={metricValueStyle}>{sales?.summary.total_orders_count ?? '—'}</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>SKUs</div>
          <div style={metricValueStyle}>{inventory?.summary.sku_count ?? '—'}</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Available Qty</div>
          <div style={metricValueStyle}>{inventory?.summary.total_available_qty ?? '—'}</div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Sales</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {sales?.recentSales.map((sale) => (
              <article key={sale.sale_no} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{sale.sale_no}</div>
                <div style={{ color: '#475569' }}>
                  {sale.total_amount} · {sale.payment_status} · {sale.fulfillment_status}
                </div>
                <div style={{ color: '#64748b' }}>{new Date(sale.created_at).toLocaleString()}</div>
              </article>
            )) ?? <p style={tokenMutedStyle}>No sales data yet.</p>}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Inventory Snapshot</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {inventory?.balances.map((balance) => (
              <article key={`${balance.location_name}-${balance.sku_code}`} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{balance.product_name}</div>
                <div style={{ color: '#475569' }}>
                  {balance.sku_code} · {balance.location_name}
                </div>
                <div style={{ color: '#64748b' }}>
                  On hand: {balance.on_hand_qty} · Available: {balance.available_qty}
                </div>
              </article>
            )) ?? <p style={tokenMutedStyle}>No inventory data yet.</p>}
          </div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Exports</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => createExport('sales')} style={secondaryButtonStyle} disabled={loading}>Export Sales</button>
          <button onClick={() => createExport('inventory')} style={secondaryButtonStyle} disabled={loading}>Export Inventory</button>
          <button onClick={() => createExport('billing')} style={secondaryButtonStyle} disabled={loading}>Export Billing</button>
          <button onClick={() => createExport('support')} style={secondaryButtonStyle} disabled={loading}>Export Support</button>
        </div>
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
