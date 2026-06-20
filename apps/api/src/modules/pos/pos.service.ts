import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class PosService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async openShift(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { registerId: string; openingCash: number },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        insert into sales.register_shifts (
          id,
          tenant_id,
          store_id,
          register_id,
          opened_by,
          opening_cash,
          opened_at,
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
          now(),
          'open',
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, register_id, opening_cash, opened_at, status
      `,
      [storeId, payload.registerId, userId, payload.openingCash],
    );

    return { shift: result.rows[0] };
  }

  async closeShift(
    shiftId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { closingCash: number },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        update sales.register_shifts
        set
          closing_cash = $3,
          closed_by = $4,
          closed_at = now(),
          status = 'closed',
          updated_at = now()
        where id = $1
          and store_id = $2
          and status = 'open'
        returning id, register_id, opening_cash, closing_cash, opened_at, closed_at, status
      `,
      [shiftId, storeId, payload.closingCash, userId],
    );

    const shift = result.rows[0];
    if (!shift) {
      throw new NotFoundException('Open shift not found');
    }

    return { shift };
  }

  async createSale(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      locationId: string;
      registerId?: string;
      shiftId?: string;
      customerName?: string;
      customerPhone?: string;
      discountAmount: number;
      taxAmount: number;
      shippingAmount: number;
      note?: string;
      items: Array<{
        skuId: string;
        qty: number;
        unitPrice: number;
        discountAmount: number;
        taxAmount: number;
      }>;
      payments: Array<{
        paymentMethod: string;
        gatewayProvider?: string;
        amount: number;
        referenceNo?: string;
        status: string;
      }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const saleNo = await this.generateSaleNumber(client, storeId);

      const subtotalAmount = payload.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
      const itemDiscountTotal = payload.items.reduce((sum, item) => sum + item.discountAmount, 0);
      const itemTaxTotal = payload.items.reduce((sum, item) => sum + item.taxAmount, 0);
      const discountAmount = payload.discountAmount + itemDiscountTotal;
      const taxAmount = payload.taxAmount + itemTaxTotal;
      const totalAmount = subtotalAmount - discountAmount + taxAmount + payload.shippingAmount;

      for (const item of payload.items) {
        await this.reserveAndDeductInventory(client, storeId, payload.locationId, item.skuId, item.qty, userId, saleNo);
      }

      const saleResult = await client.query<{
        id: string;
        sale_no: string;
        total_amount: string;
        created_at: string;
        location_id: string;
      }>(
        `
          insert into sales.sales (
            id,
            tenant_id,
            store_id,
            location_id,
            register_id,
            shift_id,
            sale_no,
            sold_by,
            customer_name,
            customer_phone,
            subtotal_amount,
            discount_amount,
            tax_amount,
            shipping_amount,
            total_amount,
            payment_status,
            fulfillment_status,
            status,
            note,
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
            $12,
            $13,
            'paid',
            case when $12 > 0 then 'delivery_pending' else 'completed' end,
            'completed',
            $14,
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning id, sale_no, total_amount, created_at
        `,
        [
          storeId,
          payload.locationId,
          payload.registerId ?? null,
          payload.shiftId ?? null,
          saleNo,
          userId,
          payload.customerName ?? null,
          payload.customerPhone ?? null,
          subtotalAmount,
          discountAmount,
          taxAmount,
          payload.shippingAmount,
          totalAmount,
          payload.note ?? null,
        ],
      );

      const sale = saleResult.rows[0];

      for (const item of payload.items) {
        const skuSnapshot = await this.getSkuSnapshot(client, item.skuId, storeId);
        await client.query(
          `
            insert into sales.sale_items (
              id,
              sale_id,
              sku_id,
              product_name_snapshot,
              sku_code_snapshot,
              qty,
              unit_price,
              discount_amount,
              tax_amount,
              line_total,
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
              $8,
              $9,
              now()
            )
          `,
          [
            sale.id,
            item.skuId,
            skuSnapshot.product_name,
            skuSnapshot.sku_code,
            item.qty,
            item.unitPrice,
            item.discountAmount,
            item.taxAmount,
            item.qty * item.unitPrice - item.discountAmount + item.taxAmount,
          ],
        );
      }

      for (const payment of payload.payments) {
        await client.query(
          `
            insert into sales.sale_payments (
              id,
              sale_id,
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
              now(),
              now()
            )
          `,
          [
            sale.id,
            payment.paymentMethod,
            payment.gatewayProvider ?? null,
            payment.amount,
            payment.referenceNo ?? null,
            payment.status,
          ],
        );
      }

      await client.query(
        `
          insert into integration.outbox_events (
            id,
            tenant_id,
            aggregate_type,
            aggregate_id,
            event_type,
            event_payload,
            status,
            available_at,
            created_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            'sale',
            $2,
            'sale.completed',
            $3::jsonb,
            'pending',
            now(),
            now()
          from store.stores s
          where s.id = $1
        `,
        [
          storeId,
          sale.id,
          JSON.stringify({
            saleId: sale.id,
            saleNo: sale.sale_no,
            storeId,
            totalAmount,
          }),
        ],
      );

      await client.query('commit');
      return {
        sale: {
          id: sale.id,
          saleNo: sale.sale_no,
          totalAmount,
          subtotalAmount,
          discountAmount,
          taxAmount,
          shippingAmount: payload.shippingAmount,
          createdAt: sale.created_at,
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getSale(saleId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const saleResult = await this.pool.query(
      `
        select *
        from sales.sales
        where id = $1
          and store_id = $2
        limit 1
      `,
      [saleId, storeId],
    );

    const sale = saleResult.rows[0];
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const [items, payments] = await Promise.all([
      this.pool.query(
        `
          select id, sku_id, product_name_snapshot, sku_code_snapshot, qty, unit_price, discount_amount, tax_amount, line_total
          from sales.sale_items
          where sale_id = $1
          order by created_at asc
        `,
        [saleId],
      ),
      this.pool.query(
        `
          select id, payment_method, gateway_provider, amount, reference_no, status, paid_at
          from sales.sale_payments
          where sale_id = $1
          order by created_at asc
        `,
        [saleId],
      ),
    ]);

    return {
      sale,
      items: items.rows,
      payments: payments.rows,
    };
  }

  async returnSale(
    saleId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      reason: string;
      refundAmount: number;
      items: Array<{
        saleItemId: string;
        qty: number;
        restockToInventory: boolean;
        lineRefundAmount: number;
      }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const saleResult = await client.query<{
        id: string;
        store_id: string;
        location_id: string;
      }>(
        `
          select id, store_id, location_id
          from sales.sales
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [saleId, storeId],
      );

      const sale = saleResult.rows[0];
      if (!sale) {
        throw new NotFoundException('Sale not found');
      }

      const returnResult = await client.query<{ id: string }>(
        `
          insert into sales.sale_returns (
            id,
            tenant_id,
            store_id,
            sale_id,
            processed_by,
            reason,
            refund_amount,
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
            'processed',
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning id
        `,
        [storeId, saleId, userId, payload.reason, payload.refundAmount],
      );

      const saleReturnId = returnResult.rows[0].id;

      for (const item of payload.items) {
        const saleItemResult = await client.query<{
          sku_id: string;
        }>(
          `
            select sku_id
            from sales.sale_items
            where id = $1
              and sale_id = $2
            limit 1
          `,
          [item.saleItemId, saleId],
        );

        const saleItem = saleItemResult.rows[0];
        if (!saleItem) {
          throw new NotFoundException('Sale item not found');
        }

        await client.query(
          `
            insert into sales.sale_return_items (
              id,
              sale_return_id,
              sale_item_id,
              qty,
              restock_to_inventory,
              line_refund_amount,
              created_at
            )
            values (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              $5,
              now()
            )
          `,
          [saleReturnId, item.saleItemId, item.qty, item.restockToInventory, item.lineRefundAmount],
        );

        if (item.restockToInventory) {
          await this.upsertBalance(client, storeId, sale.location_id, saleItem.sku_id, item.qty);
          await this.insertLedger(client, {
            storeId,
            locationId: sale.location_id,
            skuId: saleItem.sku_id,
            movementType: 'return',
            qtyDelta: item.qty,
            referenceType: 'sale_return',
            referenceId: saleReturnId,
            note: payload.reason,
            actorId: userId,
          });
        }
      }

      await client.query('commit');
      return {
        saleReturn: {
          id: saleReturnId,
          refundAmount: payload.refundAmount,
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async reserveAndDeductInventory(
    client: PoolClient,
    storeId: string,
    locationId: string,
    skuId: string,
    qty: number,
    actorId: string,
    saleNo: string,
  ) {
    const balanceResult = await client.query<{
      id: string;
      available_qty: string;
      on_hand_qty: string;
    }>(
      `
        select id, available_qty, on_hand_qty
        from inventory.balances
        where store_id = $1
          and location_id = $2
          and sku_id = $3
        limit 1
        for update
      `,
      [storeId, locationId, skuId],
    );

    const balance = balanceResult.rows[0];
    if (!balance) {
      throw new NotFoundException('Inventory balance not found for sale item');
    }

    if (Number(balance.available_qty) < qty) {
      throw new ForbiddenException('Insufficient stock');
    }

    await client.query(
      `
        update inventory.balances
        set
          on_hand_qty = on_hand_qty - $4,
          updated_at = now()
        where store_id = $1
          and location_id = $2
          and sku_id = $3
      `,
      [storeId, locationId, skuId, qty],
    );

    await this.insertLedger(client, {
      storeId,
      locationId,
      skuId,
      movementType: 'sale',
      qtyDelta: -qty,
      referenceType: 'sale',
      referenceId: null,
      note: `POS sale ${saleNo}`,
      actorId,
    });
  }

  private async getSkuSnapshot(client: PoolClient, skuId: string, storeId: string) {
    const result = await client.query<{
      sku_code: string;
      product_name: string;
    }>(
      `
        select
          s.sku_code,
          p.name as product_name
        from catalog.skus s
        join catalog.products p on p.id = s.product_id
        where s.id = $1
          and s.store_id = $2
        limit 1
      `,
      [skuId, storeId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('SKU not found');
    }

    return row;
  }

  private async generateSaleNumber(client: PoolClient, storeId: string) {
    const result = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from sales.sales
        where store_id = $1
      `,
      [storeId],
    );

    const next = Number(result.rows[0]?.count ?? '0') + 1;
    return `SALE-${String(next).padStart(6, '0')}`;
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
