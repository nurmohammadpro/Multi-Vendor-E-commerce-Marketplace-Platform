'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type TicketRow = {
  id: string;
  ticket_no: string;
  ticket_type: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  store_name?: string | null;
  opened_by_name?: string | null;
};

type TicketDetail = {
  ticket: TicketRow & {
    store_id?: string | null;
    updated_at?: string | null;
  };
  messages?: Array<{
    id: string;
    sender_user_id?: string | null;
    sender_name?: string | null;
    message_body: string;
    attachment_path?: string | null;
    created_at: string;
  }>;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

const statusOptions: Array<TicketRow['status']> = ['open', 'in_progress', 'resolved', 'closed'];

export function SupportWorkspace() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [message, setMessage] = useState('Support operations are ready.');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketRow['status'] | 'all'>('all');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const refreshTickets = async () => {
    setInitialLoading(true);
    try {
      const payload = await readJson<{ tickets: TicketRow[] }>('/api/support/tickets');
      setTickets(payload.tickets ?? []);
      setSelectedTicketId((current) => current || payload.tickets?.[0]?.id || '');
    } finally {
      setInitialLoading(false);
    }
  };

  const refreshDetail = async (ticketId: string) => {
    if (!ticketId) {
      setDetail(null);
      return;
    }

    const payload = await readJson<TicketDetail>(`/api/support/tickets/${ticketId}`);
    setDetail(payload);
  };

  useEffect(() => {
    void refreshTickets()
      .then(() => setMessage('Live support queue loaded.'))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    void refreshDetail(selectedTicketId).catch((error: Error) => setMessage(error.message));
  }, [selectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesSearch = !searchQuery || 
        ticket.ticket_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.store_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.opened_by_name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [tickets, statusFilter, searchQuery]);

  const counts = useMemo(
    () =>
      tickets.reduce<Record<TicketRow['status'] | 'total', number>>(
        (accumulator, ticket) => {
          accumulator.total += 1;
          accumulator[ticket.status] += 1;
          return accumulator;
        },
        { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 },
      ),
    [tickets],
  );

  const updateStatus = async (ticketId: string, status: TicketRow['status']) => {
    setLoading(true);
    try {
      await readJson(`/api/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refreshTickets();
      await refreshDetail(ticketId);
      setMessage(`Ticket updated to ${status}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicketId || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      await readJson(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyBody.trim() }),
      });
      setReplyBody('');
      await refreshDetail(selectedTicketId);
      setMessage('Reply sent successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <section className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric title="Total" value={counts.total} />
        <Metric title="Open" value={counts.open} />
        <Metric title="In progress" value={counts.in_progress} />
        <Metric title="Resolved" value={counts.resolved} />
        <Metric title="Closed" value={counts.closed} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Ticket queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TicketRow['status'] | 'all')}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            {initialLoading ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Loading the support queue.
              </div>
            ) : filteredTickets.length ? (
              filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${selectedTicketId === ticket.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-accent/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-sm">{ticket.ticket_no}</div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{ticket.priority}</Badge>
                      <Badge variant="outline">{ticket.status}</Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{ticket.subject}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {ticket.store_name || 'Platform'} · {ticket.ticket_type} · {ticket.opened_by_name || 'Unknown'}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No support tickets returned by the backend yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Selected ticket</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {selectedTicket ? (
              <>
                <div>
                  <div className="text-lg font-semibold">{selectedTicket.subject}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="secondary">{selectedTicket.ticket_no}</Badge>
                    <Badge variant="outline">{selectedTicket.ticket_type}</Badge>
                    <Badge variant="outline">{selectedTicket.priority}</Badge>
                    <Badge variant="secondary">{selectedTicket.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedTicket.store_name || 'Platform'} · {selectedTicket.opened_by_name || 'Unknown'} ·{' '}
                    {new Date(selectedTicket.created_at).toLocaleString()}
                  </p>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((status) => (
                    <Button
                      key={status}
                      variant={status === selectedTicket.status ? 'default' : 'outline'}
                      size="sm"
                      disabled={loading}
                      onClick={() => updateStatus(selectedTicket.id, status)}
                    >
                      Mark {status.replace('_', ' ')}
                    </Button>
                  ))}
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium">Conversation</div>
                  <div className="flex flex-col gap-2.5">
                    {detail?.messages?.length ? (
                      detail.messages.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">{entry.sender_name || entry.sender_user_id || 'System'}</div>
                            <div className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</div>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{entry.message_body}</div>
                          {entry.attachment_path ? (
                            <div className="mt-1 text-xs text-muted-foreground">Attachment: {entry.attachment_path}</div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No ticket messages returned for this ticket.
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="mb-2 text-sm font-medium">Admin reply</div>
                  <div className="flex gap-2">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type your reply..."
                      rows={3}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={sendingReply || !replyBody.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sendingReply ? 'Sending...' : 'Send reply'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Select a ticket to inspect the conversation and status controls.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operator notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
