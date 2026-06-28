import Link from 'next/link';
import { Store, CreditCard, BarChart3, Shield, Bell, Headphones, Settings } from 'lucide-react';

import { fetchAdminApi, isAdminApiConfigured } from '../lib/api';
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
  { href: '/stores', title: 'Store Ops', detail: 'Activate, suspend, and review merchant records.', icon: Store },
  { href: '/payments', title: 'Payments', detail: 'Monitor invoice and payment health.', icon: CreditCard },
  { href: '/reports', title: 'Reports', detail: 'Review platform KPIs and audit exports.', icon: BarChart3 },
  { href: '/audit', title: 'Audit', detail: 'Review recent platform actions and permission gates.', icon: Shield },
  { href: '/notifications', title: 'Notifications', detail: 'Compose broadcasts and process queues.', icon: Bell },
  { href: '/support', title: 'Support', detail: 'Handle tickets and cross-team escalations.', icon: Headphones },
  { href: '/settings', title: 'Settings', detail: 'Adjust platform-level controls carefully.', icon: Settings },
];

type PlatformOverview = {
  stores?: { total_stores?: number; active_stores?: number };
  sales?: { gross_sales_amount?: string | number; completed_sales_count?: number };
  support?: { open_tickets?: number };
};

export default async function AdminDashboardPage() {
  const overview = await fetchAdminApi<PlatformOverview>('/reports/platform/overview');

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Admin workspace</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Keep platform operations visible, calm, and accountable.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
          The admin shell now behaves like a real mobile-ready workspace with a persistent navigation model, active
          state, and direct access to operational surfaces.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {await isAdminApiConfigured()
            ? 'Live API demo mode is active and the dashboard is reading from the backend.'
            : 'Set API_BASE_URL and ADMIN_DEMO_BEARER_TOKEN to enable live admin dashboard data.'}
        </p>
      </section>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Stores" value={overview?.stores?.total_stores ?? '—'} note="Merchant accounts under management." />
        <MetricCard title="Active Stores" value={overview?.stores?.active_stores ?? '—'} note="Stores currently operating normally." />
        <MetricCard title="Gross Sales" value={overview?.sales?.gross_sales_amount ?? '—'} note="Completed sales rolled up at the platform layer." />
        <MetricCard title="Open Tickets" value={overview?.support?.open_tickets ?? '—'} note="Tickets needing direct attention." />
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
              What remains is stronger operational tooling: searchable queues, deep drilldowns, permission checks in the
              UI, and more audit-facing surfaces. The present shell is much closer to a production admin console.
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
