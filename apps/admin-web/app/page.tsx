import Link from 'next/link';
import { Store, CreditCard, BarChart3, Shield, Bell, Headphones, Settings } from 'lucide-react';

import { fetchAdminApi, isAdminApiConfigured } from '../lib/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const quickActions = [
  { href: '/stores', title: 'Store Ops', icon: Store },
  { href: '/payments', title: 'Payments', icon: CreditCard },
  { href: '/reports', title: 'Reports', icon: BarChart3 },
  { href: '/audit', title: 'Audit', icon: Shield },
  { href: '/notifications', title: 'Notifications', icon: Bell },
  { href: '/support', title: 'Support', icon: Headphones },
  { href: '/settings', title: 'Settings', icon: Settings },
];

type PlatformOverview = {
  stores?: { total_stores?: number; active_stores?: number };
  sales?: { gross_sales_amount?: string | number; completed_sales_count?: number };
  support?: { open_tickets?: number };
};

export default async function AdminDashboardPage() {
  const overview = await fetchAdminApi<PlatformOverview>('/reports/platform/overview');
  const live = await isAdminApiConfigured();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight">Platform overview</h2>
        <span className="text-xs text-muted-foreground">
          {live ? 'Live data' : 'Set API_BASE_URL and ADMIN_DEMO_BEARER_TOKEN for live data'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Stores" value={overview?.stores?.total_stores ?? '—'} />
        <MetricCard title="Active Stores" value={overview?.stores?.active_stores ?? '—'} />
        <MetricCard title="Gross Sales" value={overview?.sales?.gross_sales_amount ?? '—'} />
        <MetricCard title="Open Tickets" value={overview?.support?.open_tickets ?? '—'} />
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
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
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
      </CardContent>
    </Card>
  );
}
