import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { SettingsWorkspace } from './settings-workspace';

export default async function StoreSettingsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {access.canManageSettings ? (
        <>
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
    </section>
  );
}
