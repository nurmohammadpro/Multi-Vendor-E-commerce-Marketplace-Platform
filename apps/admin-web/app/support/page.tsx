import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminSupportPage() {
  return (
    <main>
      <section className="mb-6 max-w-[820px]">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Support and Disputes</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          Ticket queues, dispute supervision, and cross-team escalations should be managed here.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Queue triage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Separate urgent, blocked, and routine tickets so agents can resolve the highest-risk issues first.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Escalation paths</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Route disputes, billing questions, and technical issues to the right owner without manual rerouting.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resolution tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Maintain visible close-out reasons and next steps so support work reads like a controlled workflow, not a
              chat log.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
