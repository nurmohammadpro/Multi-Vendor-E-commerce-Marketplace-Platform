import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class ReportingService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getStoreSalesReport(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const [summary, recentSales] = await Promise.all([
      this.pool.query(
        `
          select
            coalesce(sum(total_amount), 0) as total_sales_amount,
            count(*)::int as total_orders_count,
            coalesce(sum(discount_amount), 0) as total_discount_amount,
            coalesce(sum(tax_amount), 0) as total_tax_amount,
            count(*) filter (where payment_status = 'due')::int as due_sales_count,
            coalesce(sum(total_amount) filter (where payment_status = 'due'), 0) as due_sales_amount
          from sales.sales
          where store_id = $1
            and status = 'completed'
            and created_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query(
        `
          select
            sale_no,
            total_amount,
            payment_status,
            fulfillment_status,
            customer_name,
            customer_phone,
            customer_email,
            customer_shop_name,
            customer_address,
            due_date,
            created_at
          from sales.sales
          where store_id = $1
          order by created_at desc
          limit 20
        `,
        [storeId],
      ),
    ]);

    const dueSales = await this.pool.query(
      `
        select
          sale_no,
          total_amount,
          customer_name,
          customer_phone,
          customer_email,
          customer_shop_name,
          customer_address,
          due_date,
          created_at
        from sales.sales
        where store_id = $1
          and status = 'completed'
          and payment_status = 'due'
        order by created_at desc
        limit 20
      `,
      [storeId],
    );

    return {
      summary: summary.rows[0],
      recentSales: recentSales.rows,
      dueSales: dueSales.rows,
    };
  }

  async getStoreInventoryReport(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const [summary, balances] = await Promise.all([
      this.pool.query(
        `
          select
            count(distinct b.sku_id)::int as sku_count,
            coalesce(sum(b.on_hand_qty), 0) as total_on_hand_qty,
            coalesce(sum(b.available_qty), 0) as total_available_qty
          from inventory.balances b
          join inventory.locations l on l.id = b.location_id
          where l.store_id = $1
        `,
        [storeId],
      ),
      this.pool.query(
        `
          select
            l.name as location_name,
            sk.sku_code,
            p.name as product_name,
            b.on_hand_qty,
            b.available_qty,
            b.updated_at
          from inventory.balances b
          join inventory.locations l on l.id = b.location_id
          join catalog.skus sk on sk.id = b.sku_id
          join catalog.products p on p.id = sk.product_id
          where l.store_id = $1
          order by b.updated_at desc
          limit 100
        `,
        [storeId],
      ),
    ]);

    return {
      summary: summary.rows[0],
      balances: balances.rows,
    };
  }

  async createExportJob(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { exportType: 'sales' | 'inventory' | 'billing' | 'support'; filters: Record<string, unknown> },
  ) {
    this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        insert into reporting.export_jobs (
          id,
          tenant_id,
          requested_by,
          export_type,
          filter_json,
          status,
          created_at
        )
        select
          gen_random_uuid(),
          $2,
          $1,
          $3,
          $4::jsonb,
          'queued',
          now()
        from identity.users u
        where u.id = $1
        returning id, export_type, status, created_at
      `,
      [userId, session?.user.tenantId ?? null, payload.exportType, JSON.stringify(payload.filters)],
    );

    return { exportJob: result.rows[0] };
  }

  async getPlatformOverview() {
    const [stores, sales, tickets, subscriptions] = await Promise.all([
      this.pool.query(
        `
          select
            count(*)::int as total_stores,
            count(*) filter (where status = 'active')::int as active_stores
          from store.stores
        `,
      ),
      this.pool.query(
        `
          select
            coalesce(sum(total_amount), 0) as gross_sales_amount,
            count(*)::int as completed_sales_count
          from sales.sales
          where status = 'completed'
        `,
      ),
      this.pool.query(
        `
          select
            count(*)::int as total_tickets,
            count(*) filter (where status in ('open', 'in_progress'))::int as open_tickets
          from support.tickets
        `,
      ),
      this.pool.query(
        `
          select
            count(*)::int as total_subscriptions,
            count(*) filter (where status = 'active')::int as active_subscriptions
          from billing.subscriptions
        `,
      ),
    ]);

    return {
      stores: stores.rows[0],
      sales: sales.rows[0],
      support: tickets.rows[0],
      subscriptions: subscriptions.rows[0],
    };
  }

  async getPlatformPayments() {
    const [invoices, payments] = await Promise.all([
      this.pool.query(
        `
          select
            status,
            count(*)::int as invoice_count,
            coalesce(sum(total_amount), 0) as total_amount
          from billing.invoices
          group by status
          order by status asc
        `,
      ),
      this.pool.query(
        `
          select
            payment_method,
            status,
            count(*)::int as payment_count,
            coalesce(sum(amount), 0) as total_amount
          from billing.invoice_payments
          group by payment_method, status
          order by payment_method asc, status asc
        `,
      ),
    ]);

    return {
      invoices: invoices.rows,
      payments: payments.rows,
    };
  }

  async getAuditLogs() {
    const result = await this.pool.query(
      `
        select
          id,
          actor_user_id,
          actor_type,
          store_id,
          action_code,
          resource_type,
          resource_id,
          before_json,
          after_json,
          ip_address,
          user_agent,
          created_at
        from audit.logs
        order by created_at desc
        limit 200
      `,
    );

    return { logs: result.rows };
  }

  async getStoreAuditLogs(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: {
      search?: string;
      actionCode?: string;
      resourceType?: string;
      limit: number;
      page: number;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const offset = (filters.page - 1) * filters.limit;
    const search = filters.search?.trim() || null;
    const actionCode = filters.actionCode?.trim() || null;
    const resourceType = filters.resourceType?.trim() || null;

    const [rowsResult, totalResult] = await Promise.all([
      this.pool.query(
        `
          select
            id,
            actor_user_id,
            actor_type,
            store_id,
            action_code,
            resource_type,
            resource_id,
            before_json,
            after_json,
            created_at
          from audit.logs
          where store_id = $1
            and ($2::text is null or action_code = $2::text)
            and ($3::text is null or resource_type = $3::text)
            and (
              $4::text is null
              or action_code ilike '%' || $4::text || '%'
              or resource_type ilike '%' || $4::text || '%'
              or coalesce(resource_id::text, '') ilike '%' || $4::text || '%'
            )
          order by created_at desc
          limit $5
          offset $6
        `,
        [storeId, actionCode, resourceType, search, filters.limit, offset],
      ),
      this.pool.query<{ total: string }>(
        `
          select count(*)::text as total
          from audit.logs
          where store_id = $1
            and ($2::text is null or action_code = $2::text)
            and ($3::text is null or resource_type = $3::text)
            and (
              $4::text is null
              or action_code ilike '%' || $4::text || '%'
              or resource_type ilike '%' || $4::text || '%'
              or coalesce(resource_id::text, '') ilike '%' || $4::text || '%'
            )
        `,
        [storeId, actionCode, resourceType, search],
      ),
    ]);

    return {
      logs: rowsResult.rows,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: Number(totalResult.rows[0]?.total ?? 0),
      },
    };
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
