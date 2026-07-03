import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE_POOL } from '../database/database.constants.js';
import { ProviderFactory } from './providers/provider.factory.js';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  // ── Gateway CRUD ────────────────────────────────────────────────

  async listGateways(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query<{
      id: string; provider_code: string; display_name: string;
      credentials_ref: string; status: string; created_at: string;
    }>(
      `select id, provider_code, display_name, credentials_ref, status, created_at, updated_at
       from integration.payment_gateways where store_id = $1 order by created_at asc`,
      [storeId],
    );
    return { gateways: result.rows };
  }

  async createGateway(
    headerStoreId: string | undefined, authContext: StoreAuthContext | null,
    payload: { providerCode: string; displayName: string; credentialsRef: string; status: 'active' | 'inactive' },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query<{
      id: string; provider_code: string; display_name: string;
      credentials_ref: string; status: string; updated_at: string;
    }>(
      `insert into integration.payment_gateways (
        id, tenant_id, store_id, provider_code, display_name, credentials_ref, status, created_at, updated_at
      ) select gen_random_uuid(), s.tenant_id, s.id, $2, $3, $4, $5, now(), now()
      from store.stores s where s.id = $1
      returning id, provider_code, display_name, credentials_ref, status, created_at`,
      [storeId, payload.providerCode, payload.displayName, payload.credentialsRef, payload.status],
    );
    const gateway = result.rows[0];
    const t = await this.pool.query<{ tenant_id: string }>(`select tenant_id from store.stores where id = $1 limit 1`, [storeId]);
    await this.auditService.recordUserAction({ tenantId: t.rows[0]?.tenant_id ?? '', actorUserId: null, storeId, actionCode: 'payment_gateway.create', resourceType: 'payment_gateway', resourceId: gateway.id, after: gateway });
    return { gateway };
  }

  async updateGateway(
    gatewayId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null,
    payload: { displayName?: string; credentialsRef?: string; status?: 'active' | 'inactive' },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `update integration.payment_gateways set display_name = coalesce($3, display_name), credentials_ref = coalesce($4, credentials_ref), status = coalesce($5, status), updated_at = now()
       where id = $1 and store_id = $2 returning id, provider_code, display_name, credentials_ref, status, updated_at`,
      [gatewayId, storeId, payload.displayName ?? null, payload.credentialsRef ?? null, payload.status ?? null],
    );
    const gateway = result.rows[0];
    if (!gateway) throw new NotFoundException('Payment gateway not found');
    const t = await this.pool.query<{ tenant_id: string }>(`select tenant_id from store.stores where id = $1 limit 1`, [storeId]);
    await this.auditService.recordUserAction({ tenantId: t.rows[0]?.tenant_id ?? '', actorUserId: null, storeId, actionCode: 'payment_gateway.update', resourceType: 'payment_gateway', resourceId: gatewayId, after: gateway });
    return { gateway };
  }

  // ── Payment Processing ──────────────────────────────────────────

  async processPayment(gatewayId: string, storeId: string, input: {
    amount: number; orderReference: string; customerName?: string; customerPhone?: string; customerEmail?: string;
  }) {
    const gateway = await this.fetchGateway(gatewayId, storeId);
    const provider = ProviderFactory.getProvider(gateway.provider_code);
    const creds = this.parseCredentials(gateway.credentials_ref);
    const result = await provider.initiatePayment(creds, {
      gatewayId, storeId, amount: input.amount, currency: 'BDT', orderReference: input.orderReference,
      customerName: input.customerName, customerPhone: input.customerPhone, customerEmail: input.customerEmail,
    });
    await this.persistTx(gateway, input.amount, input.orderReference, result, input);
    await this.emitOutbox(gateway.tenant_id, result.transactionRef, 'payment.initiated');
    return { transactionRef: result.transactionRef, status: result.status, redirectUrl: result.redirectUrl };
  }

  async processPaymentInTx(client: PoolClient, gatewayId: string, storeId: string, input: {
    amount: number; orderReference: string; customerName?: string; customerPhone?: string; customerEmail?: string;
  }) {
    const gateway = await this.fetchGateway(gatewayId, storeId);
    const provider = ProviderFactory.getProvider(gateway.provider_code);
    const creds = this.parseCredentials(gateway.credentials_ref);
    const result = await provider.initiatePayment(creds, {
      gatewayId, storeId, amount: input.amount, currency: 'BDT', orderReference: input.orderReference,
      customerName: input.customerName, customerPhone: input.customerPhone, customerEmail: input.customerEmail,
    });
    await this.persistTxInClient(client, gateway, input.amount, input.orderReference, result, input);
    await this.emitOutboxInClient(client, gateway.tenant_id, result.transactionRef, 'payment.initiated');
    return { transactionRef: result.transactionRef, status: result.status, redirectUrl: result.redirectUrl };
  }

  async handleWebhook(providerCode: string, body: Record<string, unknown>, signature: string) {
    const provider = ProviderFactory.getProvider(providerCode);
    const pTxnId = body.paymentID || body.tran_id || body.paymentReferenceId || body.transactionId;
    if (!pTxnId) return { acknowledged: false, reason: 'Missing provider transaction ID' };

    const txnResult = await this.pool.query<{ id: string; gateway_id: string; credentials_ref: string; status: string }>(
      `select pt.id, pt.gateway_id, pg.credentials_ref, pt.status
       from integration.payment_transactions pt join integration.payment_gateways pg on pg.id = pt.gateway_id
       where pt.provider_code = $1 and pt.provider_transaction_id = $2 order by pt.created_at desc limit 1`,
      [providerCode, pTxnId],
    );
    const txn = txnResult.rows[0];
    if (!txn) return { acknowledged: false, reason: 'Unknown transaction' };

    const creds = this.parseCredentials(txn.credentials_ref);
    if (!provider.validateWebhookSignature(body, signature, creds)) return { acknowledged: false, reason: 'Invalid signature' };

    const statusResult = await provider.queryPaymentStatus(creds, String(pTxnId));
    if (statusResult.status === 'completed') {
      await this.pool.query(
        `update integration.payment_transactions set status = 'completed', completed_at = now(), provider_raw_response = $2, updated_at = now() where id = $1`,
        [txn.id, JSON.stringify(statusResult.rawResponse)],
      );
    }
    return { acknowledged: true, status: statusResult.status };
  }

  async queryPaymentStatus(gatewayId: string, transactionRef: string) {
    const txnResult = await this.pool.query<{ provider_transaction_id: string; provider_code: string; credentials_ref: string }>(
      `select pt.provider_transaction_id, pt.provider_code, pg.credentials_ref
       from integration.payment_transactions pt join integration.payment_gateways pg on pg.id = pt.gateway_id
       where pt.transaction_ref = $1`, [transactionRef],
    );
    const txn = txnResult.rows[0];
    if (!txn) throw new NotFoundException('Transaction not found');
    const provider = ProviderFactory.getProvider(txn.provider_code);
    const creds = this.parseCredentials(txn.credentials_ref);
    const result = await provider.queryPaymentStatus(creds, txn.provider_transaction_id || '');
    if (result.status === 'completed') {
      await this.pool.query(
        `update integration.payment_transactions set status = 'completed', completed_at = now(), provider_raw_response = $2, updated_at = now() where transaction_ref = $1`,
        [transactionRef, JSON.stringify(result.rawResponse)],
      );
    }
    return result;
  }

  async processRefund(gatewayId: string, transactionRef: string, amount: number, reason?: string) {
    const txnResult = await this.pool.query<{
      id: string; provider_transaction_id: string; provider_code: string; credentials_ref: string; amount: number; status: string;
    }>(
      `select pt.id, pt.provider_transaction_id, pt.provider_code, pg.credentials_ref, pt.amount, pt.status
       from integration.payment_transactions pt join integration.payment_gateways pg on pg.id = pt.gateway_id
       where pt.transaction_ref = $1`, [transactionRef],
    );
    const txn = txnResult.rows[0];
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.status !== 'completed') throw new ForbiddenException('Only completed transactions can be refunded');
    const provider = ProviderFactory.getProvider(txn.provider_code);
    const creds = this.parseCredentials(txn.credentials_ref);
    const result = await provider.processRefund(creds, txn.provider_transaction_id || '', amount, reason);
    if (result.status === 'completed') {
      await this.pool.query(
        `update integration.payment_transactions set status = 'refunded', refunded_at = now(), refund_amount = $2, updated_at = now() where id = $1`,
        [txn.id, amount],
      );
    }
    return result;
  }

  async listTransactions(storeId: string, filters: { status?: string; limit?: number; page?: number }) {
    const limit = Math.min(filters.limit || 20, 100);
    const page = Math.max(filters.page || 1, 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['store_id = $1'];
    const params: unknown[] = [storeId];
    let pi = 2;
    if (filters.status) { conditions.push(`status = $${pi++}`); params.push(filters.status); }
    const wc = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const count = await this.pool.query<{ total: string }>(`select count(*) as total from integration.payment_transactions ${wc}`, params);
    const result = await this.pool.query(
      `select * from integration.payment_transactions ${wc} order by created_at desc limit $${pi} offset $${pi + 1}`,
      [...params, limit, offset],
    );
    return { transactions: result.rows, pagination: { page, limit, total: parseInt(count.rows[0]?.total || '0', 10) } };
  }

  async listProviders() { return { providers: ProviderFactory.listProviders() }; }

  // ── Private helpers ─────────────────────────────────────────────

  private async fetchGateway(gatewayId: string, storeId: string) {
    const result = await this.pool.query<{ id: string; provider_code: string; credentials_ref: string; status: string; tenant_id: string }>(
      `select id, provider_code, credentials_ref, status, tenant_id from integration.payment_gateways where id = $1 and store_id = $2`,
      [gatewayId, storeId],
    );
    const g = result.rows[0];
    if (!g) throw new NotFoundException('Payment gateway not found');
    if (g.status !== 'active') throw new ForbiddenException('Payment gateway is not active');
    return g;
  }

  private parseCredentials(ref: string): Record<string, string> {
    try { return JSON.parse(ref); } catch { return {}; }
  }

  private async persistTx(
    gw: { id: string; tenant_id: string; provider_code: string }, amount: number, orderRef: string,
    result: { transactionRef: string; providerTransactionId?: string; status: string; rawResponse: Record<string, unknown> },
    input: { customerName?: string; customerPhone?: string; customerEmail?: string },
  ) {
    await this.pool.query(
      `insert into integration.payment_transactions (
        id, tenant_id, store_id, gateway_id, provider_code, transaction_ref, provider_transaction_id,
        amount, currency, order_reference, status, provider_raw_response, customer_name, customer_phone, customer_email,
        initiated_at, created_at, updated_at
      ) select gen_random_uuid(), $1, pg.store_id, $3, $4, $5, $6, $7, 'BDT', $8, $9, $10, $11, $12, $13, now(), now(), now()
      from integration.payment_gateways pg where pg.id = $3`,
      [gw.tenant_id, '', gw.id, gw.provider_code, result.transactionRef, result.providerTransactionId || null,
        amount, orderRef, result.status, JSON.stringify(result.rawResponse),
        input.customerName || null, input.customerPhone || null, input.customerEmail || null],
    );
  }

  private async persistTxInClient(
    client: PoolClient, gw: { id: string; tenant_id: string; provider_code: string }, amount: number, orderRef: string,
    result: { transactionRef: string; providerTransactionId?: string; status: string; rawResponse: Record<string, unknown> },
    input: { customerName?: string; customerPhone?: string; customerEmail?: string },
  ) {
    await client.query(
      `insert into integration.payment_transactions (
        id, tenant_id, store_id, gateway_id, provider_code, transaction_ref, provider_transaction_id,
        amount, currency, order_reference, status, provider_raw_response, customer_name, customer_phone, customer_email,
        initiated_at, created_at, updated_at
      ) select gen_random_uuid(), $1, pg.store_id, $3, $4, $5, $6, $7, 'BDT', $8, $9, $10, $11, $12, $13, now(), now(), now()
      from integration.payment_gateways pg where pg.id = $3`,
      [gw.tenant_id, '', gw.id, gw.provider_code, result.transactionRef, result.providerTransactionId || null,
        amount, orderRef, result.status, JSON.stringify(result.rawResponse),
        input.customerName || null, input.customerPhone || null, input.customerEmail || null],
    );
  }

  private async emitOutbox(tenantId: string, aggregateId: string, eventType: string) {
    await this.pool.query(
      `insert into integration.outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_payload, status, available_at, created_at)
       values (gen_random_uuid(), $1, 'payment', $2, $3, '{}'::jsonb, 'pending', now(), now())`,
      [tenantId, aggregateId, eventType],
    );
  }

  private async emitOutboxInClient(client: PoolClient, tenantId: string, aggregateId: string, eventType: string) {
    await client.query(
      `insert into integration.outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_payload, status, available_at, created_at)
       values (gen_random_uuid(), $1, 'payment', $2, $3, '{}'::jsonb, 'pending', now(), now())`,
      [tenantId, aggregateId, eventType],
    );
  }

  private assertStoreContext(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    if (!authContext || authContext.type !== 'store') throw new ForbiddenException('Store context is required');
    if (headerStoreId && headerStoreId !== authContext.storeId) throw new ForbiddenException('Store header does not match authenticated context');
    return authContext.storeId;
  }
}
