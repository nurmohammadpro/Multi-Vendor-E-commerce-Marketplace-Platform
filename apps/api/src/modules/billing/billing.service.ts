import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class BillingService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  async getAdminPlans(tenantId: string) {
    const result = await this.pool.query(
      `
        select
          p.id,
          p.code,
          p.name,
          p.price_amount,
          p.signup_fee,
          p.billing_cycle,
          p.features_json,
          p.max_users,
          p.max_locations,
          p.is_custom,
          p.status
        from billing.plans p
        where p.tenant_id = $1
        order by
          case when p.is_custom then 1 else 0 end,
          case p.code
            when 'wholesale' then 0
            when 'basic' then 1
            when 'standard' then 2
            when 'pro' then 3
            else 10
          end asc
      `,
      [tenantId],
    );

    return { plans: result.rows };
  }

  async getPlans(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          p.id,
          p.code,
          p.name,
          p.price_amount,
          p.signup_fee,
          p.billing_cycle,
          p.features_json,
          p.max_users,
          p.max_locations,
          p.is_custom,
          p.status
        from billing.plans p
        join store.stores s on s.tenant_id = p.tenant_id
        where s.id = $1
          and p.status = 'active'
        order by
          case p.code
            when 'wholesale' then 0
            when 'basic' then 1
            when 'standard' then 2
            when 'pro' then 3
            else 10
          end asc
      `,
      [storeId],
    );

    return { plans: result.rows };
  }

  async getCurrentSubscription(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          sub.id,
          sub.start_at,
          sub.end_at,
          sub.renewal_at,
          sub.status,
          sub.auto_renew,
          p.code as plan_code,
          p.name as plan_name,
          p.price_amount,
          p.signup_fee,
          p.billing_cycle,
          p.features_json,
          p.max_users,
          p.max_locations,
          p.is_custom
        from billing.subscriptions sub
        join billing.plans p on p.id = sub.plan_id
        where sub.store_id = $1
        order by sub.created_at desc
        limit 1
      `,
      [storeId],
    );

    return {
      subscription: result.rows[0] ?? null,
    };
  }

  async createPlan(tenantId: string, payload: {
    code: string; name: string; priceAmount: number; signupFee: number;
    billingCycle: string; maxUsers: number; maxLocations: number; features: string[];
  }) {
    const result = await this.pool.query(
      `insert into billing.plans (id, tenant_id, code, name, price_amount, signup_fee, billing_cycle, max_users, max_locations, features_json, is_custom, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'active', now(), now())
       on conflict (tenant_id, code) do update set
         name = excluded.name, price_amount = excluded.price_amount, signup_fee = excluded.signup_fee,
         max_users = excluded.max_users, max_locations = excluded.max_locations,
         features_json = excluded.features_json, updated_at = now()
       returning id`,
      [tenantId, payload.code, payload.name, payload.priceAmount, payload.signupFee,
       payload.billingCycle, payload.maxUsers, payload.maxLocations, JSON.stringify(payload.features)],
    );
    return { plan: result.rows[0] };
  }

  async updatePlan(planId: string, tenantId: string, payload: Record<string, unknown>) {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (payload.name !== undefined) { sets.push(`name = $${idx++}`); values.push(payload.name); }
    if (payload.priceAmount !== undefined) { sets.push(`price_amount = $${idx++}`); values.push(payload.priceAmount); }
    if (payload.signupFee !== undefined) { sets.push(`signup_fee = $${idx++}`); values.push(payload.signupFee); }
    if (payload.billingCycle !== undefined) { sets.push(`billing_cycle = $${idx++}`); values.push(payload.billingCycle); }
    if (payload.maxUsers !== undefined) { sets.push(`max_users = $${idx++}`); values.push(payload.maxUsers); }
    if (payload.maxLocations !== undefined) { sets.push(`max_locations = $${idx++}`); values.push(payload.maxLocations); }
    if (payload.features !== undefined) { sets.push(`features_json = $${idx++}`); values.push(JSON.stringify(payload.features)); }
    if (payload.status !== undefined) { sets.push(`status = $${idx++}`); values.push(payload.status); }
    sets.push('updated_at = now()');

    values.push(planId, tenantId);
    const result = await this.pool.query(
      `update billing.plans set ${sets.join(', ')} where id = $${idx++} and tenant_id = $${idx++} returning id`,
      values,
    );
    if (!result.rows[0]) throw new NotFoundException('Plan not found');
    return { success: true };
  }

  async deactivatePlan(planId: string, tenantId: string) {
    const result = await this.pool.query(
      `update billing.plans set status = 'inactive', updated_at = now() where id = $1 and tenant_id = $2 returning id`,
      [planId, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException('Plan not found');
    return { success: true };
  }

  async getPlanLimits(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const planResult = await this.pool.query<{
      max_users: number; max_locations: number; features_json: string;
    }>(
      `select p.max_users, p.max_locations, p.features_json
       from billing.subscriptions sub
       join billing.plans p on p.id = sub.plan_id
       where sub.store_id = $1 and sub.status in ('trial', 'active', 'past_due')
       order by sub.created_at desc limit 1`,
      [storeId],
    );

    const plan = planResult.rows[0];
    if (!plan) return { limits: null, usage: null };

    const usageResult = await this.pool.query<{ active_users: string; total_locations: string }>(
      `select
         (select count(*)::text from access.store_memberships where store_id = $1 and status = 'active') as active_users,
         (select count(*)::text from inventory.locations where store_id = $1 and status = 'active') as total_locations`,
      [storeId],
    );

    const features: string[] = typeof plan.features_json === 'string'
      ? JSON.parse(plan.features_json) : plan.features_json;

    return {
      limits: { maxUsers: plan.max_users, maxLocations: plan.max_locations, features },
      usage: {
        activeUsers: Number(usageResult.rows[0]?.active_users ?? 0),
        totalLocations: Number(usageResult.rows[0]?.total_locations ?? 0),
      },
    };
  }

  async changeSubscription(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { planCode: string; autoRenew: boolean },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const plan = await this.findPlanForStore(client, storeId, payload.planCode);

      await client.query(
        `
          update billing.subscriptions
          set status = 'cancelled',
              end_at = now(),
              updated_at = now()
          where store_id = $1
            and status in ('trial', 'active', 'past_due', 'suspended')
        `,
        [storeId],
      );

      const renewalAt = this.computeRenewalAt(plan.billing_cycle);
      const result = await client.query(
        `
          insert into billing.subscriptions (
            id,
            tenant_id,
            store_id,
            plan_id,
            start_at,
            renewal_at,
            status,
            auto_renew,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2,
            now(),
            $3,
            'active',
            $4,
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning id, store_id, plan_id, start_at, renewal_at, status, auto_renew
        `,
        [storeId, plan.id, renewalAt, payload.autoRenew],
      );

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'subscription.change',
        resourceType: 'subscription',
        resourceId: String(result.rows[0]?.id ?? ''),
        after: {
          planCode: plan.code,
          autoRenew: payload.autoRenew,
          renewalAt,
        },
      });

      return {
        subscription: {
          ...result.rows[0],
          planCode: plan.code,
          planName: plan.name,
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getInvoices(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { status?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            i.id,
            i.invoice_no,
            i.invoice_type,
            i.subtotal_amount,
            i.discount_amount,
            i.tax_amount,
            i.total_amount,
            i.status,
            i.due_at,
            i.issued_at,
            i.paid_at,
            coalesce(sum(case when ip.status = 'paid' then ip.amount else 0 end), 0) as paid_amount,
            count(*) over()::int as total_count
          from billing.invoices i
          left join billing.invoice_payments ip on ip.invoice_id = i.id
          where i.store_id = $1
            and ($2::text is null or i.status = $2::text)
            and (
              $3::text is null
              or i.invoice_no ilike '%' || $3::text || '%'
              or i.invoice_type ilike '%' || $3::text || '%'
            )
          group by i.id
          order by i.created_at desc
          limit $4
          offset $5
        ) invoices
      `,
      [storeId, filters.status ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { invoices: items, pagination: { page, limit, total } };
  }

  async getInvoice(invoiceId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const invoiceResult = await this.pool.query(
      `
        select *
        from billing.invoices
        where id = $1
          and store_id = $2
        limit 1
      `,
      [invoiceId, storeId],
    );

    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const paymentsResult = await this.pool.query(
      `
        select id, payment_method, gateway_provider, amount, reference_no, status, paid_at, created_at
        from billing.invoice_payments
        where invoice_id = $1
        order by created_at asc
      `,
      [invoiceId],
    );

    return {
      invoice,
      payments: paymentsResult.rows,
    };
  }

  async addInvoicePayment(
    invoiceId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      paymentMethod: 'cash' | 'card' | 'mfs' | 'bank_transfer' | 'gateway';
      gatewayProvider?: string;
      amount: number;
      referenceNo?: string;
      status: 'pending' | 'paid' | 'failed' | 'refunded';
      paidAt?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const invoiceResult = await client.query<{
        id: string;
        store_id: string;
        total_amount: string;
        status: string;
      }>(
        `
          select id, store_id, total_amount, status
          from billing.invoices
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [invoiceId, storeId],
      );

      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const currentPaymentsResult = await client.query<{ paid_amount: string }>(
        `
          select coalesce(sum(case when status = 'paid' then amount else 0 end), 0) as paid_amount
          from billing.invoice_payments
          where invoice_id = $1
        `,
        [invoiceId],
      );

      const currentPaidAmount = Number(currentPaymentsResult.rows[0]?.paid_amount ?? 0);
      const totalAmount = Number(invoice.total_amount);
      if (payload.status === 'paid' && currentPaidAmount + payload.amount > totalAmount) {
        throw new ForbiddenException('Payment amount exceeds the remaining invoice balance');
      }

      const paymentResult = await client.query(
        `
          insert into billing.invoice_payments (
            id,
            invoice_id,
            payment_method,
            gateway_provider,
            amount,
            reference_no,
            status,
            paid_at,
            created_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            now()
          )
          returning id, payment_method, amount, status, paid_at, created_at
        `,
        [
          invoiceId,
          payload.paymentMethod,
          payload.gatewayProvider ?? null,
          payload.amount,
          payload.referenceNo ?? null,
          payload.status,
          payload.paidAt ?? new Date().toISOString(),
        ],
      );

      const totalsResult = await client.query<{ paid_amount: string }>(
        `
          select coalesce(sum(case when status = 'paid' then amount else 0 end), 0) as paid_amount
          from billing.invoice_payments
          where invoice_id = $1
        `,
        [invoiceId],
      );

      const paidAmount = Number(totalsResult.rows[0]?.paid_amount ?? 0);
      const nextStatus = paidAmount >= totalAmount ? 'paid' : invoice.status === 'draft' ? 'issued' : invoice.status;

      await client.query(
        `
          update billing.invoices
          set status = $2,
              paid_at = case when $2 = 'paid' then now() else paid_at end,
              updated_at = now()
          where id = $1
        `,
        [invoiceId, nextStatus],
      );

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'invoice.payment.recorded',
        resourceType: 'invoice',
        resourceId: invoiceId,
        after: {
          paymentMethod: payload.paymentMethod,
          amount: payload.amount,
          status: payload.status,
          paidAmount,
          totalAmount,
          nextStatus,
        },
      });

      return {
        payment: paymentResult.rows[0],
        invoice: {
          id: invoiceId,
          status: nextStatus,
          paidAmount,
          totalAmount,
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async hasStoreFeature(storeId: string, feature: string): Promise<boolean> {
    const result = await this.pool.query<{ features_json: unknown }>(
      `select p.features_json
       from billing.subscriptions sub
       join billing.plans p on p.id = sub.plan_id
       where sub.store_id = $1 and sub.status in ('trial', 'active', 'past_due')
       order by sub.created_at desc limit 1`,
      [storeId],
    );
    const row = result.rows[0];
    if (!row) return false;
    const raw = row.features_json;
    const features = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.keys(raw as Record<string, unknown>).filter((k) => Boolean((raw as Record<string, unknown>)[k]))
        : [];
    return features.includes(feature);
  }

  async checkUserLimit(storeId: string): Promise<{ current: number; max: number }> {
    const result = await this.pool.query<{ max_users: number; active_count: string }>(
      `select p.max_users,
         (select count(*)::text from access.store_memberships where store_id = $1 and status = 'active') as active_count
       from billing.subscriptions sub
       join billing.plans p on p.id = sub.plan_id
       where sub.store_id = $1 and sub.status in ('trial', 'active', 'past_due')
       order by sub.created_at desc limit 1`,
      [storeId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('No active subscription');
    const current = Number(row.active_count);
    if (current >= row.max_users) {
      throw new ForbiddenException(
        `User limit reached (${current}/${row.max_users}). Upgrade your plan to add more users.`,
      );
    }
    return { current, max: row.max_users };
  }

  async checkLocationLimit(storeId: string): Promise<{ current: number; max: number }> {
    const result = await this.pool.query<{ max_locations: number; active_count: string }>(
      `select p.max_locations,
         (select count(*)::text from inventory.locations where store_id = $1 and status = 'active') as active_count
       from billing.subscriptions sub
       join billing.plans p on p.id = sub.plan_id
       where sub.store_id = $1 and sub.status in ('trial', 'active', 'past_due')
       order by sub.created_at desc limit 1`,
      [storeId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('No active subscription');
    const current = Number(row.active_count);
    if (current >= row.max_locations) {
      throw new ForbiddenException(
        `Location limit reached (${current}/${row.max_locations}). Upgrade your plan to add more locations.`,
      );
    }
    return { current, max: row.max_locations };
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

  private async findPlanForStore(client: PoolClient, storeId: string, planCode: string) {
    const result = await client.query<{
      id: string;
      code: string;
      name: string;
      billing_cycle: 'monthly' | 'yearly';
    }>(
      `
        select p.id, p.code, p.name, p.billing_cycle
        from billing.plans p
        join store.stores s on s.tenant_id = p.tenant_id
        where s.id = $1
          and p.code = $2
          and p.status = 'active'
        limit 1
      `,
      [storeId, planCode],
    );

    const plan = result.rows[0];
    if (!plan) {
      throw new NotFoundException(`Plan ${planCode} not found`);
    }

    return plan;
  }

  private computeRenewalAt(billingCycle: 'monthly' | 'yearly') {
    const renewalAt = new Date();
    if (billingCycle === 'yearly') {
      renewalAt.setFullYear(renewalAt.getFullYear() + 1);
    } else {
      renewalAt.setMonth(renewalAt.getMonth() + 1);
    }
    return renewalAt.toISOString();
  }
}
