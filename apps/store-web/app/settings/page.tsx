import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStoreConsoleAccess } from '../../lib/access';
import { SettingsWorkspace } from './settings-workspace';

export default async function StoreSettingsPage() {
  const access = await getStoreConsoleAccess();

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

      {access.canManageSettings ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Operational defaults</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Store timezone, base currency, invoice numbering, and receipt footer text are now editable below so POS,
                  invoices, and billing stay consistent.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Policy controls</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Negative stock behavior and low-stock thresholds are configurable here with owner-level control.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Print and receipt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Hardware routing still lives in workstation setup, but receipt branding and footer behavior can be managed here.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/hardware">Open hardware setup</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          <SettingsWorkspace canManageSettings={access.canManageSettings} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Settings locked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Only the store owner can change operational defaults and policy settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
