import { fetchAdminApi, isAdminApiConfigured } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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

export default async function AdminSessionPage() {
  const profile = await fetchAdminApi<SessionProfile>('/auth/me');
  const configured = await isAdminApiConfigured();

  return (
    <main className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 max-w-[900px]">
        <span className="text-xs font-bold tracking-[0.16em] uppercase text-muted-foreground">
          Session status
        </span>
        <h2 className="m-0 text-3xl font-semibold leading-tight tracking-tight">
          See which admin identity and permissions are active.
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          This gives operators a direct answer when something feels like a permission or token issue.
        </p>
        <p className="text-sm text-muted-foreground">
          {configured
            ? 'The session endpoint is reachable.'
            : 'Set `API_BASE_URL` and `ADMIN_DEMO_BEARER_TOKEN` to inspect a live admin session.'}
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{profile?.user?.status ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">Identity status from the auth service.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Contexts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{profile?.contexts?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Available operating contexts for this account.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{profile?.permissions?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Granted permissions expanded from roles.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.user ? (
              <div className="grid gap-2 leading-relaxed text-sm">
                <div>User ID: {profile.user.id ?? '—'}</div>
                <div>Email: {profile.user.email || '—'}</div>
                <div>Phone: {profile.user.phone || '—'}</div>
                <div>Locale: {profile.user.preferredLocale || '—'}</div>
                <div>Session expiry: {profile.session?.expiresAt ? new Date(profile.session.expiresAt).toLocaleString() : '—'}</div>
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                No live session profile is available yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contexts and roles</CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.contexts?.length ? (
              <div className="flex flex-col gap-2.5">
                {profile.contexts.map((context, index) => (
                  <Card key={`${context.type}-${context.storeId || index}`} className="!p-3.5">
                    <div className="font-semibold text-sm">{context.type}</div>
                    <div className="text-sm text-muted-foreground">
                      {context.storeName || context.storeId || 'No store selected'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {context.roles?.join(', ') || 'No roles'}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                No contexts are available for this session.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.permissions?.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.permissions.map((permission) => (
                  <Badge key={permission} variant="secondary">{permission}</Badge>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                No permissions were returned by the backend.
              </div>
            )}
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
      </section>
    </main>
  );
}
