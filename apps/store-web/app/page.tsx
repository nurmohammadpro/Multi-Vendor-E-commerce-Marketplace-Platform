import Link from 'next/link';
import { Package, ShoppingCart, Truck, BarChart3 } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { getStoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import {
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  marketoneColors,
  pageShellStyle,
  sectionPanelStyle,
  sectionLabelStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from './marketone-theme';

const quickActions = [
  { href: '/pos', title: 'New Sale', detail: 'Start a POS sale — scan barcode, add items, checkout, print receipt.', icon: ShoppingCart, permission: 'sales.pos.create', feature: 'pos' },
  { href: '/catalog', title: 'Manage Products', detail: 'Add categories, brands, products, variants, and SKUs.', icon: Package, permission: 'catalog.manage', feature: 'catalog' },
  { href: '/purchases', title: 'Receive Stock', detail: 'Record supplier purchases — stock quantity updates automatically.', icon: Truck, feature: 'purchases' },
  { href: '/reports', title: 'View Reports', detail: 'Daily sales, stock snapshots, and business performance.', icon: BarChart3, permission: 'sales.report.view', feature: 'reports' },
] satisfies Array<{
  href: string;
  title: string;
  detail: string;
  icon: typeof Package;
  permission?: string;
  feature?: StoreConsoleFeature;
}>;

type StoreSalesReport = {
  summary?: { total_sales_amount?: string | number; total_orders_count?: number };
};

type PendingAdjustmentsPayload = { adjustmentRequests?: Array<unknown> };

function metricNumber(value: string | number | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

export default async function StoreDashboard() {
  const access = await getStoreConsoleAccess();
  const apiAvailable = await isStoreApiConfigured();

  let todaySales = '—';
  let todayOrders = '—';
  let pendingApprovals = '—';

  if (apiAvailable) {
    try {
      const salesPayload = await fetchStoreApi<StoreSalesReport>('/reports/store/sales-summary');
      if (salesPayload?.summary) {
        todaySales = `BDT ${metricNumber(salesPayload.summary.total_sales_amount)}`;
        todayOrders = String(salesPayload.summary.total_orders_count ?? '—');
      }
      const approvalsPayload = await fetchStoreApi<PendingAdjustmentsPayload>('/inventory/adjustments?status=pending&limit=50');
      if (approvalsPayload?.adjustmentRequests) {
        pendingApprovals = String(approvalsPayload.adjustmentRequests.length);
      }
    } catch { /* dashboard stays usable without API */ }
  }

  const allowedActions = quickActions.filter(
    (item) =>
      (!item.permission || access.permissions.includes(item.permission))
      && canAccessStoreFeature(access, item.feature),
  );

  return (
    <div style={pageShellStyle}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(24px, 2.2vw, 32px)', lineHeight: 1.1, letterSpacing: '-0.03em', fontWeight: 500 }}>
          Store Dashboard
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          {access.storeName || 'Your store'} · {access.planName} plan
        </p>
      </div>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 24 }}>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Today's Sales</div>
          <div style={metricValueStyle}>{todaySales}</div>
          <div style={metricNoteStyle}>{todayOrders} orders</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Pending Approvals</div>
          <div style={metricValueStyle}>{pendingApprovals}</div>
          <div style={metricNoteStyle}>stock or price changes</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Plan</div>
          <div style={{ ...metricValueStyle, textTransform: 'capitalize' }}>{access.planName}</div>
          <div style={metricNoteStyle}>{access.storeName || 'Active'}</div>
        </article>
      </section>

      <div style={sectionLabelStyle}>Quick Actions</div>
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 10 }}>
        {allowedActions.length ? (
          allowedActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  ...surfaceCardStyle,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                  textDecoration: 'none',
                  color: marketoneColors.ink,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: marketoneColors.backgroundAlt, border: `1px solid ${marketoneColors.border}`,
                }}>
                  <Icon size={20} style={{ color: marketoneColors.ink }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{action.title}</div>
                  <div style={tokenMutedStyle}>{action.detail}</div>
                </div>
              </Link>
            );
          })
        ) : (
          <div style={{ ...tokenMutedStyle, padding: '40px 0', textAlign: 'center', gridColumn: '1 / -1' }}>
            No actions available for your role yet. Contact the store owner to get started.
          </div>
        )}
      </section>
    </div>
  );
}
