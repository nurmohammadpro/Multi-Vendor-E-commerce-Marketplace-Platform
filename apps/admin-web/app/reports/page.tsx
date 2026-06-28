import { fetchAdminApi, isAdminApiConfigured } from '../../lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type PlatformOverview = {
  stores?: { total_stores?: number; active_stores?: number };
  sales?: { gross_sales_amount?: string | number; completed_sales_count?: number };
  support?: { total_tickets?: number; open_tickets?: number };
  subscriptions?: { total_subscriptions?: number; active_subscriptions?: number };
};

type PlatformPayments = {
  invoices?: Array<{
    status: string;
    invoice_count: number;
    total_amount: string | number;
  }>;
  payments?: Array<{
    payment_method: string;
    status: string;
    payment_count: number;
    total_amount: string | number;
  }>;
};

type AuditRow = {
  id: string;
  action_code: string;
  actor_type?: string | null;
  store_id?: string | null;
  resource_type?: string | null;
  created_at: string;
};

export default async function AdminReportsPage() {
  const [overview, payments, audit] = await Promise.all([
    fetchAdminApi<PlatformOverview>('/reports/platform/overview'),
    fetchAdminApi<PlatformPayments>('/reports/platform/payments'),
    fetchAdminApi<{ logs?: AuditRow[] }>('/audit/logs'),
  ]);
  const configured = await isAdminApiConfigured();

  return (
    <main className="flex flex-col gap-6">
      <section className="max-w-[920px]">
        <Badge variant="secondary" className="mb-3">Platform reporting</Badge>
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Platform Reports</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          Operational, financial, and audit reporting now come from the live backend so the admin console behaves like a
          real working app.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {configured ? 'Live reporting data is connected.' : 'Set `API_BASE_URL` and `ADMIN_DEMO_BEARER_TOKEN` to enable live reporting.'}
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric title="Stores" value={overview?.stores?.total_stores ?? '—'} note="Merchant accounts managed by the platform." />
        <Metric title="Active Stores" value={overview?.stores?.active_stores ?? '—'} note="Stores currently operating normally." />
        <Metric title="Completed Sales" value={overview?.sales?.completed_sales_count ?? '—'} note="Orders finalized across stores." />
        <Metric title="Open Tickets" value={overview?.support?.open_tickets ?? '—'} note="Tickets needing direct attention." />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Payments and billing posture</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Invoices</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(payments?.invoices ?? []).length ? (
                    payments!.invoices!.map((row) => (
                      <Row key={row.status} label={row.status} value={`${row.invoice_count} · ${row.total_amount}`} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No invoice summaries yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Payment mix</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(payments?.payments ?? []).length ? (
                    payments!.payments!.map((row) => (
                      <Row
                        key={`${row.payment_method}-${row.status}`}
                        label={`${row.payment_method} · ${row.status}`}
                        value={`${row.payment_count} · ${row.total_amount}`}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No payment summaries yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            <p className="text-sm text-muted-foreground leading-relaxed">
              The payments view is now a live operational surface. The next refinement is adding per-store drilldown and
              exported reconciliation actions.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recent audit events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {audit?.logs?.length ? (
              audit.logs.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-lg border px-3 py-2">
                  <div className="text-sm font-medium">{row.action_code}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.actor_type || 'system'} · {row.resource_type || 'resource'} · {row.store_id || 'platform'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No audit rows available yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({
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
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
