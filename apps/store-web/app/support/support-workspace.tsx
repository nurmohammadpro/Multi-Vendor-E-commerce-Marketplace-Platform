'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type TicketType = 'support' | 'dispute';

type Ticket = {
  id: string;
  ticket_no: string;
  ticket_type: TicketType | 'billing' | 'technical';
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  opened_by_name?: string | null;
};

type TicketMessage = {
  id: string;
  message: string;
  created_at: string;
  author_name?: string | null;
  attachment_path?: string | null;
};

type TicketDetail = {
  ticket: Ticket;
  messages: TicketMessage[];
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function SupportWorkspace({
  canUseSupport,
  kind,
}: {
  canUseSupport: boolean;
  kind: TicketType;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [message, setMessage] = useState(kind === 'dispute' ? 'Dispute workspace is ready.' : 'Support workspace is ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    priority: 'medium',
    message: '',
  });
  const [reply, setReply] = useState('');

  const refresh = async () => {
    const payload = await readJson<{ tickets: Ticket[] }>('/api/support/tickets');
    const filtered = (payload.tickets ?? []).filter((ticket) => ticket.ticket_type === kind);
    setTickets(filtered);
    if (selectedTicket) {
      const exists = filtered.find((ticket) => ticket.id === selectedTicket.ticket.id);
      if (!exists) {
        setSelectedTicket(null);
      }
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const loadTicket = async (ticketId: string) => {
    try {
      const payload = await readJson<TicketDetail>(`/api/support/tickets/${ticketId}`);
      setSelectedTicket(payload);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const createTicket = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      setMessage('Subject and message are required.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketType: kind,
          subject: form.subject.trim(),
          priority: form.priority,
          message: form.message.trim(),
        }),
      });
      setForm({ subject: '', priority: 'medium', message: '' });
      await refresh();
      setMessage(kind === 'dispute' ? 'Dispute case created.' : 'Support ticket created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !reply.trim()) {
      setMessage('Select a ticket and enter a reply first.');
      return;
    }

    setLoading(true);
    try {
      await readJson(`/api/support/tickets/${selectedTicket.ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      });
      setReply('');
      await loadTicket(selectedTicket.ticket.id);
      await refresh();
      setMessage('Reply sent.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canUseSupport) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Access limited</h3>
          <p style={tokenMutedStyle}>This module is not available for the current role or subscription.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.1fr)', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>{kind === 'dispute' ? 'Open dispute case' : 'Open support ticket'}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              style={fieldStyle}
              placeholder={kind === 'dispute' ? 'Refund, return, or customer issue summary' : 'Operational issue summary'}
            />
            <select
              value={form.priority}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              style={fieldStyle}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              style={{ ...fieldStyle, minHeight: 120 }}
              placeholder={kind === 'dispute' ? 'Describe the refund, returned items, and customer context.' : 'Describe the support issue clearly.'}
            />
            <button onClick={createTicket} style={secondaryButtonStyle} disabled={loading}>
              {kind === 'dispute' ? 'Create dispute case' : 'Create support ticket'}
            </button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>{kind === 'dispute' ? 'Open cases' : 'Open tickets'}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {tickets.length ? (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => void loadTicket(ticket.id)}
                  style={{
                    ...surfaceCardStyle,
                    padding: 14,
                    textAlign: 'left',
                    borderColor: selectedTicket?.ticket.id === ticket.id ? '#2563eb' : 'rgba(148, 163, 184, 0.22)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{ticket.subject}</div>
                  <div style={{ color: '#475569' }}>
                    {ticket.ticket_no} · {ticket.priority} · {ticket.status}
                  </div>
                  <div style={{ color: '#64748b' }}>{new Date(ticket.created_at).toLocaleString()}</div>
                </button>
              ))
            ) : (
              <div style={emptyStateStyle}>
                {kind === 'dispute' ? 'No dispute cases yet.' : 'No support tickets yet.'}
              </div>
            )}
          </div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Conversation</h3>
        {selectedTicket ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{selectedTicket.ticket.subject}</div>
              <div style={{ color: '#64748b' }}>
                {selectedTicket.ticket.ticket_no} · {selectedTicket.ticket.priority} · {selectedTicket.ticket.status}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {selectedTicket.messages.length ? (
                selectedTicket.messages.map((item) => (
                  <article key={item.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                    <div style={{ fontWeight: 600 }}>{item.author_name || 'Store operator'}</div>
                    <div style={{ color: '#475569', whiteSpace: 'pre-wrap' }}>{item.message}</div>
                    <div style={{ color: '#64748b' }}>{new Date(item.created_at).toLocaleString()}</div>
                  </article>
                ))
              ) : (
                <div style={emptyStateStyle}>No messages in this thread yet.</div>
              )}
            </div>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              style={{ ...fieldStyle, minHeight: 100 }}
              placeholder="Reply to this ticket"
            />
            <button onClick={sendReply} style={secondaryButtonStyle} disabled={loading}>
              Send reply
            </button>
          </div>
        ) : (
          <div style={emptyStateStyle}>Select a ticket to read the conversation and reply.</div>
        )}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
