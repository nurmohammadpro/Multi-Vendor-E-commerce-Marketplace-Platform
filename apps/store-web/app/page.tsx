import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, ClipboardList, ShoppingCart, BarChart3, CreditCard, LifeBuoy, ShieldAlert, Users, ReceiptText, Landmark, Wallet } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { getStoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import {
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  marketoneColors,
  pageShellStyle,
  pillStyle,
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
  { href: '/approvals', title: 'Approvals', detail: 'Review pending stock and price change requests.', icon: ClipboardList, permission: 'inventory.adjust.approve', feature: 'inventory' },
  { href: '/pos', title: 'Open POS', detail: 'Run paid or due sales, print receipts, and capture checkout activity.', icon: ShoppingCart, permission: 'sales.pos.create', feature: 'pos' },
  { href: '/catalog', title: 'Catalog', detail: 'Manage categories, products, variants, and SKUs.', icon: Package, permission: 'catalog.manage', feature: 'catalog' },
  { href: '/inventory', title: 'Stock', detail: 'Review balances, adjustments, and the stock ledger.', icon: ClipboardList, permission: 'inventory.view', feature: 'inventory' },
  { href: '/reports', title: 'Reports', detail: 'Open daily sales, stock snapshots, and exports.', icon: BarChart3, permission: 'sales.report.view', feature: 'reports' },
  { href: '/customers', title: 'Customers', detail: 'Track due customers, mobile, email, shop identity, and collections.', icon: Users, permission: 'sales.report.view', feature: 'customers' },
  { href: '/receivables', title: 'Receivables', detail: 'Follow due sales aging and collect outstanding customer payments.', icon: Wallet, permission: 'sales.report.view', feature: 'receivables' },
  { href: '/purchases', title: 'Purchases', detail: 'Receive supplier stock, track supplier history, and post payables.', icon: Package, feature: 'purchases' },
  { href: '/disputes', title: 'Disputes', detail: 'Track return, refund, and walk-in customer issue cases.', icon: ShieldAlert, permission: 'sales.report.view', feature: 'disputes' },
  { href: '/support', title: 'Support', detail: 'Open operational and technical support tickets.', icon: LifeBuoy, permission: 'sales.report.view', feature: 'support' },
  { href: '/staff', title: 'User Management', detail: 'Manage store owner, manager, and salesman access.', icon: Users, permission: 'store.staff.manage', feature: 'staff' },
  { href: '/expenses', title: 'Daily Expense', detail: 'Track day-level store expenses under the Standard plan.', icon: ReceiptText, feature: 'expenses' },
  { href: '/banking', title: 'Banking', detail: 'Reconcile banking activity and advanced finance workflows.', icon: Landmark, feature: 'banking' },
  { href: '/billing', title: 'Subscription', detail: 'Check plan health and invoice payment flow.', icon: CreditCard, permission: 'billing.subscription.manage', feature: 'billing' },
] satisfies Array<{
  href: string;
  title: string;
  detail: string;
  icon: typeof Package;
  permission?: string;
  feature?: StoreConsoleFeature;
}>;

type StoreSalesReport = {
  summary?: {
    total_sales_amount?: string | number;
    total_orders_count?: number;
  };
};

type PendingAdjustmentsPayload = {
  adjustmentRequests?: Array<unknown>;
};

type PendingPriceChangesPayload = {
  priceChangeRequests?: Array<unknown>;
};

export default async function StoreDashboardPage() {
  const access = await getStoreConsoleAccess();
  const [salesReport, inventoryReport, pendingAdjustments, pendingPriceChanges] = await Promise.all([
    fetchStoreApi<StoreSalesReport>('/reports/store/sales'),
    fetchStoreApi<{ summary?: { total_available_qty?: string | number } }>('/reports/store/inventory'),
    access.role === 'owner' && access.canApproveInventory
      ? fetchStoreApi<PendingAdjustmentsPayload>('/inventory/adjustments?status=pending')
      : Promise.resolve(null),
    access.role === 'owner' && access.canApproveInventory
      ? fetchStoreApi<PendingPriceChangesPayload>('/catalog/price-change-requests?status=pending')
      : Promise.resolve(null),
  ]);
  const pendingApprovalCount =
    (pendingAdjustments?.adjustmentRequests?.length ?? 0)
    + (pendingPriceChanges?.priceChangeRequests?.length ?? 0);

  if (access.role === 'owner' && access.canApproveInventory && pendingApprovalCount > 0) {
    redirect('/approvals');
  }

  const availableQuickActions = quickActions.filter(
    (action) =>
      (!action.permission || access.permissions.includes(action.permission))
      && canAccessStoreFeature(access, action.feature),
  );
  const lockedModules = [
    { title: 'User Management', plan: 'Standard', visible: !canAccessStoreFeature(access, 'staff') },
    { title: 'Purchases & Payables', plan: 'Standard', visible: !canAccessStoreFeature(access, 'purchases') },
    { title: 'Daily Expense', plan: 'Standard', visible: !canAccessStoreFeature(access, 'expenses') },
    { title: 'HR & Payroll', plan: 'Pro', visible: !canAccessStoreFeature(access, 'payroll') },
    { title: 'Banking Reconciliation', plan: 'Pro', visible: !canAccessStoreFeature(access, 'banking') },
  ].filter((item) => item.visible);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Store workspace</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>
          Run daily operations from one clean control surface.
        </h2>
        <p style={{ ...tokenMutedStyle, maxWidth: '65ch' }}>
          The store shell is now wired for mobile and desktop, with quick access to POS, catalog, inventory,
          shipping, billing, and reporting.
        </p>
        <p style={{ ...tokenMutedStyle, marginTop: 8 }}>
          {await isStoreApiConfigured()
            ? 'Live API demo mode is active and the dashboard is reading from the backend.'
            : 'Set `API_BASE_URL`, `STORE_DEMO_BEARER_TOKEN`, and `STORE_DEMO_STORE_ID` to enable live API data.'}
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={pillStyle}>Plan: {access.planName}</span>
          <span style={pillStyle}>Store: {access.storeName || 'Unknown'}</span>
          <span style={pillStyle}>Subscription: {access.subscriptionStatus || 'Not available'}</span>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${marketoneColors.borderStrong}` }} />

      <div style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <MetricCard title="Total Sales" value={salesReport?.summary?.total_sales_amount ?? '—'} note="Completed sales pulled from the reporting API." />
        <MetricCard title="Orders" value={salesReport?.summary?.total_orders_count ?? '—'} note="Recent completed order volume." />
        <MetricCard title="Available Stock" value={inventoryReport?.summary ? formatQty(inventoryReport.summary.total_available_qty) : '—'} note="Available inventory across store locations." />
        <MetricCard title="Active Plan" value={access.planName} note="The current store subscription tier." />
      </div>

      <div style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {availableQuickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} style={{ textDecoration: 'none' }}>
              <article style={{ ...surfaceCardStyle, cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{action.title}</div>
                  <Icon size={16} color={marketoneColors.muted} />
                </div>
                <p style={{ ...tokenMutedStyle, marginTop: 4 }}>{action.detail}</p>
              </article>
            </Link>
          );
        })}
      </div>

      {lockedModules.length ? (
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Upgrade unlocks</div>
          <p style={{ ...tokenMutedStyle, marginBottom: 12 }}>
            These modules stay hidden from the left navigation until the store moves to the required plan.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {lockedModules.map((module) => (
              <div key={module.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 6, border: `1px solid ${marketoneColors.border}`, fontSize: 13 }}>
                <span>{module.title}</span>
                <span style={{ color: marketoneColors.muted }}>{module.plan}</span>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Subscription scope</div>
          <ul style={{ ...tokenMutedStyle, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13 }}>
            <li>Basic covers dashboard, stock, POS sales, receivables, reports, disputes, and support.</li>
            <li>Standard adds purchases, supplier payables, role-based user management, and daily expense.</li>
            <li>Pro adds HR and payroll, advanced reporting, and banking reconciliation.</li>
          </ul>
        </article>
        <article style={surfaceCardStyle}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>What improved this pass</div>
          <ul style={{ ...tokenMutedStyle, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13 }}>
            <li>Plan-aware navigation now reflects Basic, Standard, and Pro access.</li>
            <li>Store-facing support and dispute workflows are being surfaced as first-class modules.</li>
            <li>POS is being aligned with local vendor due-sale requirements.</li>
            <li>RBAC and subscription scope now work together instead of independently.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string | number;
  note: string;
}) {
  return (
    <article style={surfaceCardStyle}>
      <div style={metricLabelStyle}>{title}</div>
      <div style={metricValueStyle}>{value}</div>
      <p style={{ ...metricNoteStyle, marginTop: 4 }}>{note}</p>
    </article>
  );
}
