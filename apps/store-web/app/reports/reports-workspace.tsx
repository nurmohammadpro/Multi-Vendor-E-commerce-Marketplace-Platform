'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  metricLabelStyle,
  metricValueStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type SalesReport = {
  summary: {
    total_sales_amount: string | number;
    total_orders_count: number;
    total_discount_amount: string | number;
    total_tax_amount: string | number;
    due_sales_count: number;
    due_sales_amount: string | number;
  };
  recentSales: Array<{
    sale_no: string;
    total_amount: string | number;
    payment_status: string;
    fulfillment_status: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    customer_shop_name?: string | null;
    customer_address?: string | null;
    due_date?: string | null;
    created_at: string;
  }>;
  dueSales: Array<{
    sale_no: string;
    total_amount: string | number;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    customer_shop_name?: string | null;
    customer_address?: string | null;
    due_date?: string | null;
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
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Due Sales</div>
          <div style={metricValueStyle}>{sales?.summary.due_sales_count ?? '—'}</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            Amount: {sales?.summary.due_sales_amount ?? '—'}
          </div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Sales</h3>
          {sales?.recentSales?.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Sale</th>
                    <th style={tableHeaderCellStyle}>Amount</th>
                    <th style={tableHeaderCellStyle}>Payment</th>
                    <th style={tableHeaderCellStyle}>Fulfillment</th>
                    <th style={tableHeaderCellStyle}>Customer</th>
                    <th style={tableHeaderCellStyle}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.recentSales.map((sale) => (
                    <tr key={sale.sale_no}>
                      <td style={tableCellStyle}>{sale.sale_no}</td>
                      <td style={tableCellStyle}>{sale.total_amount}</td>
                      <td style={tableCellStyle}>{sale.payment_status}</td>
                      <td style={tableCellStyle}>{sale.fulfillment_status}</td>
                      <td style={tableCellStyle}>{sale.customer_name || sale.customer_shop_name || '—'}</td>
                      <td style={tableCellStyle}>{new Date(sale.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p style={tokenMutedStyle}>No sales data yet.</p>}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Inventory Snapshot</h3>
          {inventory?.balances?.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Product</th>
                    <th style={tableHeaderCellStyle}>SKU</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={tableHeaderCellStyle}>On Hand</th>
                    <th style={tableHeaderCellStyle}>Available</th>
                    <th style={tableHeaderCellStyle}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.balances.map((balance) => (
                    <tr key={`${balance.location_name}-${balance.sku_code}`}>
                      <td style={tableCellStyle}>{balance.product_name}</td>
                      <td style={tableCellStyle}>{balance.sku_code}</td>
                      <td style={tableCellStyle}>{balance.location_name}</td>
                      <td style={tableCellStyle}>{balance.on_hand_qty}</td>
                      <td style={tableCellStyle}>{balance.available_qty}</td>
                      <td style={tableCellStyle}>{new Date(balance.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p style={tokenMutedStyle}>No inventory data yet.</p>}
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Due Sales Follow-up</h3>
        {sales?.dueSales?.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Sale</th>
                  <th style={tableHeaderCellStyle}>Due Amount</th>
                  <th style={tableHeaderCellStyle}>Customer</th>
                  <th style={tableHeaderCellStyle}>Phone</th>
                  <th style={tableHeaderCellStyle}>Due Date</th>
                  <th style={tableHeaderCellStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                {sales.dueSales.map((sale) => (
                  <tr key={`due-${sale.sale_no}`}>
                    <td style={tableCellStyle}>{sale.sale_no}</td>
                    <td style={{ ...tableCellStyle, color: '#92400e' }}>{sale.total_amount}</td>
                    <td style={tableCellStyle}>{sale.customer_name || sale.customer_shop_name || 'Missing'}</td>
                    <td style={tableCellStyle}>{sale.customer_phone || 'Missing'}</td>
                    <td style={tableCellStyle}>{sale.due_date || 'Missing'}</td>
                    <td style={tableCellStyle}>{new Date(sale.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>No due sales are waiting for collection.</div>
        )}
      </article>

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
