'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, Store, Shield, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getStoredToken, getWorkspaceUrl, type AuthContext } from '@/lib/auth';

export default function SelectContextPage() {
  const router = useRouter();
  const [contexts, setContexts] = useState<AuthContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push('/');
      return;
    }

    fetch('/api/auth/contexts', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.contexts?.length > 0) {
          setContexts(data.contexts);
          if (data.contexts.length === 1) {
            void handleSelect(data.contexts[0]);
          }
        } else {
          router.push('/');
        }
      })
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSelect = async (ctx: AuthContext) => {
    setSelected(ctx.type === 'store' ? ctx.storeId : ctx.type);

    const token = getStoredToken();
    if (!token) return;

    try {
      const body: Record<string, string> = { type: ctx.type };
      if (ctx.type === 'store') body.storeId = ctx.storeId;

      const res = await fetch('/api/auth/select-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setSelected(null);
        return;
      }

      const redirectUrl = `${getWorkspaceUrl(ctx.type)}?token=${token}${ctx.type === 'store' && ctx.storeId ? `&storeId=${ctx.storeId}` : ""}`;

      window.location.href = redirectUrl;
    } catch {
      setSelected(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const adminContexts = contexts.filter((c) => c.type === 'admin');
  const storeContexts = contexts.filter((c) => c.type === 'store');

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center size-12 rounded-xl bg-primary shadow-sm mb-4">
            <Wrench className="size-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Select workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You have access to multiple workspaces
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a context</CardTitle>
            <CardDescription>
              Pick where you want to start working
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {adminContexts.map((ctx) => (
                <button
                  key="admin"
                  onClick={() => handleSelect(ctx)}
                  disabled={selected === 'admin'}
                  className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Shield className="size-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Platform Admin</p>
                    <p className="text-xs text-muted-foreground">
                      Seeded admin login for platform management &amp; oversight
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {ctx.roles.length} role{(ctx.roles.length !== 1 ? 's' : '')}
                  </Badge>
                  {selected === 'admin' && (
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  )}
                </button>
              ))}

              {adminContexts.length > 0 && storeContexts.length > 0 && (
                <Separator />
              )}

              {storeContexts.map((ctx) => (
                <button
                  key={ctx.storeId}
                  onClick={() => handleSelect(ctx)}
                  disabled={selected === ctx.storeId}
                  className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Store className="size-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      Store {ctx.storeId ? ctx.storeId.slice(0, 8) : 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ctx.storeId}
                    </p>
                  </div>
                  {selected === ctx.storeId && (
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  )}
                </button>
              ))}

              {contexts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No workspaces found. Contact your administrator.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
