import Link from 'next/link';
import { Package, ClipboardList, ShoppingCart, Truck, BarChart3, CreditCard, Users, Wallet, ReceiptText, Landmark, MapPin } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { getStoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import {
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  marketoneColors,
  pageShellStyle,
  pageTitleStyle,
  sectionPanelStyle,
  sectionLabelStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from './marketone-theme';

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
}

const quickActions = [
  // Daily operations
  { href: '/pos', group: 'Daily Operations', title: 'New Sale', detail: 'Run a POS sale — barcode scan, add items, checkout, print receipt.', icon: ShoppingCart, permission: 'sales.pos.create', feature: 'pos' },
  { href: '/customers', group: 'Daily Operations', title: 'Customers', detail: 'Track due customers, contacts, shop identity, and payment collections.', icon: Users, permission: 'sales.report.view', feature: 'customers' },
  // Product & Stock
  { href: '/purchases', group: 'Product & Stock', title: 'Products & Stock', detail: 'Quick add new products, receive supplier stock, manage categories and suppliers.', icon: Package, feature: 'purchases' },
  { href: '/reports', group: 'Product & Stock', title: 'Reports', detail: 'Daily sales, stock snapshots, and exportable business reports.', icon: BarChart3, permission: 'sales.report.view', feature: 'reports' },
  { href: '/locations', group: 'Product & Stock', title: 'Locations', detail: 'Manage inventory locations, addresses, and contact details.', icon: MapPin, feature: 'inventory' },
  // Management
  { href: '/staff', group: 'Management', title: 'Team', detail: 'Manage users, employee records, and payroll workflow from one place.', icon: Users, permission: 'store.staff.manage', feature: 'staff' },
  { href: '/expenses', group: 'Management', title: 'Daily Expenses', detail: 'Track day-level store expenses and spending.', icon: ReceiptText, feature: 'expenses' },
  { href: '/banking', group: 'Management', title: 'Banking', detail: 'Reconcile banking activity, deposits, and withdrawals.', icon: Landmark, feature: 'banking' },
  { href: '/billing', group: 'Management', title: 'Subscription', detail: 'Check plan health, invoices, and payment status.', icon: CreditCard, permission: 'billing.subscription.manage', feature: 'billing' },
] satisfies Array<{
  href: string;
  group: string;
  title: string;
  detail: string;
  icon: typeof Package;
  permission?: string;
  feature?: StoreConsoleFeature;
}>;

type StoreSalesReport = { summary?: { total_sales_amount?: string | number; total_orders_count?: number } };
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
    } catch {}
  }

  const allowedActions = quickActions.filter(
    (item) =>
      (!item.permission || access.permissions.includes(item.permission))
      && canAccessStoreFeature(access, item.feature),
  );

  const groups = [...new Set(allowedActions.map((a) => a.group))];

  return (
    <div style={pageShellStyle}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ ...pageTitleStyle, marginBottom: 6 }}>
          {access.storeName || 'Store Dashboard'}
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>{access.planName} plan · {access.role} access</p>
      </div>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 32 }}>
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
          <div style={metricNoteStyle}>Market One BD</div>
        </article>
      </section>

      {groups.map((group) => {
        const groupItems = allowedActions.filter((a) => a.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} style={{ marginBottom: 28 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>{group}</div>
            <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {groupItems.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    style={{
                      ...surfaceCardStyle,
                      display: 'flex', gap: 16, alignItems: 'flex-start',
                      textDecoration: 'none', color: marketoneColors.ink,
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
              })}
            </section>
          </div>
        );
      })}
    </div>
  );
}
