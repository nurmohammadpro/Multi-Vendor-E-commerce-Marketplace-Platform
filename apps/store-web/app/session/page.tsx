import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

import { fetchStoreApi, isStoreApiConfigured } from '../../lib/api';
import { pageShellStyle } from '../merchflow-theme';
import { LogoutButton } from './logout-button';

type SessionProfile = {
  user?: {
    id?: string;
    email?: string | null;
    phone?: string | null;
    preferredLocale?: string | null;
    status?: string;
  };
  contexts?: Array<{
    type: string;
    storeId?: string | null;
    storeName?: string | null;
    roles?: string[];
    permissions?: string[];
  }>;
  permissions?: string[];
  session?: {
    expiresAt?: string | null;
  };
};

export default async function StoreSessionPage() {
  const profile = await fetchStoreApi<SessionProfile>('/auth/me');
  const configured = await isStoreApiConfigured();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Status" value={profile?.user?.status ?? '—'} note="Identity status from the auth service." />
        <MetricCard title="Contexts" value={profile?.contexts?.length ?? 0} note="Available operating contexts for this account." />
        <MetricCard title="Permissions" value={profile?.permissions?.length ?? 0} note="Granted permissions expanded from roles." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm leading-relaxed">
              {profile?.user ? (
                <>
                  <div>User ID: {profile.user.id ?? '—'}</div>
                  <div>Email: {profile.user.email || '—'}</div>
                  <div>Phone: {profile.user.phone || '—'}</div>
                  <div>Locale: {profile.user.preferredLocale || '—'}</div>
                  <div>Session expiry: {profile.session?.expiresAt ? new Date(profile.session.expiresAt).toLocaleString() : '—'}</div>
                </>
              ) : (
                <p className="text-muted-foreground">No live session profile is available yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contexts and roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {profile?.contexts?.length ? (
                profile.contexts.map((context, index) => (
                  <div key={`${context.type}-${context.storeId || index}`} className="rounded-md border p-3 text-sm">
                    <div className="font-semibold">{context.type}</div>
                    <div className="text-muted-foreground">{context.storeName || context.storeId || 'No store selected'}</div>
                    <div className="text-muted-foreground/70">{context.roles?.join(', ') || 'No roles'}</div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No contexts are available for this session.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile?.permissions?.length ? (
                profile.permissions.map((permission) => (
                  <span key={permission} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium">
                    {permission}
                  </span>
                ))
              ) : (
                <p className="text-muted-foreground">No permissions were returned by the backend.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/">Back to dashboard</Link>
              </Button>
              <LogoutButton />
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              The session view makes auth state visible, which helps operators debug context issues, expired tokens, and
              permission mismatches without leaving the workspace.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
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
