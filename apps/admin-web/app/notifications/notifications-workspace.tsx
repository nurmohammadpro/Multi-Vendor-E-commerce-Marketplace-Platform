'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type NotificationRow = {
  id: string;
  channel: string;
  title?: string | null;
  body: string;
  status: string;
  sent_at?: string | null;
  created_at: string;
};

type BroadcastRow = {
  id: string;
  audience_type: string;
  channel: string;
  title?: string | null;
  body: string;
  status: string;
  scheduled_at?: string | null;
  created_at: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function NotificationsWorkspace() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [message, setMessage] = useState('Notifications and broadcasts are ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    audienceType: 'all_stores',
    channel: 'in_app',
    title: '',
    body: '',
  });
  const canCreateBroadcast = Boolean(form.body.trim() && !loading);

  const refresh = async () => {
    const [notificationPayload, broadcastPayload] = await Promise.all([
      readJson<{ notifications: NotificationRow[] }>('/api/ops/notifications'),
      readJson<{ broadcasts: BroadcastRow[] }>('/api/broadcasts'),
    ]);
    setNotifications(notificationPayload.notifications ?? []);
    setBroadcasts(broadcastPayload.broadcasts ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const createBroadcast = async () => {
    if (!form.body.trim()) return;
    setLoading(true);
    try {
      await readJson('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audienceType: form.audienceType,
          channel: form.channel,
          title: form.title || undefined,
          body: form.body,
        }),
      });
      await refresh();
      setForm({ audienceType: 'all_stores', channel: 'in_app', title: '', body: '' });
      setMessage('Broadcast draft created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const processBroadcast = async (broadcastId: string) => {
    setLoading(true);
    try {
      await readJson(`/api/broadcasts/${broadcastId}/process`, { method: 'POST' });
      await refresh();
      setMessage('Broadcast processed and notifications queued.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const processNotifications = async () => {
    setLoading(true);
    try {
      await readJson('/api/ops/notifications/process', { method: 'POST' });
      await refresh();
      setMessage('Queued notifications processed.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Broadcast Compose</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              <select
                value={form.audienceType}
                onChange={(e) => setForm((v) => ({ ...v, audienceType: e.target.value }))}
                className="border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs h-10"
              >
                <option value="all_stores">All Stores</option>
                <option value="admins">Admins</option>
                <option value="selected_stores">Selected Stores</option>
              </select>
              <select
                value={form.channel}
                onChange={(e) => setForm((v) => ({ ...v, channel: e.target.value }))}
                className="border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs h-10"
              >
                <option value="in_app">In-App</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
              <Input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="Title" />
              <textarea
                value={form.body}
                onChange={(e) => setForm((v) => ({ ...v, body: e.target.value }))}
                className="border-input placeholder:text-muted-foreground w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs min-h-[120px]"
                placeholder="Broadcast body"
              />
              <Button onClick={createBroadcast} disabled={!canCreateBroadcast}>Create Broadcast</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={processNotifications} disabled={loading} variant="outline" className="mb-3">
              Process Queued Notifications
            </Button>
            <div className="flex flex-col gap-2.5 max-h-[420px] overflow-auto">
              {notifications.length ? (
                notifications.map((notification) => (
                  <Card key={notification.id} className="!p-3.5">
                    <div className="font-semibold text-sm">{notification.title || notification.channel}</div>
                    <div className="text-sm text-muted-foreground">
                      {notification.status} · {notification.channel}
                    </div>
                    <div className="text-sm text-muted-foreground">{notification.body}</div>
                  </Card>
                ))
              ) : (
                <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                  No notifications are queued right now.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Broadcasts</CardTitle>
        </CardHeader>
        <CardContent>
          {broadcasts.length ? (
            <div className="flex flex-col gap-2.5">
              {broadcasts.map((broadcast) => (
                <Card key={broadcast.id} className="!p-3.5">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-semibold text-sm">{broadcast.title || broadcast.audience_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {broadcast.status} · {broadcast.channel} · {broadcast.audience_type}
                      </div>
                      <div className="text-sm text-muted-foreground">{broadcast.body}</div>
                    </div>
                    <div>
                      <Button
                        onClick={() => processBroadcast(broadcast.id)}
                        disabled={loading || broadcast.status === 'sent'}
                        variant="outline"
                        size="sm"
                      >
                        {broadcast.status === 'sent' ? 'Sent' : 'Process'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
              No broadcasts have been drafted yet.
            </div>
          )}
        </CardContent>
      </Card>

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
