import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';

import type { StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  async listGateways(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query<{
      id: string;
      provider_code: string;
      display_name: string;
      credentials_ref: string;
      status: string;
      created_at: string;
    }>(
      `
        select id, provider_code, display_name, credentials_ref, status, created_at, updated_at
        from integration.payment_gateways
        where store_id = $1
        order by created_at asc
      `,
      [storeId],
    );

    return { gateways: result.rows };
  }

  async createGateway(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      providerCode: string;
      displayName: string;
      credentialsRef: string;
      status: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query<{
      id: string;
      provider_code: string;
      display_name: string;
      credentials_ref: string;
      status: string;
      updated_at: string;
    }>(
      `
        insert into integration.payment_gateways (
          id,
          tenant_id,
          store_id,
          provider_code,
          display_name,
          credentials_ref,
          status,
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
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, provider_code, display_name, credentials_ref, status, created_at
      `,
      [storeId, payload.providerCode, payload.displayName, payload.credentialsRef, payload.status],
    );

    const gateway = result.rows[0];
    const tenantResult = await this.pool.query<{ tenant_id: string }>(
      `select tenant_id from store.stores where id = $1 limit 1`,
      [storeId],
    );

    await this.auditService.recordUserAction({
      tenantId: tenantResult.rows[0]?.tenant_id ?? '',
      actorUserId: null,
      storeId,
      actionCode: 'payment_gateway.create',
      resourceType: 'payment_gateway',
      resourceId: gateway.id,
      after: gateway,
    });

    return { gateway };
  }

  async updateGateway(
    gatewayId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      displayName?: string;
      credentialsRef?: string;
      status?: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        update integration.payment_gateways
        set
          display_name = coalesce($3, display_name),
          credentials_ref = coalesce($4, credentials_ref),
          status = coalesce($5, status),
          updated_at = now()
        where id = $1
          and store_id = $2
        returning id, provider_code, display_name, credentials_ref, status, updated_at
      `,
      [gatewayId, storeId, payload.displayName ?? null, payload.credentialsRef ?? null, payload.status ?? null],
    );

    const gateway = result.rows[0];
    if (!gateway) {
      throw new NotFoundException('Payment gateway not found');
    }

    const tenantResult = await this.pool.query<{ tenant_id: string }>(
      `select tenant_id from store.stores where id = $1 limit 1`,
      [storeId],
    );

    await this.auditService.recordUserAction({
      tenantId: tenantResult.rows[0]?.tenant_id ?? '',
      actorUserId: null,
      storeId,
      actionCode: 'payment_gateway.update',
      resourceType: 'payment_gateway',
      resourceId: gatewayId,
      after: gateway,
    });

    return { gateway };
  }

  private assertStoreContext(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    if (!authContext || authContext.type !== 'store') {
      throw new ForbiddenException('Store context is required');
    }

    if (headerStoreId && headerStoreId !== authContext.storeId) {
      throw new ForbiddenException('Store header does not match authenticated context');
    }

    return authContext.storeId;
  }
}
