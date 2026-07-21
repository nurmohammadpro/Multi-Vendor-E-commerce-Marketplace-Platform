import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
  ) {}

  private async ensureDefaultLocation(storeId: string) {
    await this.pool.query(
      `
        insert into inventory.locations (
          id,
          tenant_id,
          store_id,
          code,
          name,
          location_type,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          'MAIN',
          'Main Store',
          'storefront',
          'active',
          now(),
          now()
        from store.stores s
        where s.id = $1
          and not exists (
            select 1
            from inventory.locations l
            where l.store_id = s.id
              and l.status = 'active'
          )
      `,
      [storeId],
    );
  }

  async createLocation(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { code: string; name: string; locationType: string; address?: string; phone?: string; email?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    await this.billingService.checkLocationLimit(storeId);

    const tenantResult = await this.pool.query<{ tenant_id: string }>(
      `select tenant_id from store.stores where id = $1 limit 1`, [storeId],
    );
    const tenantId = tenantResult.rows[0].tenant_id;

    const result = await this.pool.query<{ id: string; code: string; name: string; location_type: string; status: string }>(
      `insert into inventory.locations (id, tenant_id, store_id, code, name, location_type, address, phone, email, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now()) returning id, code, name, address, phone, email, location_type, status`,
      [tenantId, storeId, payload.code, payload.name, payload.locationType, payload.address ?? null, payload.phone ?? null, payload.email ?? null],
    );

    await this.auditService.recordStoreAction({
      storeId, actorUserId: userId, actionCode: 'location.create',
      resourceType: 'location', resourceId: result.rows[0].id, after: result.rows[0],
    });

    return { location: result.rows[0] };
  }

  async updateLocation(
    locationId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { name?: string; code?: string; address?: string; phone?: string; email?: string; status?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const location = await this.pool.query<{ id: string }>(
      `select id from inventory.locations where id = $1 and store_id = $2 limit 1`,
      [locationId, storeId],
    );
    if (!location.rows[0]) throw new NotFoundException('Location not found');

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (payload.name !== undefined) { sets.push(`name = $${idx++}`); values.push(payload.name); }
    if (payload.code !== undefined) { sets.push(`code = $${idx++}`); values.push(payload.code); }
    if (payload.address !== undefined) { sets.push(`address = $${idx++}`); values.push(payload.address); }
    if (payload.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(payload.phone); }
    if (payload.email !== undefined) { sets.push(`email = $${idx++}`); values.push(payload.email); }
    if (payload.status !== undefined) { sets.push(`status = $${idx++}`); values.push(payload.status); }

    if (!sets.length) return { location: location.rows[0] };

    sets.push(`updated_at = now()`);

    const result = await this.pool.query(
      `update inventory.locations set ${sets.join(', ')} where id = $${idx} and store_id = $${idx + 1} returning id, code, name, address, phone, email, location_type, status`,
      [...values, locationId, storeId],
    );

    await this.auditService.recordStoreAction({
      storeId, actorUserId: userId, actionCode: 'location.update',
      resourceType: 'location', resourceId: locationId, after: result.rows[0],
    });

    return { location: result.rows[0] };
  }

  async deleteLocation(
    locationId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const location = await this.pool.query<{ id: string }>(
      `select id from inventory.locations where id = $1 and store_id = $2 limit 1`,
      [locationId, storeId],
    );
    if (!location.rows[0]) throw new NotFoundException('Location not found');

    await this.pool.query(
      `update inventory.locations set status = 'inactive', updated_at = now() where id = $1`,
      [locationId],
    );

    await this.auditService.recordStoreAction({
      storeId, actorUserId: userId, actionCode: 'location.delete',
      resourceType: 'location', resourceId: locationId,
    });

    return { ok: true };
  }

  async listLocations(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    await this.ensureDefaultLocation(storeId);
    const result = await this.pool.query(
      `
        select id, code, name, address, phone, email, location_type, status, created_at, updated_at
        from inventory.locations
        where store_id = $1
          and status = 'active'
        order by created_at asc
      `,
      [storeId],
    );

    return { locations: result.rows };
  }

    async listBalances(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { locationId?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    await this.ensureDefaultLocation(storeId);

    // Auto-seed zero-balance rows for any active SKU that doesn't have one,
    // so every SKU appears in balances immediately without manual initialization.
    await this.pool.query(
      `
        insert into inventory.balances (id, tenant_id, store_id, location_id, sku_id, on_hand_qty, reserved_qty, damaged_qty, returned_qty, updated_at)
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          loc.id,
          sku.id,
          0, 0, 0, 0, now()
        from store.stores s
        cross join catalog.skus sku
        join inventory.locations loc on loc.store_id = s.id and loc.status = 'active'
        left join inventory.balances b on b.location_id = loc.id and b.sku_id = sku.id
        where s.id = $1
          and sku.store_id = $1
          and sku.status = 'active'
          and b.id is null
        on conflict (location_id, sku_id) do nothing
      `,
      [storeId],
    );

    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            b.id,
            b.location_id,
            l.name as location_name,
            b.sku_id,
            s.sku_code,
            p.name as product_name,
            p.is_trackable,
            b.on_hand_qty,
            b.reserved_qty,
            b.available_qty,
            b.damaged_qty,
            b.returned_qty,
            b.updated_at,
            count(*) over()::int as total_count
          from inventory.balances b
          join inventory.locations l on l.id = b.location_id
          join catalog.skus s on s.id = b.sku_id
          join catalog.products p on p.id = s.product_id
          where b.store_id = $1
            and ($2::uuid is null or b.location_id = $2::uuid)
            and (
              $3::text is null
              or p.name ilike '%' || $3::text || '%'
              or s.sku_code ilike '%' || $3::text || '%'
              or l.name ilike '%' || $3::text || '%'
            )
          order by p.name asc, s.sku_code asc
          limit $4
          offset $5
        ) balances
      `,
      [storeId, filters.locationId ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { balances: items, pagination: { page, limit, total } };
  }

  async directAdjustBalance(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      locationId: string;
      skuId: string;
      onHandQty: number;
      reservedQty: number;
      damagedQty: number;
      returnedQty: number;
      reason: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const balance = await this.findBalance(storeId, payload.locationId, payload.skuId);
    if (!balance) {
      throw new NotFoundException('Inventory balance not found');
    }

    const currentOnHand = Number(balance.on_hand_qty ?? 0);
    const newOnHand = payload.onHandQty;
    const qtyDelta = newOnHand - currentOnHand;

    await this.pool.query(
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
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          now()
        )
        on conflict (location_id, sku_id) do update set
          on_hand_qty = EXCLUDED.on_hand_qty,
          reserved_qty = EXCLUDED.reserved_qty,
          damaged_qty = EXCLUDED.damaged_qty,
          returned_qty = EXCLUDED.returned_qty,
          updated_at = EXCLUDED.updated_at
      `,
      [
        balance.id,
        balance.tenant_id,
        storeId,
        payload.locationId,
        payload.skuId,
        payload.onHandQty,
        payload.reservedQty,
        payload.damagedQty,
        payload.returnedQty,
      ],
    );

    // Log the adjustment in ledger
    await this.pool.query(
      `
        insert into inventory.ledger (
          id,
          tenant_id,
          store_id,
          location_id,
          sku_id,
          transaction_type,
          quantity_delta,
          balance_after,
          reference_type,
          reference_id,
          notes,
          created_by,
          created_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          'adjustment',
          $5,
          $6,
          'direct_adjust',
          gen_random_uuid(),
          $7,
          $8,
          now()
        )
      `,
      [
        balance.tenant_id,
        storeId,
        payload.locationId,
        payload.skuId,
        qtyDelta,
        payload.onHandQty,
        payload.reason,
        userId,
      ],
    );

    return {
      success: true,
      message: 'Stock adjusted successfully',
      newBalance: payload.onHandQty,
    };
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

    const adjustmentRequest = result.rows[0];
    await this.auditService.recordStoreAction({
      storeId,
      actorUserId: userId,
      actionCode: 'inventory.adjustment.request',
      resourceType: 'stock_adjustment_request',
      resourceId: String(adjustmentRequest?.id ?? ''),
      after: {
        locationId: payload.locationId,
        skuId: payload.skuId,
        requestedQty: payload.requestedQty,
        reason: payload.reason,
      },
    });

    return { adjustmentRequest };
  }

  async listAdjustments(
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
            sar.created_at,
            count(*) over()::int as total_count
          from inventory.stock_adjustment_requests sar
          join inventory.locations l on l.id = sar.location_id
          join catalog.skus s on s.id = sar.sku_id
          join catalog.products p on p.id = s.product_id
          left join identity.user_profiles up on up.user_id = sar.requested_by
          where sar.store_id = $1
            and ($2::text is null or sar.status = $2::text)
            and (
              $3::text is null
              or p.name ilike '%' || $3::text || '%'
              or s.sku_code ilike '%' || $3::text || '%'
              or l.name ilike '%' || $3::text || '%'
              or sar.reason ilike '%' || $3::text || '%'
            )
          order by sar.created_at desc
          limit $4
          offset $5
        ) adjustments
      `,
      [storeId, filters.status ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { adjustmentRequests: items, pagination: { page, limit, total } };
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

  async getLedger(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { skuId?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
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
            l.created_at,
            count(*) over()::int as total_count
          from inventory.ledger l
          join inventory.locations loc on loc.id = l.location_id
          join catalog.skus s on s.id = l.sku_id
          join catalog.products p on p.id = s.product_id
          left join identity.user_profiles up on up.user_id = l.actor_id
          where l.store_id = $1
            and ($2::uuid is null or l.sku_id = $2::uuid)
            and (
              $3::text is null
              or p.name ilike '%' || $3::text || '%'
              or s.sku_code ilike '%' || $3::text || '%'
              or loc.name ilike '%' || $3::text || '%'
              or l.movement_type ilike '%' || $3::text || '%'
            )
          order by l.created_at desc
          limit $4
          offset $5
        ) ledger
      `,
      [storeId, filters.skuId ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { ledger: items, pagination: { page, limit, total } };
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
    const result = await this.pool.query(
      `
        select id, tenant_id, store_id, location_id, sku_id, on_hand_qty, reserved_qty, damaged_qty, returned_qty
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
