import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminReportsPage() {
  return (
    <main>
      <section className="mb-6 max-w-[820px]">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Platform Reports</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          Operational, financial, and audit reporting should be consolidated here for admin teams.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Operational KPIs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Track store activation, active merchants, open tickets, and platform performance trends in one glance.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Financial rollups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Consolidate subscription revenue, invoice status, and payment gateway health without leaving the admin
              workspace.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Audit exports</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Keep exports and review history close to the report surface so owner workflows remain traceable and fast.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
