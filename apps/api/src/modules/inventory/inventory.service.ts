import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class InventoryService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listLocations(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select id, code, name, location_type, status, created_at
        from inventory.locations
        where store_id = $1
        order by created_at asc
      `,
      [storeId],
    );

    return { locations: result.rows };
  }

  async createLocation(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: { code: string; name: string; locationType: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        insert into inventory.locations (
          id, tenant_id, store_id, code, name, location_type, status, created_at, updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          'active',
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, code, name, location_type, status
      `,
      [storeId, payload.code, payload.name, payload.locationType],
    );

    return { location: result.rows[0] };
  }

  async listBalances(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    locationId?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select
          b.id,
          b.location_id,
          l.name as location_name,
          b.sku_id,
          s.sku_code,
          p.name as product_name,
          b.on_hand_qty,
          b.reserved_qty,
          b.available_qty,
          b.damaged_qty,
          b.returned_qty,
          b.updated_at
        from inventory.balances b
        join inventory.locations l on l.id = b.location_id
        join catalog.skus s on s.id = b.sku_id
        join catalog.products p on p.id = s.product_id
        where b.store_id = $1
          and ($2::uuid is null or b.location_id = $2::uuid)
        order by p.name asc, s.sku_code asc
      `,
      [storeId, locationId ?? null],
    );

    return { balances: result.rows };
  }

  async initializeStock(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { locationId: string; skuId: string; quantity: number; note?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const initialized = await client.query(
        `
          select id
          from inventory.stock_initializations
          where location_id = $1
            and sku_id = $2
          limit 1
        `,
        [payload.locationId, payload.skuId],
      );

      if (initialized.rows[0]) {
        throw new ForbiddenException('Initial stock already exists for this SKU and location');
      }

      await this.upsertBalance(client, storeId, payload.locationId, payload.skuId, payload.quantity);
      await this.insertLedger(client, {
        storeId,
        locationId: payload.locationId,
        skuId: payload.skuId,
        movementType: 'initial',
        qtyDelta: payload.quantity,
        referenceType: 'stock_initialization',
        referenceId: null,
        note: payload.note ?? null,
        actorId: userId,
      });

      await client.query(
        `
          insert into inventory.stock_initializations (
            id, tenant_id, store_id, location_id, sku_id, initialized_by, initialized_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2,
            $3,
            $4,
            now()
          from store.stores s
          where s.id = $1
        `,
        [storeId, payload.locationId, payload.skuId, userId],
      );

      await client.query('commit');
      return { ok: true };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async requestAdjustment(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { locationId: string; skuId: string; requestedQty: number; reason: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const balance = await this.findBalance(storeId, payload.locationId, payload.skuId);
    if (!balance) {
      throw new NotFoundException('Inventory balance not found');
    }

    const result = await this.pool.query(
      `
        insert into inventory.stock_adjustment_requests (
          id,
          tenant_id,
          store_id,
          location_id,
          sku_id,
          requested_by,
          current_qty,
          requested_qty,
          qty_delta,
          reason,
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
          $6,
          $7,
          $8,
          'pending',
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, current_qty, requested_qty, qty_delta, status, created_at
      `,
      [
        storeId,
        payload.locationId,
        payload.skuId,
        userId,
        Number(balance.on_hand_qty),
        payload.requestedQty,
        payload.requestedQty - Number(balance.on_hand_qty),
        payload.reason,
      ],
    );

    return { adjustmentRequest: result.rows[0] };
  }

  async listAdjustments(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    status?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select
          sar.id,
          sar.location_id,
          l.name as location_name,
          sar.sku_id,
          s.sku_code,
          p.name as product_name,
          sar.current_qty,
          sar.requested_qty,
          sar.qty_delta,
          sar.reason,
          sar.status,
          sar.requested_by,
          up.full_name as requested_by_name,
          sar.decided_by,
          sar.decided_at,
          sar.created_at
        from inventory.stock_adjustment_requests sar
        join inventory.locations l on l.id = sar.location_id
        join catalog.skus s on s.id = sar.sku_id
        join catalog.products p on p.id = s.product_id
        left join identity.user_profiles up on up.user_id = sar.requested_by
        where sar.store_id = $1
          and ($2::text is null or sar.status = $2::text)
        order by sar.created_at desc
      `,
      [storeId, status ?? null],
    );

    return { adjustmentRequests: result.rows };
  }

  async approveAdjustment(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { decisionNote?: string },
  ) {
    return this.decideAdjustment(requestId, headerStoreId, authContext, session, 'approved', payload.decisionNote);
  }

  async rejectAdjustment(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { decisionNote?: string },
  ) {
    return this.decideAdjustment(requestId, headerStoreId, authContext, session, 'rejected', payload.decisionNote);
  }

  async getLedger(headerStoreId: string | undefined, authContext: StoreAuthContext | null, skuId?: string) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select
          l.id,
          l.location_id,
          loc.name as location_name,
          l.sku_id,
          s.sku_code,
          p.name as product_name,
          l.movement_type,
          l.qty_delta,
          l.reference_type,
          l.reference_id,
          l.note,
          l.actor_id,
          up.full_name as actor_name,
          l.created_at
        from inventory.ledger l
        join inventory.locations loc on loc.id = l.location_id
        join catalog.skus s on s.id = l.sku_id
        join catalog.products p on p.id = s.product_id
        left join identity.user_profiles up on up.user_id = l.actor_id
        where l.store_id = $1
          and ($2::uuid is null or l.sku_id = $2::uuid)
        order by l.created_at desc
      `,
      [storeId, skuId ?? null],
    );

    return { ledger: result.rows };
  }

  private async decideAdjustment(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    decision: 'approved' | 'rejected',
    decisionNote?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const requestResult = await client.query<{
        id: string;
        location_id: string;
        sku_id: string;
        qty_delta: string;
        status: string;
      }>(
        `
          select id, location_id, sku_id, qty_delta, status
          from inventory.stock_adjustment_requests
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [requestId, storeId],
      );

      const request = requestResult.rows[0];
      if (!request) {
        throw new NotFoundException('Adjustment request not found');
      }

      if (request.status !== 'pending') {
        throw new ForbiddenException('Only pending requests can be decided');
      }

      await client.query(
        `
          update inventory.stock_adjustment_requests
          set status = $2,
              decided_by = $3,
              decided_at = now(),
              decision_note = $4,
              updated_at = now()
          where id = $1
        `,
        [requestId, decision, userId, decisionNote ?? null],
      );

      if (decision === 'approved') {
        await this.upsertBalance(client, storeId, request.location_id, request.sku_id, Number(request.qty_delta));
        await this.insertLedger(client, {
          storeId,
          locationId: request.location_id,
          skuId: request.sku_id,
          movementType: 'approval_adjustment',
          qtyDelta: Number(request.qty_delta),
          referenceType: 'stock_adjustment_request',
          referenceId: requestId,
          note: decisionNote ?? null,
          actorId: userId,
        });
      }

      await client.query('commit');
      return { ok: true, decision };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async findBalance(storeId: string, locationId: string, skuId: string) {
    const result = await this.pool.query<{
      on_hand_qty: string;
    }>(
      `
        select on_hand_qty
        from inventory.balances
        where store_id = $1
          and location_id = $2
          and sku_id = $3
        limit 1
      `,
      [storeId, locationId, skuId],
    );

    return result.rows[0] ?? null;
  }

  private async upsertBalance(
    client: PoolClient,
    storeId: string,
    locationId: string,
    skuId: string,
    qtyDelta: number,
  ) {
    await client.query(
      `
        insert into inventory.balances (
          id,
          tenant_id,
          store_id,
          location_id,
          sku_id,
          on_hand_qty,
          reserved_qty,
          damaged_qty,
          returned_qty,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          0,
          0,
          0,
          now()
        from store.stores s
        where s.id = $1
        on conflict (location_id, sku_id)
        do update set
          on_hand_qty = inventory.balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now()
      `,
      [storeId, locationId, skuId, qtyDelta],
    );
  }

  private async insertLedger(
    client: PoolClient,
    payload: {
      storeId: string;
      locationId: string;
      skuId: string;
      movementType: string;
      qtyDelta: number;
      referenceType: string;
      referenceId: string | null;
      note: string | null;
      actorId: string;
    },
  ) {
    await client.query(
      `
        insert into inventory.ledger (
          id,
          tenant_id,
          store_id,
          location_id,
          sku_id,
          movement_type,
          qty_delta,
          reference_type,
          reference_id,
          note,
          actor_id,
          created_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          now()
        from store.stores s
        where s.id = $1
      `,
      [
        payload.storeId,
        payload.locationId,
        payload.skuId,
        payload.movementType,
        payload.qtyDelta,
        payload.referenceType,
        payload.referenceId,
        payload.note,
        payload.actorId,
      ],
    );
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

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }
    return session.user.id;
  }
}
