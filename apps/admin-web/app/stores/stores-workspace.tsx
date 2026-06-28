'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type StoreRow = {
  id: string;
  store_code: string;
  name: string;
  slug: string;
  phone: string;
  email?: string | null;
  status: 'pending' | 'active' | 'suspended' | 'inactive';
  subscription_status: string;
  owner_name?: string | null;
  owner_email?: string | null;
  staff_count: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function StoresWorkspace() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [message, setMessage] = useState('Platform store operations are ready.');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const payload = await readJson<{ stores: StoreRow[] }>('/api/stores');
    setStores(payload.stores ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const changeStatus = async (storeId: string, status: StoreRow['status']) => {
    setLoading(true);
    try {
      await readJson(`/api/stores/${storeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refresh();
      setMessage(`Store status changed to ${status}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {stores.map((store) => (
        <Card key={store.id}>
          <CardContent className="pt-[var(--erp-card-py)]">
            <div className="flex justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xl font-semibold">{store.name}</div>
                <div className="text-sm text-muted-foreground">{store.store_code} · {store.slug}</div>
                <div className="text-sm text-muted-foreground">
                  Owner: {store.owner_name || '—'} · {store.owner_email || store.email || '—'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Status: {store.status} · Subscription: {store.subscription_status} · Staff: {store.staff_count}
                </div>
              </div>
              <div className="flex gap-2 items-start flex-wrap">
                <Button onClick={() => changeStatus(store.id, 'active')} disabled={loading} variant="outline" size="sm">Activate</Button>
                <Button onClick={() => changeStatus(store.id, 'suspended')} disabled={loading} variant="outline" size="sm">Suspend</Button>
                <Button onClick={() => changeStatus(store.id, 'inactive')} disabled={loading} variant="outline" size="sm">Deactivate</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Operator Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </section>
  );
}
