import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, ClipboardList, ShoppingCart, BarChart3, CreditCard, LifeBuoy, ShieldAlert, Users, ReceiptText, Landmark } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { getStoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const quickActions = [
  { href: '/approvals', title: 'Approvals', detail: 'Review pending stock and price change requests.', icon: ClipboardList, permission: 'inventory.adjust.approve', feature: 'inventory' },
  { href: '/pos', title: 'Open POS', detail: 'Run paid or due sales, print receipts, and capture checkout activity.', icon: ShoppingCart, permission: 'sales.pos.create', feature: 'pos' },
  { href: '/catalog', title: 'Catalog', detail: 'Manage categories, products, variants, and SKUs.', icon: Package, permission: 'catalog.manage', feature: 'catalog' },
  { href: '/inventory', title: 'Stock', detail: 'Review balances, adjustments, and the stock ledger.', icon: ClipboardList, permission: 'inventory.view', feature: 'inventory' },
  { href: '/reports', title: 'Reports', detail: 'Open daily sales, stock snapshots, and exports.', icon: BarChart3, permission: 'sales.report.view', feature: 'reports' },
  { href: '/customers', title: 'Customers', detail: 'Track due customers, mobile, email, shop identity, and collections.', icon: Users, permission: 'sales.report.view', feature: 'customers' },
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
    { title: 'Daily Expense', plan: 'Standard', visible: !canAccessStoreFeature(access, 'expenses') },
    { title: 'HR & Payroll', plan: 'Pro', visible: !canAccessStoreFeature(access, 'payroll') },
    { title: 'Banking Reconciliation', plan: 'Pro', visible: !canAccessStoreFeature(access, 'banking') },
  ].filter((item) => item.visible);

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Store workspace</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Run daily operations from one clean control surface.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
          The store shell is now wired for mobile and desktop, with quick access to POS, catalog, inventory,
          shipping, billing, and reporting.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {await isStoreApiConfigured()
            ? 'Live API demo mode is active and the dashboard is reading from the backend.'
            : 'Set `API_BASE_URL`, `STORE_DEMO_BEARER_TOKEN`, and `STORE_DEMO_STORE_ID` to enable live API data.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-md border bg-background px-2 py-1">
            Plan: {access.planName}
          </span>
          <span className="inline-flex items-center rounded-md border bg-background px-2 py-1">
            Store: {access.storeName || 'Unknown'}
          </span>
          <span className="inline-flex items-center rounded-md border bg-background px-2 py-1">
            Subscription: {access.subscriptionStatus || 'Not available'}
          </span>
        </div>
      </section>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Sales" value={salesReport?.summary?.total_sales_amount ?? '—'} note="Completed sales pulled from the reporting API." />
        <MetricCard title="Orders" value={salesReport?.summary?.total_orders_count ?? '—'} note="Recent completed order volume." />
        <MetricCard title="Available Stock" value={inventoryReport?.summary?.total_available_qty ?? '—'} note="Available inventory across store locations." />
        <MetricCard title="Active Plan" value={access.planName} note="The current store subscription tier." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {availableQuickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className="block group">
              <Card className="transition-colors hover:bg-accent/50 cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{action.title}</CardTitle>
                    <Icon className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <CardDescription>{action.detail}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {lockedModules.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade unlocks</CardTitle>
            <CardDescription>These modules stay hidden from the left navigation until the store moves to the required plan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lockedModules.map((module) => (
              <div key={module.title} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{module.title}</span>
                <span className="text-muted-foreground">{module.plan}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Subscription scope</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground leading-relaxed space-y-2 list-disc pl-4">
              <li>Basic covers dashboard, stock, POS sales, reports, disputes, and support.</li>
              <li>Standard adds role-based user management and daily expense.</li>
              <li>Pro adds HR and payroll, advanced reporting, and banking reconciliation.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What improved this pass</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground leading-relaxed space-y-2 list-disc pl-4">
              <li>Plan-aware navigation now reflects Basic, Standard, and Pro access.</li>
              <li>Store-facing support and dispute workflows are being surfaced as first-class modules.</li>
              <li>POS is being aligned with local vendor due-sale requirements.</li>
              <li>RBAC and subscription scope now work together instead of independently.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </CardContent>
    </Card>
  );
}
