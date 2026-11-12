import Link from 'next/link';
import { Building2, Package, ClipboardList, ShoppingCart, Truck, BarChart3, CreditCard, Users, Wallet, ReceiptText, Landmark, MapPin, CheckCircle } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { getStoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import {
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  merchflowColors,
  pageShellStyle,
  pageTitleStyle,
  sectionPanelStyle,
  sectionLabelStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from './merchflow-theme';

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
}

const quickActions = [
  // Daily operations
  { href: '/pos', group: 'Daily Operations', title: 'New Sale', detail: 'Run a POS sale — barcode scan, add items, checkout, print receipt.', icon: ShoppingCart, permission: 'sales.pos.create', feature: 'pos' },
  { href: '/receivables', group: 'Daily Operations', title: 'Receivables', detail: 'Track due sales, aging reports, customer ledger, and payment collections.', icon: Wallet, permission: 'sales.report.view', feature: 'receivables' },
  // Product & Stock
  { href: '/purchases', group: 'Product & Stock', title: 'Products & Stock', detail: 'Quick add new products, receive supplier stock, manage categories and suppliers.', icon: Package, feature: 'purchases' },
  { href: '/reports', group: 'Product & Stock', title: 'Reports', detail: 'Daily sales, stock snapshots, and exportable business reports.', icon: BarChart3, permission: 'sales.report.view', feature: 'reports' },
  { href: '/stock-ledger', group: 'Product & Stock', title: 'Stock Ledger', detail: 'View complete stock movement history and adjustments.', icon: ClipboardList, permission: 'inventory.view', feature: 'inventory' },
  { href: '/locations', group: 'Product & Stock', title: 'Locations', detail: 'Manage inventory locations, addresses, and contact details.', icon: MapPin, feature: 'inventory' },
  { href: '/suppliers', group: 'Product & Stock', title: 'Suppliers', detail: 'Manage suppliers, track payables, and view the supplier ledger.', icon: Building2, feature: 'purchases' },
  // Management
  { href: '/approvals', group: 'Management', title: 'Approvals', detail: 'Review pending stock quantity changes and manager-requested price updates.', icon: CheckCircle, permission: 'inventory.adjust.approve', feature: 'inventory' },
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
type SupplierListItem = { id: string; company_name: string; current_payable_amount?: string | number; status: string };
type PayablesAgingResult = {
  aging?: {
    today_amount?: string | number;
    today_count?: number;
    days_7_amount?: string | number;
    days_7_count?: number;
    days_30_amount?: string | number;
    days_30_count?: number;
    days_90_amount?: string | number;
    days_90_count?: number;
    days_90_plus_amount?: string | number;
    days_90_plus_count?: number;
  };
};

function metricNumber(value: string | number | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

function formatMoney(v: string | number | null | undefined) {
  return Number(Number(v ?? 0).toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default async function StoreDashboard() {
  const access = await getStoreConsoleAccess();
  const apiAvailable = await isStoreApiConfigured();
  const canViewSuppliers = access.canUsePurchases;

  let todaySales = '—';
  let todayOrders = '—';
  let pendingApprovals = '—';
  let totalSuppliers = '—';
  let totalPayables = '—';
  let payableAging: PayablesAgingResult['aging'] | undefined;
  let customerDues: { total: string; today: string } | null = null;

  if (apiAvailable) {
    try {
      const salesPayload = await fetchStoreApi<StoreSalesReport>('/reports/store/sales');
      if (salesPayload?.summary) {
        todaySales = `BDT ${metricNumber(salesPayload.summary.total_sales_amount)}`;
        todayOrders = String(salesPayload.summary.total_orders_count ?? '—');
      }
      const approvalsPayload = await fetchStoreApi<PendingAdjustmentsPayload>('/inventory/adjustments?status=pending&limit=50');
      if (approvalsPayload?.adjustmentRequests) {
        pendingApprovals = String(approvalsPayload.adjustmentRequests.length);
      }
    } catch {}

    if (access.planCode === 'wholesale') {
      try {
        const duesPayload = await fetchStoreApi<PayablesAgingResult>('/store-ops/due-sales/aging');
        if (duesPayload?.aging) {
          const totalDue =
            metricNumber(duesPayload.aging.today_amount)
            + metricNumber(duesPayload.aging.days_7_amount)
            + metricNumber(duesPayload.aging.days_30_amount)
            + metricNumber(duesPayload.aging.days_90_amount)
            + metricNumber(duesPayload.aging.days_90_plus_amount);
          customerDues = { total: formatMoney(totalDue), today: formatMoney(metricNumber(duesPayload.aging.today_amount)) };
        }
      } catch {}
    }

    if (canViewSuppliers) {
      try {
        const [suppliersPayload, agingPayload] = await Promise.all([
          fetchStoreApi<{ suppliers: SupplierListItem[]; pagination?: { total: number } }>('/store-ops/suppliers?limit=1&status=active'),
          fetchStoreApi<PayablesAgingResult>('/store-ops/payables/aging'),
        ]);
        if (suppliersPayload?.pagination) {
          totalSuppliers = String(suppliersPayload.pagination.total);
        }
        if (agingPayload?.aging) {
          payableAging = agingPayload.aging;
          const totalPayableAmount =
            metricNumber(agingPayload.aging.today_amount)
            + metricNumber(agingPayload.aging.days_7_amount)
            + metricNumber(agingPayload.aging.days_30_amount)
            + metricNumber(agingPayload.aging.days_90_amount)
            + metricNumber(agingPayload.aging.days_90_plus_amount);
          totalPayables = `BDT ${formatMoney(totalPayableAmount)}`;
        }
      } catch {}
    }
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

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 24 }}>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Today's Sales</div>
          <div style={metricValueStyle}>{todaySales}</div>
          <div style={metricNoteStyle}>{todayOrders} orders</div>
        </article>
        {access.planCode === 'wholesale' && customerDues ? (
          <article style={surfaceCardStyle}>
            <div style={metricLabelStyle}>Outstanding Dues</div>
            <div style={{ ...metricValueStyle, color: '#b45309' }}>BDT {customerDues.total}</div>
            <div style={metricNoteStyle}>
              <Link href="/invoices" style={{ color: 'inherit' }}>due today BDT {customerDues.today} · collect →</Link>
            </div>
          </article>
        ) : null}
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Pending Approvals</div>
          <div style={metricValueStyle}>{pendingApprovals}</div>
          <div style={metricNoteStyle}>stock or price changes</div>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Plan</div>
          <div style={{ ...metricValueStyle, textTransform: 'capitalize' }}>{access.planName}</div>
          <div style={metricNoteStyle}>Merch Flow</div>
        </article>
      </section>

      {canViewSuppliers && totalSuppliers !== '—' ? (
      <section style={{ marginBottom: 32 }}>
        <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Suppliers &amp; Payables</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <article style={surfaceCardStyle}>
            <div style={metricLabelStyle}>Total Suppliers</div>
            <div style={metricValueStyle}>{totalSuppliers}</div>
            <div style={metricNoteStyle}>active suppliers</div>
          </article>
          <article style={surfaceCardStyle}>
            <div style={metricLabelStyle}>Total Payables</div>
            <div style={metricValueStyle}>{totalPayables}</div>
            <div style={metricNoteStyle}>outstanding balance</div>
          </article>
          {payableAging ? (
            <article style={{ ...surfaceCardStyle, gridColumn: 'span 2' }}>
              <div style={metricLabelStyle}>Payable Aging</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>BDT {formatMoney(payableAging.today_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>Today</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>BDT {formatMoney(payableAging.days_7_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>1-7 days</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>BDT {formatMoney(payableAging.days_30_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>8-30 days</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>BDT {formatMoney(payableAging.days_90_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>31-90 days</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>BDT {formatMoney(payableAging.days_90_plus_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>90+ days</div>
                </div>
              </div>
            </article>
          ) : null}
        </section>
      </section>
      ) : null}

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
                      textDecoration: 'none', color: merchflowColors.ink,
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: merchflowColors.backgroundAlt, border: `1px solid ${merchflowColors.border}`,
                    }}>
                      <Icon size={20} style={{ color: merchflowColors.ink }} />
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
