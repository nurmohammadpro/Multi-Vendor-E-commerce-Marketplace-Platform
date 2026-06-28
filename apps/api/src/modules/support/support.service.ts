import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class SupportService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getStoreTickets(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          t.id,
          t.ticket_no,
          t.ticket_type,
          t.subject,
          t.status,
          t.priority,
          t.created_at,
          up.full_name as opened_by_name
        from support.tickets t
        left join identity.user_profiles up on up.user_id = t.opened_by
        where t.store_id = $1
        order by t.created_at desc
      `,
      [storeId],
    );

    return { tickets: result.rows };
  }

  async createStoreTicket(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      ticketType: 'support' | 'dispute' | 'billing' | 'technical';
      subject: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      message: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const ticketNo = await this.generateTicketNo(client, storeId);

      const ticketResult = await client.query<{ id: string }>(
        `
          insert into support.tickets (
            id,
            tenant_id,
            store_id,
            ticket_no,
            opened_by,
            ticket_type,
            subject,
            status,
            priority,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2,
            $3,
            $4,
            $5,
            'open',
            $6,
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning *
        `,
        [storeId, ticketNo, userId, payload.ticketType, payload.subject, payload.priority],
      );

      const ticket = ticketResult.rows[0];
      await this.insertTicketMessage(client, ticket.id, userId, payload.message, null);

      await client.query('commit');
      return { ticket };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getStoreTicket(ticketId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    return this.getTicketDetail(ticketId, { storeId });
  }

  async addTicketMessage(
    ticketId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { message: string; attachmentPath?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    await this.ensureStoreTicket(ticketId, storeId);

    const result = await this.insertTicketMessage(this.pool, ticketId, userId, payload.message, payload.attachmentPath ?? null);
    return { message: result };
  }

  async getAdminTickets() {
    const result = await this.pool.query(
      `
        select
          t.id,
          t.ticket_no,
          t.ticket_type,
          t.subject,
          t.status,
          t.priority,
          t.created_at,
          s.name as store_name,
          up.full_name as opened_by_name
        from support.tickets t
        left join store.stores s on s.id = t.store_id
        left join identity.user_profiles up on up.user_id = t.opened_by
        order by
          case t.priority
            when 'urgent' then 1
            when 'high' then 2
            when 'medium' then 3
            else 4
          end,
          t.created_at desc
      `,
    );

    return { tickets: result.rows };
  }

  async updateAdminTicketStatus(
    ticketId: string,
    session: AuthSession | null,
    payload: { status: 'open' | 'in_progress' | 'resolved' | 'closed' },
  ) {
    const userId = this.requireUserId(session);
    const result = await this.pool.query(
      `
        update support.tickets
        set status = $2,
            assigned_to = case when $2 in ('in_progress', 'resolved') then $3 else assigned_to end,
            updated_at = now()
        where id = $1
        returning id, ticket_no, status, assigned_to, updated_at
      `,
      [ticketId, payload.status, userId],
    );

    const ticket = result.rows[0];
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return { ticket };
  }

  async getStoreNotifications(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
  ) {
    this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        select id, channel, template_code, title, body, status, reference_type, reference_id, sent_at, read_at, created_at
        from comms.notifications
        where recipient_user_id = $1
        order by created_at desc
        limit 100
      `,
      [userId],
    );

    return { notifications: result.rows };
  }

  async getAdminNotifications(session: AuthSession | null) {
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        select id, channel, template_code, title, body, status, reference_type, reference_id, sent_at, read_at, created_at
        from comms.notifications
        where recipient_user_id = $1
        order by created_at desc
        limit 100
      `,
      [userId],
    );

    return { notifications: result.rows };
  }

  async createBroadcast(
    session: AuthSession | null,
    payload: {
      audienceType: 'all_stores' | 'selected_stores' | 'admins';
      channel: 'in_app' | 'email' | 'sms';
      title?: string;
      body: string;
      scheduledAt?: string;
    },
  ) {
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        insert into comms.broadcasts (
          id,
          tenant_id,
          created_by,
          audience_type,
          channel,
          title,
          body,
          status,
          scheduled_at,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          $2,
          $1,
          $3,
          $4,
          $5,
          $6,
          case when $7::timestamptz is null then 'draft' else 'scheduled' end,
          $7::timestamptz,
          now(),
          now()
        from identity.users u
        where u.id = $1
        returning id, audience_type, channel, title, status, scheduled_at, created_at
      `,
      [
        userId,
        session?.user.tenantId ?? null,
        payload.audienceType,
        payload.channel,
        payload.title ?? null,
        payload.body,
        payload.scheduledAt ?? null,
      ],
    );

    return { broadcast: result.rows[0] };
  }

  async listBroadcasts(session: AuthSession | null) {
    this.requireUserId(session);

    const result = await this.pool.query(
      `
        select id, audience_type, channel, title, body, status, scheduled_at, created_at, updated_at
        from comms.broadcasts
        order by created_at desc
        limit 100
      `,
    );

    return { broadcasts: result.rows };
  }

  private async getTicketDetail(ticketId: string, scope: { storeId?: string }) {
    const conditions = ['t.id = $1'];
    const values: string[] = [ticketId];

    if (scope.storeId) {
      conditions.push(`t.store_id = $${values.length + 1}`);
      values.push(scope.storeId);
    }

    const ticketResult = await this.pool.query(
      `
        select t.*
        from support.tickets t
        where ${conditions.join(' and ')}
        limit 1
      `,
      values,
    );

    const ticket = ticketResult.rows[0];
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const messagesResult = await this.pool.query(
      `
        select
          tm.id,
          tm.sender_user_id,
          up.full_name as sender_name,
          tm.message_body,
          tm.attachment_path,
          tm.created_at
        from support.ticket_messages tm
        left join identity.user_profiles up on up.user_id = tm.sender_user_id
        where tm.ticket_id = $1
        order by tm.created_at asc
      `,
      [ticketId],
    );

    return {
      ticket,
      messages: messagesResult.rows,
    };
  }

  private async ensureStoreTicket(ticketId: string, storeId: string) {
    const result = await this.pool.query(
      `
        select id
        from support.tickets
        where id = $1
          and store_id = $2
        limit 1
      `,
      [ticketId, storeId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Ticket not found');
    }
  }

  private async insertTicketMessage(
    executor: Pool | PoolClient,
    ticketId: string,
    userId: string,
    message: string,
    attachmentPath: string | null,
  ) {
    const result = await executor.query(
      `
        insert into support.ticket_messages (
          id,
          ticket_id,
          sender_user_id,
          message_body,
          attachment_path,
          created_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now()
        )
        returning id, sender_user_id, message_body, attachment_path, created_at
      `,
      [ticketId, userId, message, attachmentPath],
    );

    return result.rows[0];
  }

  private async generateTicketNo(client: PoolClient, storeId: string) {
    const result = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from support.tickets
        where store_id = $1
      `,
      [storeId],
    );

    const nextNumber = Number(result.rows[0]?.count ?? 0) + 1;
    return `TKT-${String(nextNumber).padStart(6, '0')}`;
  }

  private assertStoreContext(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    if (!authContext || authContext.type !== 'store') {
      throw new ForbiddenException('Store context is required');
    }

    if (headerStoreId && headerStoreId !== authContext.storeId) {
      throw new ForbiddenException('Store header does not match auth context');
    }

    return authContext.storeId;
  }

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    return session.user.id;
  }
}
