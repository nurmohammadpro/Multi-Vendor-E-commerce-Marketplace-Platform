import Link from 'next/link';
import { Package, ClipboardList, ShoppingCart, Truck, BarChart3, CreditCard } from 'lucide-react';

import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
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
  { href: '/pos', title: 'Open POS', detail: 'Process a sale, print a receipt, and manage shifts.', icon: ShoppingCart },
  { href: '/catalog', title: 'Catalog', detail: 'Manage categories, products, variants, and SKUs.', icon: Package },
  { href: '/inventory', title: 'Inventory', detail: 'Review balances, adjustments, and the stock ledger.', icon: ClipboardList },
  { href: '/shipping', title: 'Shipping', detail: 'Create shipments and move orders through delivery.', icon: Truck },
  { href: '/billing', title: 'Billing', detail: 'Check subscription health and invoice payment flow.', icon: CreditCard },
  { href: '/reports', title: 'Reports', detail: 'Open sales, inventory, and export jobs.', icon: BarChart3 },
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
      </section>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Sales" value={salesReport?.summary?.total_sales_amount ?? '—'} note="Completed sales pulled from the reporting API." />
        <MetricCard title="Orders" value={salesReport?.summary?.total_orders_count ?? '—'} note="Recent completed order volume." />
        <MetricCard title="Available Stock" value={inventoryReport?.summary?.total_available_qty ?? '—'} note="Available inventory across store locations." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {quickActions.map((action) => {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Readiness gaps left</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We still need deeper workflow coverage, stronger validation feedback, and richer production monitoring
              before the store app is truly &ldquo;done.&rdquo; The shell and primary screens are now much closer to a real operator
              experience.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What improved this pass</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground leading-relaxed space-y-2 list-disc pl-4">
              <li>Responsive sidebar with collapsible icon mode.</li>
              <li>MotoCore density tokens for consistent spacing.</li>
              <li>Clean, minimal design with proper design system.</li>
              <li>Light/dark mode support via CSS variables.</li>
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
