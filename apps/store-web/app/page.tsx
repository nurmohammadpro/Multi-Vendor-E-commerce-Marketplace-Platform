import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import {
  compactSurfaceCardStyle,
  pageFrameStyle,
  pageLeadStyle,
  pageShellStyle,
  pageTitleStyle,
  sectionIntroStyle,
  sectionLabelStyle,
  surfaceCardStyle,
  metricLabelStyle,
  metricValueStyle,
  metricNoteStyle,
} from './motocore-theme';

const quickActions = [
  { href: '/pos', title: 'Open POS', detail: 'Process a sale, print a receipt, and manage shifts.' },
  { href: '/catalog', title: 'Catalog', detail: 'Manage categories, products, variants, and SKUs.' },
  { href: '/inventory', title: 'Inventory', detail: 'Review balances, adjustments, and the stock ledger.' },
  { href: '/shipping', title: 'Shipping', detail: 'Create shipments and move orders through delivery.' },
  { href: '/billing', title: 'Billing', detail: 'Check subscription health and invoice payment flow.' },
  { href: '/reports', title: 'Reports', detail: 'Open sales, inventory, and export jobs.' },
  { href: '/design-demos', title: 'Design Demos', detail: 'Review compact token directions before we redesign.' },
];

type StoreSalesReport = {
  summary?: {
    total_sales_amount?: string | number;
    total_orders_count?: number;
  };
};

export default async function StoreDashboardPage() {
  const salesReport = await fetchStoreApi<StoreSalesReport>('/reports/store/sales');
  const inventoryReport = await fetchStoreApi<{ summary?: { total_available_qty?: string | number } }>(
    '/reports/store/inventory',
  );

  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 24 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>
          Store workspace
        </span>
        <h2 style={pageTitleStyle}>Run daily operations from one clean control surface.</h2>
        <p style={pageLeadStyle}>
          The store shell is now wired for mobile and desktop, with quick access to POS, catalog, inventory,
          shipping, billing, and reporting.
        </p>
        <p style={{ margin: 0, color: '#6f685f' }}>
          {isStoreApiConfigured()
            ? 'Live API demo mode is active and the dashboard is reading from the backend.'
            : 'Set `API_BASE_URL`, `STORE_DEMO_BEARER_TOKEN`, and `STORE_DEMO_STORE_ID` to enable live API data.'}
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Total Sales</div>
          <div style={metricValueStyle}>{salesReport?.summary?.total_sales_amount ?? '—'}</div>
          <p style={metricNoteStyle}>Completed sales pulled from the reporting API.</p>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Orders</div>
          <div style={metricValueStyle}>{salesReport?.summary?.total_orders_count ?? '—'}</div>
          <p style={metricNoteStyle}>Recent completed order volume.</p>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Available Stock</div>
          <div style={metricValueStyle}>{inventoryReport?.summary?.total_available_qty ?? '—'}</div>
          <p style={metricNoteStyle}>Available inventory across the store locations.</p>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {quickActions.map((action) => (
          <a key={action.href} href={action.href} style={{ ...surfaceCardStyle, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{action.title}</div>
            <p style={{ margin: 0, lineHeight: 1.55, color: '#6f685f' }}>{action.detail}</p>
          </a>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Readiness gaps left</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.6, color: '#6f685f' }}>
            We still need deeper workflow coverage, stronger validation feedback, and richer production monitoring
            before the store app is truly “done.” The shell and primary screens are now much closer to a real operator
            experience.
          </p>
        </article>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>What improved this pass</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: '#6f685f' }}>
            <li>Mobile drawer navigation and route highlighting.</li>
            <li>Downloadable code archive from the workspace shell.</li>
            <li>Responsive dashboards and workspace sections.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
