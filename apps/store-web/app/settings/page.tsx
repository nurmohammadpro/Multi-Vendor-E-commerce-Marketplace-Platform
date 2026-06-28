import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function StoreSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Store settings</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Keep the operational defaults compact and predictable.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Timezone, currency, invoice prefix, receipt footer, policy preferences, and stock controls live here.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Operational defaults</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Store timezone, base currency, invoice numbering, and receipt footer text are set here so the POS and
              billing flows stay consistent.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Policy controls</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Approval thresholds, low-stock alerts, and stock adjustment behavior belong here, with tighter control for
              managers and owners.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Print and receipt</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Keep receipt format, footer copy, printer routing, and label defaults in one place so POS output stays
              predictable in every lane.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
