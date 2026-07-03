import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class PosService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  private async ensureDefaultRegister(storeId: string) {
    await this.pool.query(
      `
        insert into sales.registers (
          id,
          tenant_id,
          store_id,
          code,
          name,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          'COUNTER-1',
          'Main Counter',
          'active',
          now(),
          now()
        from store.stores s
        where s.id = $1
          and not exists (
            select 1
            from sales.registers r
            where r.store_id = s.id
              and r.status = 'active'
          )
      `,
      [storeId],
    );
  }

  async getRegisters(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    await this.ensureDefaultRegister(storeId);

    const result = await this.pool.query(
      `
        select
          r.id,
          r.code,
          r.name,
          r.status,
          rs.id as open_shift_id,
          rs.opened_at as open_shift_opened_at,
          rs.opening_cash as open_shift_opening_cash,
          up.full_name as open_shift_opened_by_name
        from sales.registers r
        left join sales.register_shifts rs
          on rs.register_id = r.id
          and rs.status = 'open'
        left join identity.user_profiles up on up.user_id = rs.opened_by
        where r.store_id = $1
        order by r.created_at asc
      `,
      [storeId],
    );

    return {
      registers: result.rows,
    };
  }

  async searchCatalog(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: { barcode?: string; q?: string; locationId?: string; limit: number },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        with latest_prices as (
          select distinct on (pr.sku_id)
            pr.sku_id,
            pr.sale_price,
            pr.compare_at_price,
            pr.discount_type,
            pr.discount_value
          from catalog.prices pr
          join catalog.skus sku on sku.id = pr.sku_id
          where sku.store_id = $1
          order by pr.sku_id, pr.effective_from desc, pr.created_at desc
        ),
        stock_totals as (
          select
            b.sku_id,
            coalesce(sum(b.on_hand_qty), 0) as on_hand_qty,
            coalesce(sum(b.available_qty), 0) as available_qty
          from inventory.balances b
          where b.store_id = $1
            and ($4::uuid is null or b.location_id = $4::uuid)
          group by b.sku_id
        )
        select
          sku.id,
          sku.product_id,
          sku.sku_code,
          sku.barcode,
          sku.variant_label,
          sku.variant_json,
          sku.unit_name,
          sku.status,
          p.product_code,
          p.name as product_name,
          p.has_variants,
          p.variant_mode,
          p.is_trackable,
          lp.sale_price,
          lp.compare_at_price,
          lp.discount_type,
          lp.discount_value,
          st.on_hand_qty,
          st.available_qty
        from catalog.skus sku
        join catalog.products p on p.id = sku.product_id
        left join latest_prices lp on lp.sku_id = sku.id
        left join stock_totals st on st.sku_id = sku.id
        where sku.store_id = $1
          and sku.status = 'active'
          and (
            $2::varchar is null
            or sku.barcode = $2::varchar
          )
          and (
            ($3::text is null and $2::varchar is not null)
            or $3::text is null
            or p.name ilike '%' || $3::text || '%'
            or sku.sku_code ilike '%' || $3::text || '%'
            or coalesce(sku.barcode, '') ilike '%' || $3::text || '%'
            or coalesce(sku.variant_label, '') ilike '%' || $3::text || '%'
          )
        order by
          case when $2::varchar is not null and sku.barcode = $2::varchar then 0 else 1 end,
          p.name asc,
          sku.variant_label asc nulls first,
          sku.created_at asc
        limit $5
      `,
      [storeId, payload.barcode ?? null, payload.q ?? null, payload.locationId ?? null, payload.limit],
    );

    return {
      skus: result.rows,
    };
  }

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

    const shift = result.rows[0];
    await this.auditService.recordStoreAction({
      storeId,
      actorUserId: userId,
      actionCode: 'shift.open',
      resourceType: 'register_shift',
      resourceId: String(shift?.id ?? ''),
      after: shift ?? null,
    });

    return { shift };
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

    await this.auditService.recordStoreAction({
      storeId,
      actorUserId: userId,
      actionCode: 'shift.close',
      resourceType: 'register_shift',
      resourceId: String(shift.id),
      after: shift,
    });

    return { shift };
  }

  async createSale(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      clientRequestId?: string;
      locationId: string;
      registerId?: string;
      shiftId?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      customerShopName?: string;
      customerAddress?: string;
      dueDate?: string;
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

      if (payload.clientRequestId) {
        const existingSaleResult = await client.query<{
          id: string;
          sale_no: string;
          total_amount: string;
          created_at: string;
        }>(
          `
            select id, sale_no, total_amount, created_at
            from sales.sales
            where store_id = $1
              and client_request_id = $2
            limit 1
          `,
          [storeId, payload.clientRequestId],
        );

        const existingSale = existingSaleResult.rows[0];
        if (existingSale) {
          await client.query('rollback');
          return {
            sale: {
              id: existingSale.id,
              saleNo: existingSale.sale_no,
              totalAmount: Number(existingSale.total_amount),
              subtotalAmount: null,
              discountAmount: null,
              taxAmount: null,
              shippingAmount: null,
              createdAt: existingSale.created_at,
            },
          };
        }
      }

      const saleNo = await this.generateSaleNumber(client, storeId);
      const customerId = await this.upsertCustomer(client, storeId, session, {
        fullName: payload.customerName,
        mobileNo: payload.customerPhone,
        email: payload.customerEmail,
        shopName: payload.customerShopName,
        address: payload.customerAddress,
      });

      const subtotalAmount = payload.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
      const itemDiscountTotal = payload.items.reduce((sum, item) => sum + item.discountAmount, 0);
      const itemTaxTotal = payload.items.reduce((sum, item) => sum + item.taxAmount, 0);
      const discountAmount = payload.discountAmount + itemDiscountTotal;
      const taxAmount = payload.taxAmount + itemTaxTotal;
      const totalAmount = subtotalAmount - discountAmount + taxAmount + payload.shippingAmount;
      const paidAmount = payload.payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + payment.amount, 0);
      const pendingAmount = payload.payments
        .filter((payment) => payment.status === 'pending')
        .reduce((sum, payment) => sum + payment.amount, 0);
      const paymentStatus =
        paidAmount >= totalAmount
          ? 'paid'
          : pendingAmount > 0 && paidAmount === 0
            ? 'due'
            : pendingAmount > 0
              ? 'partial'
              : 'unpaid';

      const skuIds = payload.items.map((item) => item.skuId);
      const skuProductResult = await client.query<{ sku_id: string; is_trackable: boolean }>(
        `
          select s.id as sku_id, p.is_trackable
          from catalog.skus s
          join catalog.products p on p.id = s.product_id
          where s.id = any($1::uuid[])
            and s.store_id = $2
        `,
        [skuIds, storeId],
      );
      const trackableMap = new Map(
        skuProductResult.rows.map((row) => [row.sku_id, row.is_trackable]),
      );

      for (const item of payload.items) {
        if (trackableMap.get(item.skuId) !== false) {
          await this.reserveAndDeductInventory(client, storeId, payload.locationId, item.skuId, item.qty, userId, saleNo);
        }
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
            client_request_id,
            sale_no,
            sold_by,
            customer_id,
            customer_name,
            customer_phone,
            customer_email,
            customer_shop_name,
            customer_address,
            due_date,
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
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            case when coalesce($18::numeric, 0) > 0 then 'delivery_pending' else 'completed' end,
            'completed',
            $21,
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
          payload.clientRequestId ?? null,
          saleNo,
          userId,
          customerId,
          payload.customerName ?? null,
          payload.customerPhone ?? null,
          payload.customerEmail ?? null,
          payload.customerShopName ?? null,
          payload.customerAddress ?? null,
          payload.dueDate ?? null,
          subtotalAmount,
          discountAmount,
          taxAmount,
          payload.shippingAmount,
          totalAmount,
          paymentStatus,
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
              $7,
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
            payment.status === 'paid' ? new Date().toISOString() : null,
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

      // Queue print job for local print agent to pick up
      await client.query(
        `insert into sales.sale_print_jobs (id, sale_id, store_id, status, created_at)
         values (gen_random_uuid(), $1, $2, 'pending', now())`,
        [sale.id, storeId],
      );

      await client.query('commit');
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'sale.create',
        resourceType: 'sale',
        resourceId: String(sale.id),
        after: {
          saleNo: sale.sale_no,
          totalAmount,
          paymentStatus,
          clientRequestId: payload.clientRequestId ?? null,
          itemCount: payload.items.length,
        },
      });

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
    const { sale, items, payments } = await this.getSaleAggregate(saleId, storeId);

    return {
      sale,
      items: items.rows,
      payments: payments.rows,
    };
  }

  async reprintSaleReceipt(saleId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { sale, items, payments } = await this.getSaleAggregate(saleId, storeId);
    const receipt = await this.buildReceiptPayload(sale, items.rows, payments.rows, storeId);

    return {
      sale: {
        id: sale.id,
        saleNo: sale.sale_no,
        totalAmount: sale.total_amount,
        createdAt: sale.created_at,
      },
      receipt,
      printIntent: {
        agentPath: '/print/receipt',
        suggestedPrinterType: 'receipt',
      },
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
      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'sale.return',
        resourceType: 'sale_return',
        resourceId: saleReturnId,
        after: {
          saleId,
          refundAmount: payload.refundAmount,
          itemCount: payload.items.length,
        },
      });

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

  private async getSaleAggregate(saleId: string, storeId: string) {
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

    return { sale, items, payments };
  }

  private async buildReceiptPayload(
    sale: Record<string, unknown>,
    items: Array<Record<string, unknown>>,
    payments: Array<Record<string, unknown>>,
    storeId: string,
  ) {
    const storeResult = await this.pool.query(
      `
        select
          s.name,
          s.logo_url,
          s.phone,
          s.email,
          s.address_text,
          ss.receipt_footer
        from store.stores s
        left join store.store_settings ss on ss.store_id = s.id
        where s.id = $1
        limit 1
      `,
      [storeId],
    );

    const store = storeResult.rows[0] ?? {};
    const paidAmount = payments.reduce(
      (sum, payment) => sum + (payment.status === 'paid' ? Number(payment.amount ?? 0) : 0),
      0,
    );
    const dueAmount = Math.max(Number(sale.total_amount ?? 0) - paidAmount, 0);

    return {
      saleId: sale.id ?? null,
      saleNo: sale.sale_no ?? null,
      store: {
        name: store.name ?? null,
        logoUrl: store.logo_url ?? null,
        phone: store.phone ?? null,
        email: store.email ?? null,
        address: store.address_text ?? null,
        footer: store.receipt_footer ?? null,
      },
      customer: {
        name: sale.customer_name ?? null,
        phone: sale.customer_phone ?? null,
        email: sale.customer_email ?? null,
        shopName: sale.customer_shop_name ?? null,
        address: sale.customer_address ?? null,
      },
      items: items.map((item) => ({
        name: item.product_name_snapshot ?? null,
        skuCode: item.sku_code_snapshot ?? null,
        qty: Number(item.qty ?? 0),
        unitPrice: Number(item.unit_price ?? 0),
        discountAmount: Number(item.discount_amount ?? 0),
        taxAmount: Number(item.tax_amount ?? 0),
        lineTotal: Number(item.line_total ?? 0),
      })),
      totals: {
        subtotal: Number(sale.subtotal_amount ?? 0),
        discount: Number(sale.discount_amount ?? 0),
        tax: Number(sale.tax_amount ?? 0),
        shipping: Number(sale.shipping_amount ?? 0),
        total: Number(sale.total_amount ?? 0),
        paid: paidAmount,
        due: dueAmount,
        change: Math.max(paidAmount - Number(sale.total_amount ?? 0), 0),
      },
      payments: payments.map((payment) => ({
        paymentMethod: payment.payment_method ?? null,
        gatewayProvider: payment.gateway_provider ?? null,
        amount: Number(payment.amount ?? 0),
        referenceNo: payment.reference_no ?? null,
        status: payment.status ?? null,
        paidAt: payment.paid_at ?? null,
      })),
      printedAt: new Date().toISOString(),
    };
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

  private async upsertCustomer(
    client: PoolClient,
    storeId: string,
    session: AuthSession | null,
    payload: {
      fullName?: string;
      mobileNo?: string;
      email?: string;
      shopName?: string;
      address?: string;
    },
  ) {
    if (!payload.fullName && !payload.mobileNo && !payload.email && !payload.shopName && !payload.address) {
      return null;
    }

    const matchResult = await client.query<{ id: string }>(
      `
        select id
        from store.customers
        where store_id = $1
          and (
            ($2::varchar is not null and mobile_no = $2::varchar)
            or ($3::citext is not null and email = $3::citext)
          )
        order by created_at desc
        limit 1
      `,
      [storeId, payload.mobileNo ?? null, payload.email ?? null],
    );

    const existingId = matchResult.rows[0]?.id;
    if (existingId) {
      await client.query(
        `
          update store.customers
          set
            full_name = coalesce($2, full_name),
            mobile_no = coalesce($3, mobile_no),
            email = coalesce($4::citext, email),
            shop_name = coalesce($5, shop_name),
            address = coalesce($6, address),
            updated_at = now()
          where id = $1
        `,
        [
          existingId,
          payload.fullName ?? null,
          payload.mobileNo ?? null,
          payload.email ?? null,
          payload.shopName ?? null,
          payload.address ?? null,
        ],
      );
      return existingId;
    }

    const result = await client.query<{ id: string }>(
      `
        insert into store.customers (
          id,
          tenant_id,
          store_id,
          full_name,
          mobile_no,
          email,
          shop_name,
          address,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          $2,
          $1,
          $3,
          $4,
          $5::citext,
          $6,
          $7,
          now(),
          now()
        returning id
      `,
      [
        storeId,
        session?.user.tenantId ?? '',
        payload.fullName ?? null,
        payload.mobileNo ?? null,
        payload.email ?? null,
        payload.shopName ?? null,
        payload.address ?? null,
      ],
    );

    return result.rows[0]?.id ?? null;
  }


  // ── Print job polling (for local print agent) ──

  async listPendingPrintJobs(storeId: string, limit = 5) {
    const result = await this.pool.query<any>(
      `select spj.id, spj.sale_id, s.sale_no, s.total_amount, s.created_at as sale_created_at
       from sales.sale_print_jobs spj
       join sales.sales s on s.id = spj.sale_id
       where spj.store_id = $1 and spj.status = 'pending'
       order by spj.created_at asc limit $2`,
      [storeId, limit],
    );
    return { jobs: result.rows };
  }

  async getPrintJobReceipt(jobId: string, storeId: string) {
    const jobResult = await this.pool.query<any>(
      `select id, sale_id, status from sales.sale_print_jobs where id = $1 and store_id = $2 limit 1`,
      [jobId, storeId],
    );
    const job = jobResult.rows[0];
    if (!job) throw new NotFoundException('Print job not found');

    const { sale, items, payments } = await this.getSaleAggregate(job.sale_id, storeId);
    const receipt = await this.buildReceiptPayload(sale, items.rows, payments.rows, storeId);
    return { receipt };
  }

  async markPrintJobComplete(jobId: string, storeId: string, status: 'printed' | 'failed', errorMessage?: string) {
    const result = await this.pool.query(
      `update sales.sale_print_jobs set status = $3, printed_at = case when $3 = 'printed' then now() else null end, error_message = $4 where id = $1 and store_id = $2 returning id, status`,
      [jobId, storeId, status, errorMessage || null],
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException('Print job not found');
    return { job };
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
