'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  metricLabelStyle,
  metricValueStyle,
  pageShellStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

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

type BillingExportRow = {
  invoice_no: string;
  invoice_type: string;
  status: string;
  total_amount: string | number;
  paid_amount: string | number;
  due_at?: string | null;
  issued_at?: string | null;
};

type SupportExportRow = {
  ticket_no: string;
  ticket_type: string;
  subject: string;
  status: string;
  priority: string;
  opened_by_name?: string | null;
  created_at: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
}

export function ReportsWorkspace({ canViewReports }: { canViewReports: boolean }) {
  const compact = useCompactLayout();
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [inventory, setInventory] = useState<InventoryReport | null>(null);
  const [message, setMessage] = useState('Reports workspace is ready.');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'sales' | 'inventory' | 'due' | 'exports'>('summary');

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
      const bundle = await buildExportBundle(exportType, { sales, inventory });
      const printOpened = openA4ReportWindow(bundle.title, bundle.html);
      downloadCsv(`${exportType}-report.csv`, bundle.csv);
      setMessage(
        printOpened
          ? `${bundle.title} opened in the browser print window and CSV downloaded.`
          : `${bundle.title} CSV downloaded. Allow popups to open the A4 print window.`,
      );
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
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'summary' | 'sales' | 'inventory' | 'due' | 'exports')}
          tabs={[
            { key: 'summary', label: 'Summary' },
            { key: 'sales', label: 'Sales' },
            { key: 'inventory', label: 'Inventory' },
            { key: 'due', label: 'Due' },
            { key: 'exports', label: 'Exports' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'summary') ? (
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
          <div style={metricValueStyle}>{inventory ? formatQty(inventory.summary.total_available_qty) : '—'}</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Due Sales</div>
          <div style={metricValueStyle}>{sales?.summary.due_sales_count ?? '—'}</div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 4 }}>
            Amount: {sales?.summary.due_sales_amount ?? '—'}
          </div>
        </article>
      </section>
      ) : null}

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {!compact || activeTab === 'sales' ? (
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
          ) : <div style={emptyStateStyle}>No sales data is available for the selected report window yet.</div>}
        </article>
        ) : null}

        {!compact || activeTab === 'inventory' ? (
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
                      <td style={tableCellStyle}>{formatQty(balance.on_hand_qty)}</td>
                      <td style={tableCellStyle}>{formatQty(balance.available_qty)}</td>
                      <td style={tableCellStyle}>{new Date(balance.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={emptyStateStyle}>No inventory snapshot is available for the selected filters yet.</div>}
        </article>
        ) : null}
      </section>

      {(!compact || activeTab === 'due') ? (
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
      ) : null}

      {(!compact || activeTab === 'exports') ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Exports</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => createExport('sales')} style={accentButtonStyle} disabled={loading}>Export Sales</button>
          <button onClick={() => createExport('inventory')} style={accentButtonStyle} disabled={loading}>Export Inventory</button>
          <button onClick={() => createExport('billing')} style={accentButtonStyle} disabled={loading}>Export Billing</button>
          <button onClick={() => createExport('support')} style={accentButtonStyle} disabled={loading}>Export Support</button>
        </div>
      </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value: number | string | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function csvEscape(value: unknown) {
  const stringValue = String(value ?? '');
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openA4ReportWindow(title: string, bodyHtml: string) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: Arial, sans-serif; background: #eef2f7; color: #0f172a; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm; box-sizing: border-box; }
      .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
      .eyebrow { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
      .title { margin: 6px 0 0; font-size: 28px; font-weight: 700; }
      .meta { font-size: 12px; color: #475569; text-align: right; }
      .section { margin-top: 20px; }
      .section-title { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .metric { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; }
      .metric-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; }
      .metric-value { margin-top: 6px; font-size: 20px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; font-size: 12px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; color: #475569; font-weight: 700; }
      .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
      @media print {
        body { background: #fff; }
        .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="page">${bodyHtml}</div>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

async function buildExportBundle(
  exportType: 'sales' | 'inventory' | 'billing' | 'support',
  current: { sales: SalesReport | null; inventory: InventoryReport | null },
) {
  const generatedAt = new Date().toLocaleString();

  if (exportType === 'sales') {
    const sales = current.sales;
    if (!sales) throw new Error('Sales report is not loaded yet.');
    const rows = sales.recentSales ?? [];
    const csv = [
      ['sale_no', 'total_amount', 'payment_status', 'fulfillment_status', 'customer_name', 'customer_phone', 'created_at'],
      ...rows.map((sale) => [sale.sale_no, sale.total_amount, sale.payment_status, sale.fulfillment_status, sale.customer_name || sale.customer_shop_name || '', sale.customer_phone || '', sale.created_at]),
    ].map((row) => row.map(csvEscape).join(',')).join('\n');
    const html = `
      <div class="header"><div><div class="eyebrow">Market One BD</div><h1 class="title">Sales Report</h1></div><div class="meta">Generated: ${escapeHtml(generatedAt)}<br/>Format: A4 printable + CSV</div></div>
      <div class="section"><div class="summary">
        <div class="metric"><div class="metric-label">Total Sales</div><div class="metric-value">${formatMoney(sales.summary.total_sales_amount)}</div></div>
        <div class="metric"><div class="metric-label">Orders</div><div class="metric-value">${sales.summary.total_orders_count}</div></div>
        <div class="metric"><div class="metric-label">Due Sales</div><div class="metric-value">${sales.summary.due_sales_count}</div></div>
        <div class="metric"><div class="metric-label">Due Amount</div><div class="metric-value">${formatMoney(sales.summary.due_sales_amount)}</div></div>
      </div></div>
      <div class="section"><h2 class="section-title">Recent Sales</h2><table><thead><tr><th>Sale</th><th>Amount</th><th>Payment</th><th>Fulfillment</th><th>Customer</th><th>Phone</th><th>Created</th></tr></thead><tbody>
      ${rows.map((sale) => `<tr><td>${escapeHtml(sale.sale_no)}</td><td>${formatMoney(sale.total_amount)}</td><td>${escapeHtml(sale.payment_status)}</td><td>${escapeHtml(sale.fulfillment_status)}</td><td>${escapeHtml(sale.customer_name || sale.customer_shop_name || '—')}</td><td>${escapeHtml(sale.customer_phone || '—')}</td><td>${escapeHtml(new Date(sale.created_at).toLocaleString())}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="section"><h2 class="section-title">Due Sales</h2><table><thead><tr><th>Sale</th><th>Amount</th><th>Customer</th><th>Phone</th><th>Due Date</th></tr></thead><tbody>
      ${(sales.dueSales ?? []).map((sale) => `<tr><td>${escapeHtml(sale.sale_no)}</td><td>${formatMoney(sale.total_amount)}</td><td>${escapeHtml(sale.customer_name || sale.customer_shop_name || '—')}</td><td>${escapeHtml(sale.customer_phone || '—')}</td><td>${escapeHtml(sale.due_date || '—')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="footer">Developed and maintained by Market One BD · Your One Stop Marketplace</div>
    `;
    return { title: 'Sales Report', csv, html };
  }

  if (exportType === 'inventory') {
    const inventory = current.inventory;
    if (!inventory) throw new Error('Inventory report is not loaded yet.');
    const rows = inventory.balances ?? [];
    const csv = [
      ['product_name', 'sku_code', 'location_name', 'on_hand_qty', 'available_qty', 'updated_at'],
      ...rows.map((balance) => [balance.product_name, balance.sku_code, balance.location_name, formatQty(balance.on_hand_qty), formatQty(balance.available_qty), balance.updated_at]),
    ].map((row) => row.map(csvEscape).join(',')).join('\n');
    const html = `
      <div class="header"><div><div class="eyebrow">Market One BD</div><h1 class="title">Inventory Report</h1></div><div class="meta">Generated: ${escapeHtml(generatedAt)}<br/>Format: A4 printable + CSV</div></div>
      <div class="section"><div class="summary">
        <div class="metric"><div class="metric-label">SKUs</div><div class="metric-value">${inventory.summary.sku_count}</div></div>
        <div class="metric"><div class="metric-label">On Hand Qty</div><div class="metric-value">${formatQty(inventory.summary.total_on_hand_qty)}</div></div>
        <div class="metric"><div class="metric-label">Available Qty</div><div class="metric-value">${formatQty(inventory.summary.total_available_qty)}</div></div>
      </div></div>
      <div class="section"><h2 class="section-title">Inventory Snapshot</h2><table><thead><tr><th>Product</th><th>SKU</th><th>Location</th><th>On Hand</th><th>Available</th><th>Updated</th></tr></thead><tbody>
      ${rows.map((balance) => `<tr><td>${escapeHtml(balance.product_name)}</td><td>${escapeHtml(balance.sku_code)}</td><td>${escapeHtml(balance.location_name)}</td><td>${escapeHtml(formatQty(balance.on_hand_qty))}</td><td>${escapeHtml(formatQty(balance.available_qty))}</td><td>${escapeHtml(new Date(balance.updated_at).toLocaleString())}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="footer">Developed and maintained by Market One BD · Your One Stop Marketplace</div>
    `;
    return { title: 'Inventory Report', csv, html };
  }

  if (exportType === 'billing') {
    const payload = await readJson<{ invoices: BillingExportRow[] }>('/api/billing/invoices?limit=200');
    const rows = payload.invoices ?? [];
    const csv = [
      ['invoice_no', 'invoice_type', 'status', 'total_amount', 'paid_amount', 'due_at', 'issued_at'],
      ...rows.map((invoice) => [invoice.invoice_no, invoice.invoice_type, invoice.status, invoice.total_amount, invoice.paid_amount, invoice.due_at || '', invoice.issued_at || '']),
    ].map((row) => row.map(csvEscape).join(',')).join('\n');
    const html = `
      <div class="header"><div><div class="eyebrow">Market One BD</div><h1 class="title">Billing Report</h1></div><div class="meta">Generated: ${escapeHtml(generatedAt)}<br/>Format: A4 printable + CSV</div></div>
      <div class="section"><h2 class="section-title">Invoices</h2><table><thead><tr><th>Invoice</th><th>Type</th><th>Status</th><th>Total</th><th>Paid</th><th>Due Date</th><th>Issued</th></tr></thead><tbody>
      ${rows.map((invoice) => `<tr><td>${escapeHtml(invoice.invoice_no)}</td><td>${escapeHtml(invoice.invoice_type)}</td><td>${escapeHtml(invoice.status)}</td><td>${formatMoney(invoice.total_amount)}</td><td>${formatMoney(invoice.paid_amount)}</td><td>${escapeHtml(invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : '—')}</td><td>${escapeHtml(invoice.issued_at ? new Date(invoice.issued_at).toLocaleString() : '—')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="footer">Developed and maintained by Market One BD · Your One Stop Marketplace</div>
    `;
    return { title: 'Billing Report', csv, html };
  }

  const payload = await readJson<{ tickets: SupportExportRow[] }>('/api/support/tickets?limit=200');
  const rows = payload.tickets ?? [];
  const csv = [
    ['ticket_no', 'ticket_type', 'subject', 'status', 'priority', 'opened_by_name', 'created_at'],
    ...rows.map((ticket) => [ticket.ticket_no, ticket.ticket_type, ticket.subject, ticket.status, ticket.priority, ticket.opened_by_name || '', ticket.created_at]),
  ].map((row) => row.map(csvEscape).join(',')).join('\n');
  const html = `
    <div class="header"><div><div class="eyebrow">Market One BD</div><h1 class="title">Support Report</h1></div><div class="meta">Generated: ${escapeHtml(generatedAt)}<br/>Format: A4 printable + CSV</div></div>
    <div class="section"><h2 class="section-title">Tickets</h2><table><thead><tr><th>Ticket</th><th>Type</th><th>Subject</th><th>Status</th><th>Priority</th><th>Opened By</th><th>Created</th></tr></thead><tbody>
    ${rows.map((ticket) => `<tr><td>${escapeHtml(ticket.ticket_no)}</td><td>${escapeHtml(ticket.ticket_type)}</td><td>${escapeHtml(ticket.subject)}</td><td>${escapeHtml(ticket.status)}</td><td>${escapeHtml(ticket.priority)}</td><td>${escapeHtml(ticket.opened_by_name || '—')}</td><td>${escapeHtml(new Date(ticket.created_at).toLocaleString())}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Developed and maintained by Market One BD · Your One Stop Marketplace</div>
  `;
  return { title: 'Support Report', csv, html };
}
