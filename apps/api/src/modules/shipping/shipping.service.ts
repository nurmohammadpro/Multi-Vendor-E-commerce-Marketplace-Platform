import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

const allowedStatusTransitions: Record<string, string[]> = {
  pending: ['assigned', 'failed'],
  assigned: ['picked_up', 'failed'],
  picked_up: ['in_transit', 'returned'],
  in_transit: ['delivered', 'failed', 'returned'],
  delivered: [],
  failed: [],
  returned: [],
};

@Injectable()
export class ShippingService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  async getCouriers(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select cp.id, cp.code, cp.name, cp.status, cp.config_json
        from shipping.courier_providers cp
        join store.stores s on s.tenant_id = cp.tenant_id
        where s.id = $1
        order by cp.name asc
      `,
      [storeId],
    );

    return { couriers: result.rows };
  }

  async createShipment(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      saleId?: string;
      courierProviderId?: string;
      customerName: string;
      customerPhone: string;
      deliveryAddress: string;
      district?: string;
      area?: string;
      deliveryFee: number;
      trackingNo?: string;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const shipmentNo = await this.generateShipmentNo(client, storeId);

      const result = await client.query<{ id: string; shipment_no: string }>(
        `
          insert into shipping.shipments (
            id,
            tenant_id,
            store_id,
            sale_id,
            courier_provider_id,
            shipment_no,
            customer_name,
            customer_phone,
            delivery_address,
            district,
            area,
            delivery_fee,
            tracking_no,
            status,
            created_by,
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
            $9,
            $10,
            $11,
            'pending',
            $12,
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning *
        `,
        [
          storeId,
          payload.saleId ?? null,
          payload.courierProviderId ?? null,
          shipmentNo,
          payload.customerName,
          payload.customerPhone,
          payload.deliveryAddress,
          payload.district ?? null,
          payload.area ?? null,
          payload.deliveryFee,
          payload.trackingNo ?? null,
          userId,
        ],
      );

      const shipment = result.rows[0];
      await this.insertShipmentEvent(client, shipment.id, 'created', {
        saleId: payload.saleId ?? null,
        courierProviderId: payload.courierProviderId ?? null,
      }, payload.note ?? 'Shipment created');

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'shipment.create',
        resourceType: 'shipment',
        resourceId: String(shipment.id),
        after: {
          shipmentNo: shipment.shipment_no,
          customerName: payload.customerName,
          deliveryFee: payload.deliveryFee,
        },
      });
      return { shipment };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getShipments(
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
            sh.id,
            sh.shipment_no,
            sh.sale_id,
            sh.customer_name,
            sh.customer_phone,
            sh.delivery_fee,
            sh.tracking_no,
            sh.status,
            sh.created_at,
            cp.name as courier_name,
            count(*) over()::int as total_count
          from shipping.shipments sh
          left join shipping.courier_providers cp on cp.id = sh.courier_provider_id
          where sh.store_id = $1
            and ($2::text is null or sh.status = $2::text)
            and (
              $3::text is null
              or sh.shipment_no ilike '%' || $3::text || '%'
              or sh.customer_name ilike '%' || $3::text || '%'
              or sh.customer_phone ilike '%' || $3::text || '%'
              or coalesce(cp.name, '') ilike '%' || $3::text || '%'
            )
          order by sh.created_at desc
          limit $4
          offset $5
        ) shipments
      `,
      [storeId, filters.status ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { shipments: items, pagination: { page, limit, total } };
  }

  async getShipment(shipmentId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const shipmentResult = await this.pool.query(
      `
        select sh.*, cp.name as courier_name
        from shipping.shipments sh
        left join shipping.courier_providers cp on cp.id = sh.courier_provider_id
        where sh.id = $1
          and sh.store_id = $2
        limit 1
      `,
      [shipmentId, storeId],
    );

    const shipment = shipmentResult.rows[0];
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const eventsResult = await this.pool.query(
      `
        select id, event_type, event_payload, note, created_at
        from shipping.shipment_events
        where shipment_id = $1
        order by created_at asc
      `,
      [shipmentId],
    );

    return {
      shipment,
      events: eventsResult.rows,
    };
  }

  async updateShipmentStatus(
    shipmentId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'returned';
      trackingNo?: string;
      note?: string;
      eventPayload?: Record<string, unknown>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentResult = await client.query<{ id: string; status: string }>(
        `
          select id, status
          from shipping.shipments
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [shipmentId, storeId],
      );

      const shipment = currentResult.rows[0];
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }

      if (shipment.status !== payload.status) {
        const allowedNextStatuses = allowedStatusTransitions[shipment.status] ?? [];
        if (!allowedNextStatuses.includes(payload.status)) {
          throw new ForbiddenException(`Invalid shipment status transition from ${shipment.status} to ${payload.status}`);
        }
      }

      const result = await client.query(
        `
          update shipping.shipments
          set status = $3,
              tracking_no = coalesce($4, tracking_no),
              updated_at = now()
          where id = $1
            and store_id = $2
          returning *
        `,
        [shipmentId, storeId, payload.status, payload.trackingNo ?? null],
      );

      await this.insertShipmentEvent(
        client,
        shipmentId,
        payload.status,
        payload.eventPayload ?? {},
        payload.note ?? `Shipment status changed to ${payload.status}`,
      );

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'shipment.status.update',
        resourceType: 'shipment',
        resourceId: shipmentId,
        before: { status: shipment.status },
        after: {
          status: payload.status,
          trackingNo: payload.trackingNo ?? null,
          note: payload.note ?? null,
        },
      });
      return { shipment: result.rows[0] };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertShipmentEvent(
    client: PoolClient,
    shipmentId: string,
    eventType: string,
    eventPayload: Record<string, unknown>,
    note: string,
  ) {
    await client.query(
      `
        insert into shipping.shipment_events (
          id,
          shipment_id,
          event_type,
          event_payload,
          note,
          created_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3::jsonb,
          $4,
          now()
        )
      `,
      [shipmentId, eventType, JSON.stringify(eventPayload), note],
    );
  }

  private async generateShipmentNo(client: PoolClient, storeId: string) {
    const result = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from shipping.shipments
        where store_id = $1
      `,
      [storeId],
    );

    const nextNumber = Number(result.rows[0]?.count ?? 0) + 1;
    return `SHP-${String(nextNumber).padStart(6, '0')}`;
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
