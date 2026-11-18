import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Pool } from 'pg';

import { assertLocationInStore } from '../common/location-scope.js';
import { DATABASE_POOL } from '../database/database.constants.js';

const createTransferSchema = z.object({
  locationFrom: z.string().uuid(),
  locationTo: z.string().uuid(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    skuId: z.string().uuid(),
    qty: z.number().int().positive(),
  })).min(1),
});

@Injectable()
export class TransfersService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private async nextTransferNo(client: import('pg').PoolClient, storeId: string) {
    const result = await client.query<{ count: string }>(
      'select count(*)::text as count from inventory.stock_transfers where store_id = $1',
      [storeId],
    );
    const next = Number(result.rows[0]?.count ?? '0') + 1;
    return `TRF-${String(next).padStart(6, '0')}`;
  }

  async createTransfer(
    headerStoreId: string | undefined,
    authContext: { storeId?: string; type?: string } | null,
    session: { user?: { id: string; tenantId: string } } | null,
    payload: unknown,
  ) {
    const { locationFrom, locationTo, note, items } = createTransferSchema.parse(payload);
    const storeId = authContext?.storeId ?? headerStoreId;
    if (!storeId) throw new ForbiddenException('Store context required');
    const userId = session?.user?.id;
    if (!userId) throw new ForbiddenException('Auth session required');
    if (locationFrom === locationTo) {
      throw new ForbiddenException('Source and destination outlets must be different');
    }
    await assertLocationInStore(this.pool, locationFrom, storeId);
    await assertLocationInStore(this.pool, locationTo, storeId);

    const tenantResult = await this.pool.query('select tenant_id from store.stores where id = $1 limit 1', [storeId]);
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) throw new NotFoundException('Store not found');

    const skuResult = await this.pool.query<{ id: string; sku_code: string; product_name: string }>(
      `select s.id, s.sku_code, p.name as product_name
       from catalog.skus s join catalog.products p on p.id = s.product_id
       where p.store_id = $1 and s.id = any($2::uuid[])`,
      [storeId, items.map((i) => i.skuId)],
    );
    const skuMap = new Map(skuResult.rows.map((r) => [r.id, r]));
    if (items.some((i) => !skuMap.has(i.skuId))) {
      throw new NotFoundException('One or more SKUs were not found for this store');
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const transferNo = await this.nextTransferNo(client, storeId);
      const headResult = await client.query<{ id: string }>(
        `insert into inventory.stock_transfers (id, tenant_id, store_id, transfer_no, location_from, location_to, transfer_date, note, created_by)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, current_date, $6, $7) returning id`,
        [tenantId, storeId, transferNo, locationFrom, locationTo, note ?? null, userId],
      );
      const transferId = headResult.rows[0].id;

      for (const item of items) {
        const sku = skuMap.get(item.skuId)!;
        await client.query(
          'insert into inventory.stock_transfer_items (transfer_id, sku_id, product_name_snapshot, sku_code_snapshot, qty) values ($1, $2, $3, $4, $5)',
          [transferId, item.skuId, sku.product_name, sku.sku_code, item.qty],
        );
        await client.query(
          `update inventory.balances set
             on_hand_qty = on_hand_qty - $3,
             available_qty = available_qty - $3,
             updated_at = now()
           where location_id = $1 and sku_id = $2`,
          [locationFrom, item.skuId, item.qty],
        );
        await client.query(
          `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
           select gen_random_uuid(), s.tenant_id, s.id, $2, $3, 'transfer', -$4, 'stock_transfer', $5, $6, $7, now()
           from store.stores s where s.id = $1`,
          [storeId, locationFrom, item.skuId, -item.qty, transferId, `Transfer out ${transferNo}`, userId],
        );
        await client.query(
          `insert into inventory.balances (id, tenant_id, store_id, location_id, sku_id, on_hand_qty, reserved_qty, damaged_qty, returned_qty, updated_at)
           select s.tenant_id, s.id, $2, $3, $4, $5, 0, 0, 0, now() from store.stores s where s.id = $1
           on conflict (location_id, sku_id) do update set
             on_hand_qty = inventory.balances.on_hand_qty + excluded.on_hand_qty,
             available_qty = inventory.balances.available_qty + excluded.available_qty,
             updated_at = now()`,
          [storeId, locationTo, item.skuId, item.qty],
        );
        await client.query(
          `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
           select gen_random_uuid(), s.tenant_id, s.id, $2, $3, 'transfer', $4, 'stock_transfer', $5, $6, $7, now()
           from store.stores s where s.id = $1`,
          [storeId, locationTo, item.skuId, item.qty, transferId, `Transfer in ${transferNo}`, userId],
        );
      }

      await client.query('commit');
      return { transfer: { id: transferId, transferNo, itemCount: items.length } };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async listTransfers(headerStoreId: string | undefined, authContext: { storeId?: string } | null) {
    const storeId = authContext?.storeId ?? headerStoreId;
    if (!storeId) throw new ForbiddenException('Store context required');
    const result = await this.pool.query(
      `select t.id, t.transfer_no, lf.name as from_name, lt.name as to_name,
              t.transfer_date, t.note,
              (select count(*) from inventory.stock_transfer_items i where i.transfer_id = t.id)::int as items
       from inventory.stock_transfers t
       left join inventory.locations lf on lf.id = t.location_from
       left join inventory.locations lt on lt.id = t.location_to
       where t.store_id = $1
       order by t.created_at desc limit 50`,
      [storeId],
    );
    return { transfers: result.rows };
  }
}
