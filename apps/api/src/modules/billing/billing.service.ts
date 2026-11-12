import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';
import { computeRenewalAt, computeTrialEnd, DEFAULT_TRIAL_DAYS, type BillingCycle } from './billing-cycle.js';

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
          p.trial_days,
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
          p.trial_days,
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
          p.trial_days,
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
    trialDays: number;
  }) {
    const result = await this.pool.query(
      `insert into billing.plans (id, tenant_id, code, name, price_amount, signup_fee, billing_cycle, max_users, max_locations, trial_days, features_json, is_custom, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 'active', now(), now())
       on conflict (tenant_id, code) do update set
         name = excluded.name, price_amount = excluded.price_amount, signup_fee = excluded.signup_fee,
         max_users = excluded.max_users, max_locations = excluded.max_locations,
         trial_days = excluded.trial_days,
         features_json = excluded.features_json, updated_at = now()
       returning id`,
      [tenantId, payload.code, payload.name, payload.priceAmount, payload.signupFee,
       payload.billingCycle, payload.maxUsers, payload.maxLocations, payload.trialDays,
       JSON.stringify(payload.features)],
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
    if (payload.trialDays !== undefined) { sets.push(`trial_days = $${idx++}`); values.push(payload.trialDays); }
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

  async adminChangeStorePlan(
    tenantId: string,
    storeId: string,
    session: AuthSession | null,
    payload: { planCode: string; autoRenew: boolean },
  ) {
    const userId = this.requireUserId(session);

    const storeResult = await this.pool.query<{ id: string; name: string }>(
      'select id, name from store.stores where id = $1 and tenant_id = $2 limit 1',
      [storeId, tenantId],
    );
    if (!storeResult.rows[0]) throw new NotFoundException('Store not found');

    const planResult = await this.pool.query<{ id: string; code: string; name: string; billing_cycle: 'monthly' | 'yearly' }>(
      "select id, code, name, billing_cycle from billing.plans where tenant_id = $1 and code = $2 and status = 'active' limit 1",
      [tenantId, payload.planCode],
    );
    const plan = planResult.rows[0];
    if (!plan) throw new NotFoundException(`Plan '${payload.planCode}' not found`);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

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
          values (
            gen_random_uuid(), $1, $2, $3, now(), $4, 'active', $5, now(), now()
          )
          returning id, store_id, plan_id, start_at, renewal_at, status, auto_renew
        `,
        [tenantId, storeId, plan.id, renewalAt, payload.autoRenew],
      );

      await client.query('commit');
      await this.auditService.recordUserAction({
        tenantId,
        actorUserId: userId,
        storeId,
        actionCode: 'platform.subscription.change',
        resourceType: 'subscription',
        resourceId: String(result.rows[0]?.id ?? ''),
        after: {
          storeName: storeResult.rows[0].name,
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

  // ── Manual renewal requests (BanglaQR) ───────────────────────────────
  //
  // The tenant pays the platform by scanning our Bank Asia BanglaQR merchant
  // code and then hands us the sender number so the payment can be matched.
  // The request stays pending until an admin approves it; approval starts the
  // paid period on the plan's own billing cycle and records the money as a
  // settled invoice.

  async getRenewalRequests(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select
          r.id,
          r.store_id,
          r.plan_code,
          r.billing_cycle,
          r.amount,
          r.payment_method,
          r.sender_number,
          r.transaction_id,
          r.note,
          r.status,
          r.decision_note,
          r.created_at,
          r.decided_at,
          p.name as plan_name
        from billing.renewal_requests r
        left join billing.plans p on p.id = r.plan_id
        where r.store_id = $1
        order by r.created_at desc
        limit 50
      `,
      [storeId],
    );

    return { requests: result.rows };
  }

  async createRenewalRequest(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      paymentMethod: 'banglaqr' | 'bkash' | 'bank_transfer' | 'cash' | 'other';
      senderNumber: string;
      transactionId?: string;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const senderNumber = String(payload.senderNumber ?? '').trim();
    if (senderNumber.length < 4) {
      throw new BadRequestException('Sender number is required so the payment can be matched');
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const planResult = await client.query<{
        subscription_id: string;
        tenant_id: string;
        plan_id: string;
        plan_code: string;
        plan_name: string;
        billing_cycle: BillingCycle;
        price_amount: string;
      }>(
        `
          select
            sub.id as subscription_id,
            s.tenant_id,
            p.id as plan_id,
            p.code as plan_code,
            p.name as plan_name,
            p.billing_cycle,
            p.price_amount
          from billing.subscriptions sub
          join billing.plans p on p.id = sub.plan_id
          join store.stores s on s.id = sub.store_id
          where sub.store_id = $1
            and sub.status in ('trial', 'active', 'past_due')
          order by sub.created_at desc
          limit 1
        `,
        [storeId],
      );
      const plan = planResult.rows[0];
      if (!plan) {
        throw new NotFoundException('No active subscription found for this store');
      }

      const pending = await client.query(
        `select id from billing.renewal_requests where store_id = $1 and status = 'pending' limit 1`,
        [storeId],
      );
      if (pending.rows[0]) {
        throw new BadRequestException('A renewal request is already awaiting review');
      }

      const amount = Number(plan.price_amount ?? 0);
      const result = await client.query(
        `
          insert into billing.renewal_requests (
            tenant_id, store_id, subscription_id, plan_id, plan_code, billing_cycle,
            amount, payment_method, sender_number, transaction_id, note,
            status, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            'pending', now(), now()
          )
          returning id, store_id, plan_code, billing_cycle, amount, payment_method,
                    sender_number, transaction_id, note, status, created_at
        `,
        [
          plan.tenant_id,
          storeId,
          plan.subscription_id,
          plan.plan_id,
          plan.plan_code,
          plan.billing_cycle,
          amount,
          payload.paymentMethod,
          senderNumber,
          payload.transactionId?.trim() || null,
          payload.note?.trim() || null,
        ],
      );

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'subscription.renewal.request',
        resourceType: 'renewal_request',
        resourceId: String(result.rows[0]?.id ?? ''),
        after: {
          planCode: plan.plan_code,
          billingCycle: plan.billing_cycle,
          amount,
          paymentMethod: payload.paymentMethod,
          senderNumber,
        },
      });

      return { request: { ...result.rows[0], plan_name: plan.plan_name } };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getAdminRenewalRequests(tenantId: string, status?: string) {
    const filtered = status && status !== 'all' ? status : null;
    const result = await this.pool.query(
      `
        select
          r.id,
          r.store_id,
          r.plan_code,
          r.billing_cycle,
          r.amount,
          r.payment_method,
          r.sender_number,
          r.transaction_id,
          r.note,
          r.status,
          r.decision_note,
          r.created_at,
          r.decided_at,
          s.name as store_name,
          p.name as plan_name
        from billing.renewal_requests r
        join store.stores s on s.id = r.store_id
        left join billing.plans p on p.id = r.plan_id
        where r.tenant_id = $1
          and ($2::text is null or r.status = $2)
        order by
          case when r.status = 'pending' then 0 else 1 end,
          r.created_at desc
        limit 200
      `,
      [tenantId, filtered],
    );

    return { requests: result.rows };
  }

  async approveRenewalRequest(
    tenantId: string,
    requestId: string,
    session: AuthSession | null,
    note?: string,
  ) {
    const userId = this.requireUserId(session);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const requestResult = await client.query<{
        id: string;
        store_id: string;
        subscription_id: string | null;
        plan_id: string | null;
        plan_code: string;
        billing_cycle: BillingCycle;
        amount: string;
        payment_method: string;
        sender_number: string;
        transaction_id: string | null;
        status: string;
      }>(
        `
          select
            id, store_id, subscription_id, plan_id, plan_code, billing_cycle,
            amount, payment_method, sender_number, transaction_id, status
          from billing.renewal_requests
          where id = $1 and tenant_id = $2
          limit 1
          for update
        `,
        [requestId, tenantId],
      );
      const request = requestResult.rows[0];
      if (!request) throw new NotFoundException('Renewal request not found');
      if (request.status !== 'pending') {
        throw new BadRequestException(`Renewal request is already ${request.status}`);
      }

      await client.query(
        `
          update billing.subscriptions
          set status = 'cancelled',
              end_at = now(),
              updated_at = now()
          where store_id = $1
            and status in ('trial', 'active', 'past_due', 'suspended')
        `,
        [request.store_id],
      );

      const renewalAt = computeRenewalAt(request.billing_cycle);
      const subscriptionResult = await client.query(
        `
          insert into billing.subscriptions (
            id, tenant_id, store_id, plan_id,
            start_at, renewal_at, status, auto_renew, created_at, updated_at
          )
          values (
            gen_random_uuid(), $1, $2, $3,
            now(), $4, 'active', true, now(), now()
          )
          returning id, store_id, plan_id, start_at, renewal_at, status, auto_renew
        `,
        [tenantId, request.store_id, request.plan_id, renewalAt],
      );
      const subscription = subscriptionResult.rows[0];

      const amount = Number(request.amount ?? 0);
      const invoiceResult = await client.query<{ id: string }>(
        `
          insert into billing.invoices (
            tenant_id, store_id, subscription_id, invoice_no, invoice_type,
            subtotal_amount, discount_amount, tax_amount, total_amount,
            status, issued_at, paid_at, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, 'subscription',
            $5, 0, 0, $5,
            'paid', now(), now(), now(), now()
          )
          returning id
        `,
        [
          tenantId,
          request.store_id,
          subscription?.id ?? null,
          `SUB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          amount,
        ],
      );

      await client.query(
        `
          insert into billing.invoice_payments (
            invoice_id, payment_method, amount, reference_no, status, paid_at, created_at
          )
          values ($1, $2, $3, $4, 'paid', now(), now())
        `,
        [
          invoiceResult.rows[0].id,
          request.payment_method,
          amount,
          request.transaction_id || request.sender_number,
        ],
      );

      await client.query(
        `update store.stores set subscription_status = 'active', updated_at = now() where id = $1`,
        [request.store_id],
      );

      const decided = await client.query(
        `
          update billing.renewal_requests
          set status = 'approved',
              decided_by = $2,
              decided_at = now(),
              decision_note = $3,
              updated_at = now()
          where id = $1
          returning id, store_id, plan_code, billing_cycle, amount, payment_method,
                    sender_number, transaction_id, note, status, decision_note, created_at, decided_at
        `,
        [requestId, userId, note?.trim() || null],
      );

      await client.query('commit');
      await this.auditService.recordUserAction({
        tenantId,
        actorUserId: userId,
        storeId: request.store_id,
        actionCode: 'platform.subscription.renewal.approve',
        resourceType: 'renewal_request',
        resourceId: requestId,
        after: {
          planCode: request.plan_code,
          billingCycle: request.billing_cycle,
          amount,
          renewalAt,
          senderNumber: request.sender_number,
        },
      });

      return { request: decided.rows[0], subscription };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectRenewalRequest(
    tenantId: string,
    requestId: string,
    session: AuthSession | null,
    note?: string,
  ) {
    const userId = this.requireUserId(session);

    const result = await this.pool.query<{
      id: string;
      store_id: string;
      plan_code: string;
      status: string;
      decision_note: string | null;
    }>(
      `
        update billing.renewal_requests
        set status = 'rejected',
            decided_by = $2,
            decided_at = now(),
            decision_note = $3,
            updated_at = now()
        where id = $1
          and tenant_id = $4
          and status = 'pending'
        returning id, store_id, plan_code, billing_cycle, amount, payment_method,
                  sender_number, transaction_id, note, status, decision_note, created_at, decided_at
      `,
      [requestId, userId, note?.trim() || null, tenantId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Pending renewal request not found');
    }

    await this.auditService.recordUserAction({
      tenantId,
      actorUserId: userId,
      storeId: result.rows[0].store_id,
      actionCode: 'platform.subscription.renewal.reject',
      resourceType: 'renewal_request',
      resourceId: requestId,
      after: { note: note?.trim() || null },
    });

    return { request: result.rows[0] };
  }

  private computeRenewalAt(billingCycle: BillingCycle) {
    return computeRenewalAt(billingCycle);
  }
}
