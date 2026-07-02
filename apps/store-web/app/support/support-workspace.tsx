'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  neutralButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  sectionPanelStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableActionButtonStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

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

type Pagination = {
  page: number;
  limit: number;
  total: number;
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
  const compact = useCompactLayout();
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [activeTab, setActiveTab] = useState<'new' | 'tickets' | 'conversation'>('tickets');

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({
      ticketType: kind,
      page: String(nextPage),
      limit: String(pagination.limit),
    });
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    const payload = await readJson<{ tickets: Ticket[]; pagination?: Pagination }>(`/api/support/tickets?${params.toString()}`);
    setTickets(payload.tickets ?? []);
    setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.tickets?.length ?? 0 });
    setPage(payload.pagination?.page ?? nextPage);
    if (selectedTicket) {
      const exists = (payload.tickets ?? []).find((ticket) => ticket.id === selectedTicket.ticket.id);
      if (!exists) {
        setSelectedTicket(null);
      }
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

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
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'new' | 'tickets' | 'conversation')}
          tabs={[
            { key: 'tickets', label: kind === 'dispute' ? 'Cases' : 'Tickets' },
            { key: 'new', label: kind === 'dispute' ? 'Open Case' : 'New Ticket' },
            { key: 'conversation', label: 'Conversation' },
          ]}
        />
      ) : null}
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'minmax(320px, 1fr) minmax(360px, 1.1fr)' }}>
        {!compact || activeTab === 'new' ? (
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
            <button onClick={createTicket} style={accentButtonStyle} disabled={loading}>
              {kind === 'dispute' ? 'Create dispute case' : 'Create support ticket'}
            </button>
          </div>
        </article>
        ) : null}

        {!compact || activeTab === 'tickets' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>{kind === 'dispute' ? 'Open cases' : 'Open tickets'}</h3>
          <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} style={fieldStyle} placeholder="Search ticket no, subject, opener" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={fieldStyle}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Apply</button>
          </div>
          {tickets.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Ticket</th>
                    <th style={tableHeaderCellStyle}>Subject</th>
                    <th style={tableHeaderCellStyle}>Priority</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Created</th>
                    <th style={tableHeaderCellStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} style={{ background: selectedTicket?.ticket.id === ticket.id ? 'rgba(241,245,249,0.9)' : '#fff' }}>
                      <td style={tableCellStyle}>{ticket.ticket_no}</td>
                      <td style={tableCellStyle}>{ticket.subject}</td>
                      <td style={tableCellStyle}>{ticket.priority}</td>
                      <td style={tableCellStyle}>{ticket.status}</td>
                      <td style={tableCellStyle}>{new Date(ticket.created_at).toLocaleString()}</td>
                      <td style={tableCellStyle}>
                        <button onClick={() => void loadTicket(ticket.id)} style={tableActionButtonStyle}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>
              {kind === 'dispute' ? 'No dispute cases yet.' : 'No support tickets yet.'}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <span style={tokenMutedStyle}>Page {page} of {totalPages} · {pagination.total} ticket(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void refresh(Math.max(1, page - 1))} style={neutralButtonStyle} disabled={loading || page <= 1}>Previous</button>
              <button onClick={() => void refresh(Math.min(totalPages, page + 1))} style={neutralButtonStyle} disabled={loading || page >= totalPages}>Next</button>
            </div>
          </div>
        </article>
        ) : null}
      </section>

      {(!compact || activeTab === 'conversation') ? (
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
            {selectedTicket.messages.length ? (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Author</th>
                      <th style={tableHeaderCellStyle}>Message</th>
                      <th style={tableHeaderCellStyle}>Attachment</th>
                      <th style={tableHeaderCellStyle}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTicket.messages.map((item) => (
                      <tr key={item.id}>
                        <td style={tableCellStyle}>{item.author_name || 'Store operator'}</td>
                        <td style={{ ...tableCellStyle, whiteSpace: 'pre-wrap' }}>{item.message}</td>
                        <td style={tableCellStyle}>{item.attachment_path || '—'}</td>
                        <td style={tableCellStyle}>{new Date(item.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyStateStyle}>No messages in this thread yet.</div>
            )}
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              style={{ ...fieldStyle, minHeight: 100 }}
              placeholder="Reply to this ticket"
            />
            <button onClick={sendReply} style={accentButtonStyle} disabled={loading}>
              Send reply
            </button>
          </div>
        ) : (
          <div style={emptyStateStyle}>Select a ticket to read the conversation and reply.</div>
        )}
      </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
