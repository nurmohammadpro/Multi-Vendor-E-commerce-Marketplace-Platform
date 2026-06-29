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

  async getPlans(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          p.id,
          p.code,
          p.name,
          p.price_amount,
          p.billing_cycle,
          p.features_json,
          p.status
        from billing.plans p
        join store.stores s on s.tenant_id = p.tenant_id
        where s.id = $1
          and p.status = 'active'
        order by
          case p.code
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
          p.billing_cycle,
          p.features_json
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

  async changeSubscription(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { planCode: 'basic' | 'standard' | 'pro'; autoRenew: boolean },
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
