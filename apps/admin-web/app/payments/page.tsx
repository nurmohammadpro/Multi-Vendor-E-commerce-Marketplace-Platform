import { fetchAdminApi, isAdminApiConfigured } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

export default async function AdminPaymentsPage() {
  const overview = await fetchAdminApi<PlatformPayments>('/reports/platform/payments');
  const configured = await isAdminApiConfigured();

  return (
    <main>
      <section className="mb-6 max-w-[860px]">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Payments and Billing</h2>
        <p className="mt-2.5 text-sm text-muted-foreground">
          {configured
            ? 'Live reporting data is connected.'
            : 'Set `API_BASE_URL` and `ADMIN_DEMO_BEARER_TOKEN` to enable live payment reporting.'}
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Statuses</CardTitle>
          </CardHeader>
          <CardContent>
            {(overview?.invoices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoice summaries yet.</p>
            ) : (
              overview!.invoices!.map((row) => (
                <div key={row.status} className="flex justify-between gap-3 py-1">
                  <span className="text-muted-foreground">{row.status}</span>
                  <strong>{row.invoice_count}</strong>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Mix</CardTitle>
          </CardHeader>
          <CardContent>
            {(overview?.payments ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment summaries yet.</p>
            ) : (
              overview!.payments!.map((row) => (
                <div key={`${row.payment_method}-${row.status}`} className="flex justify-between gap-3 py-1">
                  <span className="text-muted-foreground">
                    {row.payment_method} · {row.status}
                  </span>
                  <strong>{row.payment_count}</strong>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
