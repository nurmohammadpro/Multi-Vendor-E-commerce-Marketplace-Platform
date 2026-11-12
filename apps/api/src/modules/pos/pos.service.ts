import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class PosService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
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
    payload: { barcode?: string; q?: string; locationId?: string; limit: number; productType?: string },
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
          st.available_qty,
          (
            select ds.id
            from inventory.device_serials ds
            where ds.store_id = $1
              and ds.sku_id = sku.id
              and ds.status = 'in_stock'
              and $3::text is not null
              and (ds.serial_number = $3::text or ds.imei_number = $3::text)
            limit 1
          ) as matched_serial_id,
          (
            select ds.serial_number
            from inventory.device_serials ds
            where ds.store_id = $1
              and ds.sku_id = sku.id
              and ds.status = 'in_stock'
              and $3::text is not null
              and (ds.serial_number = $3::text or ds.imei_number = $3::text)
            limit 1
          ) as matched_serial_number
        from catalog.skus sku
        join catalog.products p on p.id = sku.product_id
        left join latest_prices lp on lp.sku_id = sku.id
        left join stock_totals st on st.sku_id = sku.id
        where sku.store_id = $1
          and sku.status = 'active'
          and ($6::text is null or p.product_type = $6::text)
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
            or exists (
              select 1
              from inventory.device_serials ds
              where ds.store_id = $1
                and ds.sku_id = sku.id
                and (ds.serial_number ilike '%' || $3::text || '%'
                  or coalesce(ds.imei_number, '') ilike '%' || $3::text || '%')
            )
          )
        order by
          case when $2::varchar is not null and sku.barcode = $2::varchar then 0 else 1 end,
          case
            when $3::text is not null and exists (
              select 1 from inventory.device_serials ds
              where ds.store_id = $1 and ds.sku_id = sku.id and ds.status = 'in_stock'
                and (ds.serial_number = $3::text or ds.imei_number = $3::text)
            ) then 0
            else 1
          end,
          p.name asc,
          sku.variant_label asc nulls first,
          sku.created_at asc
        limit $5
      `,
      [storeId, payload.barcode ?? null, payload.q ?? null, payload.locationId ?? null, payload.limit, payload.productType ?? null],
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
      vatAmount: number;
      taxAmount: number;
      shippingAmount: number;
      exchangeSkuId?: string;
      exchangeAmount: number;
      note?: string;
      items: Array<{
        skuId: string;
        qty: number;
        unitPrice: number;
        discountAmount: number;
        taxAmount: number;
        serialIds?: string[];
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

      // Resolve tenantId from store
      const tenantResult = await client.query<{ tenant_id: string }>(
        'select tenant_id from store.stores where id = $1 limit 1',
        [storeId],
      );
      const tenantId = tenantResult.rows[0]?.tenant_id;

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
      const vatAmount = payload.vatAmount || 0;
      const totalAmount = subtotalAmount - discountAmount + taxAmount + vatAmount + payload.shippingAmount - (payload.exchangeAmount || 0);
      const paidAmount = payload.payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + payment.amount, 0);
      const pendingAmount = payload.payments
        .filter((payment) => payment.status === 'pending')
        .reduce((sum, payment) => sum + payment.amount, 0);
      const paymentStatus =
        paidAmount >= totalAmount
          ? 'paid'
          : payload.dueDate
            ? 'due'
            : pendingAmount > 0 && paidAmount === 0
              ? 'due'
              : paidAmount > 0
                ? 'partial'
                : 'pending';

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

      const itemUnitCosts: number[] = [];
      let saleCostAmount = 0;
      for (const item of payload.items) {
        if (trackableMap.get(item.skuId) !== false) {
          await this.reserveAndDeductInventory(client, storeId, payload.locationId, item.skuId, item.qty, userId, saleNo);
        }
        const fifoUnitCost = await this.consumeFifoBatches(client, storeId, item.skuId, item.qty);
        itemUnitCosts.push(fifoUnitCost);
        saleCostAmount += fifoUnitCost * item.qty;
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
            exchange_sku_id,
            exchange_amount,
            subtotal_amount,
            discount_amount,
            tax_amount,
            vat_amount,
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
            $21,
            $22,
            $23,
            case when coalesce($21::numeric, 0) > 0 then 'delivery_pending' else 'completed' end,
            'completed',
            $24,
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
          (payload as any).exchangeSkuId ?? null,
          (payload as any).exchangeAmount || 0,
          subtotalAmount,
          discountAmount,
          taxAmount,
          vatAmount,
          payload.shippingAmount,
          totalAmount,
          paymentStatus,
          payload.note ?? null,
        ],
      );

      const sale = saleResult.rows[0];

      for (const [itemIndex, item] of payload.items.entries()) {
        const skuSnapshot = await this.getSkuSnapshot(client, item.skuId, storeId);
        const saleItemResult = await client.query<{ id: string }>(
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
              unit_cost,
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
              $10,
              now()
            )
            returning id
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
            itemUnitCosts[itemIndex] ?? 0,
          ],
        );
        const saleItemId = saleItemResult.rows[0]?.id;

        // Handle serial numbers for tracked products
        if (item.serialIds && item.serialIds.length > 0 && saleItemId) {
          for (const serialId of item.serialIds) {
            // Mark serial as sold
            await client.query(
              `UPDATE inventory.device_serials SET status = 'sold', updated_at = NOW() WHERE id = $1`,
              [serialId],
            );

            // Link serial to sale item
            await client.query(
              `INSERT INTO inventory.device_serial_sales (id, device_serial_id, sale_item_id, sale_id, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
              [serialId, saleItemId, sale.id],
            );

            // Auto-attach the store's default warranty policy when the product's category is covered
            const warrantyCheck = await client.query<{ policy_id: string; duration_months: number }>(
              `SELECT wp.id as policy_id, wp.duration_months
               FROM catalog.skus s
               JOIN catalog.products p ON p.id = s.product_id
               JOIN catalog.warranty_policies wp
                 ON wp.store_id = $2 AND wp.status = 'active' AND wp.is_default = true
                AND p.category_id = ANY(wp.applies_to_category_ids)
               WHERE s.id = $1
               ORDER BY wp.duration_months ASC
               LIMIT 1`,
              [item.skuId, storeId],
            );

            if (warrantyCheck.rows.length > 0) {
              const policy = warrantyCheck.rows[0];
              const startDate = new Date();
              const endDate = new Date(startDate);
              endDate.setMonth(endDate.getMonth() + policy.duration_months);
              const referenceNumber = `WAR-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

              await client.query(
                `INSERT INTO sales.sale_warranties (
                  id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
                  warranty_policy_id, warranty_reference_number, warranty_start_date,
                  warranty_end_date, warranty_purchased_price, status, created_at, updated_at
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW(), NOW()
                )`,
                [
                  tenantId, storeId, sale.id, saleItemId, serialId,
                  policy.policy_id, referenceNumber, startDate, endDate,
                  item.unitPrice,
                ],
              );
            }
          }
        }
      }

      if (saleCostAmount > 0) {
        await client.query(
          `update sales.sales set cost_amount = $2, updated_at = now() where id = $1`,
          [sale.id, Math.round(saleCostAmount * 100) / 100],
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

  async listSales(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: {
      query?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortDir?: string;
    } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.query?.trim() || null;

    const safeSortColumns: Record<string, string> = {
      sale_no: 's.sale_no',
      customer_name: 's.customer_name',
      customer_phone: 's.customer_phone',
      total_amount: 's.total_amount',
      payment_status: 's.payment_status',
      created_at: 's.created_at',
    };
    const sortColumn = safeSortColumns[filters.sortBy ?? 'created_at'] ?? 's.created_at';
    const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';

    const result = await this.pool.query(
      `
        select
          s.id,
          s.sale_no,
          s.invoice_no,
          s.sale_date,
          s.total_amount,
          s.subtotal_amount,
          s.discount_amount,
          s.tax_amount,
          s.shipping_amount,
          s.payment_status,
          s.status,
          s.returned_amount,
          s.fulfillment_status,
          s.customer_name,
          s.customer_phone,
          s.customer_email,
          s.customer_shop_name,
          s.due_date,
          s.note,
          s.created_at,
          coalesce(
            (select sum(sp.amount)
             from sales.sale_payments sp
             where sp.sale_id = s.id and sp.status = 'paid'),
            0
          ) as paid_amount,
          (
            select count(*)
            from sales.sale_payments sp
            where sp.sale_id = s.id and sp.payment_method = 'cod' and sp.status <> 'refunded'
          )::int as cod_count,
          coalesce(
            (select string_agg(si.product_name_snapshot, ', ' order by si.created_at)
             from sales.sale_items si
             where si.sale_id = s.id),
            ''
          ) as items_purchased,
          count(*) over()::int as total_count
        from sales.sales s
        where s.store_id = $1
          and s.status in ('completed', 'refunded', 'returned_partially')
          and (
            $2::text is null
            or s.sale_no ilike '%' || $2::text || '%'
            or coalesce(s.invoice_no, '') ilike '%' || $2::text || '%'
            or coalesce(s.customer_name, '') ilike '%' || $2::text || '%'
            or coalesce(s.customer_phone, '') ilike '%' || $2::text || '%'
            or coalesce(s.customer_shop_name, '') ilike '%' || $2::text || '%'
            or exists (
              select 1
              from inventory.device_serial_sales dss
              join inventory.device_serials ds on ds.id = dss.device_serial_id
              where dss.sale_id = s.id
                and (ds.serial_number ilike '%' || $2::text || '%'
                  or coalesce(ds.imei_number, '') ilike '%' || $2::text || '%')
            )
          )
        order by ${sortColumn} ${sortDir}, s.created_at desc
        limit $3
        offset $4
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { sales: items, pagination: { page, limit, total } };
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

  async getSalesReport(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { fromDate?: string; toDate?: string; month?: string } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { fromDate, toDate, month } = filters;

    // Determine date range
    let startDate: string;
    let endDate: string;

    if (month) {
      // Monthly report (format: YYYY-MM)
      const [year, monthNum] = month.split('-');
      startDate = `${year}-${monthNum}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      endDate = `${year}-${monthNum}-${lastDay}`;
    } else if (fromDate && toDate) {
      startDate = fromDate;
      endDate = toDate;
    } else {
      // Default to current month if no date range provided
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    }

    // Get sales data
    const result = await this.pool.query(
      `
        select
          s.id,
          s.sale_no,
          s.total_amount,
          s.subtotal_amount,
          s.discount_amount,
          s.tax_amount,
          s.payment_status,
          s.fulfillment_status,
          s.customer_name,
          s.customer_phone,
          s.customer_email,
          s.created_at,
          coalesce(
            (select string_agg(si.product_name_snapshot, ', ' order by si.created_at)
             from sales.sale_items si
             where si.sale_id = s.id),
            ''
          ) as items_purchased
        from sales.sales s
        where s.store_id = $1
          and s.status <> 'cancelled'
          and s.created_at::date between $2::date and $3::date
        order by s.created_at asc
      `,
      [storeId, startDate, endDate],
    );

    const sales = result.rows;

    // Calculate summary statistics
    const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total_amount ?? 0), 0);
    const totalDiscounts = sales.reduce((sum, sale) => sum + Number(sale.discount_amount ?? 0), 0);
    const totalTax = sales.reduce((sum, sale) => sum + Number(sale.tax_amount ?? 0), 0);
    const paidCount = sales.filter(sale => sale.payment_status === 'paid').length;
    const partialCount = sales.filter(sale => sale.payment_status === 'partial').length;
    const unpaidCount = sales.filter(sale => sale.payment_status === 'unpaid').length;

    return {
      period: {
        fromDate: startDate,
        toDate: endDate,
        month: month || null,
      },
      summary: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        netSales: Math.round((totalSales - totalDiscounts + totalTax) * 100) / 100,
        totalOrders: sales.length,
        paidOrders: paidCount,
        partialOrders: partialCount,
        unpaidOrders: unpaidCount,
      },
      sales: sales.map((sale: any) => ({
        id: sale.id,
        saleNo: sale.sale_no,
        totalAmount: Number(sale.total_amount ?? 0),
        subtotalAmount: Number(sale.subtotal_amount ?? 0),
        discountAmount: Number(sale.discount_amount ?? 0),
        taxAmount: Number(sale.tax_amount ?? 0),
        paymentStatus: sale.payment_status,
        fulfillmentStatus: sale.fulfillment_status,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        customerEmail: sale.customer_email,
        itemsPurchased: sale.items_purchased,
        createdAt: sale.created_at,
      })),
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

  async getSaleInvoice(saleId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const hasInvoiceFeature = await this.billingService.hasStoreFeature(storeId, 'invoices');
    if (!hasInvoiceFeature) {
      throw new ForbiddenException(
        'Custom invoices require the Wholesale plan. Upgrade your plan to create invoices.',
      );
    }

    const invoiceNo = await this.assignInvoiceNumber(saleId, storeId);
    const { sale, items, payments } = await this.getSaleAggregate(saleId, storeId);
    const receipt = await this.buildReceiptPayload(sale, items.rows, payments.rows, storeId);

    return {
      sale: {
        id: sale.id,
        saleNo: sale.sale_no,
        invoiceNo,
        totalAmount: sale.total_amount,
        createdAt: sale.created_at,
      },
      receipt,
      printIntent: {
        agentPath: '/print/receipt',
        suggestedPrinterType: 'invoice_a4',
      },
    };
  }

  private async assignInvoiceNumber(saleId: string, storeId: string): Promise<string> {
    const readInvoiceNo = async () => {
      const current = await this.pool.query<{ invoice_no: string | null }>(
        'select invoice_no from sales.sales where id = $1 and store_id = $2 limit 1',
        [saleId, storeId],
      );
      return current.rows[0];
    };

    const existing = await readInvoiceNo();
    if (!existing) throw new NotFoundException('Sale not found');
    if (existing.invoice_no) return existing.invoice_no;

    const settingsResult = await this.pool.query<{ invoice_prefix: string | null }>(
      'select invoice_prefix from store.store_settings where store_id = $1 limit 1',
      [storeId],
    );
    const prefix = (settingsResult.rows[0]?.invoice_prefix ?? '').trim().toUpperCase() || 'INV';

    // The per-store unique index on (store_id, invoice_no) is the race backstop:
    // on conflict the count re-runs and the next sequence number is tried.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const countResult = await this.pool.query<{ count: string }>(
        'select count(*)::text as count from sales.sales where store_id = $1 and invoice_no is not null',
        [storeId],
      );
      const seq = Number(countResult.rows[0]?.count ?? '0') + 1 + attempt;
      const invoiceNo = `${prefix}-${String(seq).padStart(4, '0')}`;

      const updateResult = await this.pool.query<{ invoice_no: string }>(
        `update sales.sales
         set invoice_no = $3,
           sale_date = coalesce(sale_date, created_at::date),
           updated_at = now()
         where id = $1 and store_id = $2 and invoice_no is null
         returning invoice_no`,
        [saleId, storeId, invoiceNo],
      );
      if (updateResult.rows[0]) return updateResult.rows[0].invoice_no;

      const raced = await readInvoiceNo();
      if (raced?.invoice_no) return raced.invoice_no;
    }

    throw new Error('Could not assign an invoice number. Please try again.');
  }

  private readonly REFUND_APPROVAL_THRESHOLD = 5000;

  async returnSale(
    saleId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      reason: string;
      refundAmount: number;
      refundMethod?: string;
      refundReference?: string;
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

    // Check if this return needs approval (refund >= threshold)
    const needsApproval = payload.refundAmount >= this.REFUND_APPROVAL_THRESHOLD;

    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const saleResult = await client.query<{
        id: string;
        store_id: string;
        location_id: string;
        sale_no: string;
        total_amount: string;
        payment_status: string;
      }>(
        `
          select id, store_id, location_id, sale_no, total_amount, payment_status
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

      const returnStatus = needsApproval ? 'pending_approval' : 'processed';

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
            refund_method,
            refund_reference,
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
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning id
        `,
        [storeId, saleId, userId, payload.reason, payload.refundAmount, payload.refundMethod ?? null, payload.refundReference ?? null, returnStatus],
      );

      const saleReturnId = returnResult.rows[0].id;

      // Always insert return items (needed for approval/rejection too)
      for (const item of payload.items) {
        const saleItemResult = await client.query<{ sku_id: string; product_id: string | null; unit_cost: string }>(
          `
            select si.sku_id, sk.product_id, si.unit_cost
            from sales.sale_items si
            left join catalog.skus sk on sk.id = si.sku_id
            where si.id = $1
              and si.sale_id = $2
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

        // Only restock inventory immediately if NOT pending approval
        if (!needsApproval && item.restockToInventory) {
          await this.upsertBalance(client, storeId, sale.location_id, saleItem.sku_id, item.qty);
          const serialIds = await this.revertReturnSerials(client, storeId, item.saleItemId, sale.location_id, item.qty);
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
            deviceSerialId: serialIds.length === 1 ? serialIds[0] : null,
          });
          await this.appendRestockBatch(
            client,
            storeId,
            saleItem.sku_id,
            saleItem.product_id,
            item.qty,
            Number(saleItem.unit_cost ?? 0),
            `RET-${saleReturnId.slice(0, 8)}-${saleItem.sku_id.slice(0, 8)}`,
          );
        }
      }

      if (needsApproval) {
        // For pending approval: save changes (return record + items), don't update sale yet
        await client.query('commit');

        await this.auditService.recordStoreAction({
          storeId,
          actorUserId: userId,
          actionCode: 'sale.return.request',
          resourceType: 'sale_return',
          resourceId: saleReturnId,
          after: {
            saleId,
            saleNo: sale.sale_no,
            refundAmount: payload.refundAmount,
            status: 'pending_approval',
            itemCount: payload.items.length,
          },
        });

        return {
          saleReturn: {
            id: saleReturnId,
            refundAmount: payload.refundAmount,
            saleNo: sale.sale_no,
            status: 'pending_approval',
            message: 'This return requires owner or manager approval before it is processed.',
          },
          refundReceipt: null,
          needsApproval: true,
        };
      }

      // Process immediately (existing logic)
      // Compute total returned amount for this sale
      const returnedResult = await client.query<{ total_returned: string }>(
        `
          select coalesce(sum(refund_amount), 0)::text as total_returned
          from sales.sale_returns
          where sale_id = $1
            and status = 'processed'
        `,
        [saleId],
      );
      const totalReturned = Number(returnedResult.rows[0]?.total_returned ?? 0);
      const totalAmount = Number(sale.total_amount);
      const isFullRefund = totalReturned >= totalAmount;

      let newPaymentStatus: string;
      if (isFullRefund) {
        newPaymentStatus = 'refunded';
      } else if (sale.payment_status === 'paid' || sale.payment_status === 'partial') {
        newPaymentStatus = 'partial';
      } else {
        newPaymentStatus = sale.payment_status;
      }

      let newStatus: string;
      if (isFullRefund) {
        newStatus = 'refunded';
      } else {
        newStatus = 'returned_partially';
      }

      await client.query(
        `
          update sales.sales
          set
            payment_status = $2,
            status = $3,
            fulfillment_status = 'returned',
            returned_amount = $4,
            updated_at = now()
          where id = $1
        `,
        [saleId, newPaymentStatus, newStatus, totalReturned],
      );

      await client.query('commit');

      const refundReceipt = await this.buildRefundReceipt(saleId, saleReturnId, storeId);

      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'sale.return',
        resourceType: 'sale_return',
        resourceId: saleReturnId,
        after: {
          saleId,
          saleNo: sale.sale_no,
          refundAmount: payload.refundAmount,
          totalReturned,
          paymentStatus: newPaymentStatus,
          status: newStatus,
          itemCount: payload.items.length,
        },
      });

      return {
        saleReturn: {
          id: saleReturnId,
          refundAmount: payload.refundAmount,
          totalReturned,
          saleNo: sale.sale_no,
          paymentStatus: newPaymentStatus,
          status: newStatus,
        },
        refundReceipt,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingReturnApprovals(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query<any>(
      `
        select
          sr.id,
          sr.sale_id,
          sr.refund_amount,
          sr.reason,
          sr.created_at,
          s.sale_no,
          s.customer_name,
          s.customer_phone,
          up.full_name as requested_by_name,
          json_agg(
            json_build_object(
              'productName', si.product_name_snapshot,
              'skuCode', si.sku_code_snapshot,
              'qty', sri.qty,
              'restockToInventory', sri.restock_to_inventory,
              'lineRefundAmount', sri.line_refund_amount
            )
          ) as return_items
        from sales.sale_returns sr
        join sales.sales s on s.id = sr.sale_id
        left join identity.user_profiles up on up.user_id = sr.processed_by
        left join sales.sale_return_items sri on sri.sale_return_id = sr.id
        left join sales.sale_items si on si.id = sri.sale_item_id
        where sr.store_id = $1
          and sr.status = 'pending_approval'
        group by sr.id, sr.sale_id, sr.refund_amount, sr.reason, sr.created_at, s.sale_no, s.customer_name, s.customer_phone, up.full_name
        order by sr.created_at asc
      `,
      [storeId],
    );
    return { returnRequests: result.rows };
  }

  async approveReturn(
    returnId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    decisionNote?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      // Lock and validate the return request
      const returnResult = await client.query<any>(
        `
          select sr.*, s.location_id, s.sale_no, s.total_amount, s.payment_status
          from sales.sale_returns sr
          join sales.sales s on s.id = sr.sale_id
          where sr.id = $1
            and sr.store_id = $2
            and sr.status = 'pending_approval'
          limit 1
          for update
        `,
        [returnId, storeId],
      );

      const returnData = returnResult.rows[0];
      if (!returnData) {
        throw new NotFoundException('Pending return request not found');
      }

      // Get return items to restock inventory
      const itemsResult = await client.query<any>(
        `
          select sri.*, si.sku_id, sk.product_id, si.unit_cost
          from sales.sale_return_items sri
          join sales.sale_items si on si.id = sri.sale_item_id
          left join catalog.skus sk on sk.id = si.sku_id
          where sri.sale_return_id = $1
        `,
        [returnId],
      );

      // Restock inventory for items flagged for restock
      for (const item of itemsResult.rows) {
        if (item.restock_to_inventory) {
          await this.upsertBalance(client, storeId, returnData.location_id, item.sku_id, item.qty);
          const serialIds = await this.revertReturnSerials(client, storeId, item.sale_item_id, returnData.location_id, item.qty);
          await this.insertLedger(client, {
            storeId,
            locationId: returnData.location_id,
            skuId: item.sku_id,
            movementType: 'return',
            qtyDelta: item.qty,
            referenceType: 'sale_return',
            referenceId: returnId,
            note: returnData.reason + (decisionNote ? ' — ' + decisionNote : ''),
            actorId: userId,
            deviceSerialId: serialIds.length === 1 ? serialIds[0] : null,
          });
          await this.appendRestockBatch(
            client,
            storeId,
            item.sku_id,
            item.product_id,
            item.qty,
            Number(item.unit_cost ?? 0),
            `RET-${returnId.slice(0, 8)}-${item.sku_id.slice(0, 8)}`,
          );
        }
      }

      // Compute total returned amount for this sale
      const returnedResult = await client.query<{ total_returned: string }>(
        `
          select coalesce(sum(refund_amount), 0)::text as total_returned
          from sales.sale_returns
          where sale_id = $1
            and status = 'processed'
        `,
        [returnData.sale_id],
      );
      // Add this return's amount to the total
      const previousReturned = Number(returnedResult.rows[0]?.total_returned ?? 0);
      const totalReturned = previousReturned + Number(returnData.refund_amount);
      const totalAmount = Number(returnData.total_amount);
      const isFullRefund = totalReturned >= totalAmount;

      let newPaymentStatus: string;
      if (isFullRefund) {
        newPaymentStatus = 'refunded';
      } else if (returnData.payment_status === 'paid' || returnData.payment_status === 'partial') {
        newPaymentStatus = 'partial';
      } else {
        newPaymentStatus = returnData.payment_status;
      }

      let newStatus: string;
      if (isFullRefund) {
        newStatus = 'refunded';
      } else {
        newStatus = 'returned_partially';
      }

      // Update return status to processed
      await client.query(
        `update sales.sale_returns set status = 'processed', updated_at = now() where id = $1`,
        [returnId],
      );

      // Update sale record
      await client.query(
        `
          update sales.sales
          set
            payment_status = $2,
            status = $3,
            fulfillment_status = 'returned',
            returned_amount = $4,
            updated_at = now()
          where id = $1
        `,
        [returnData.sale_id, newPaymentStatus, newStatus, totalReturned],
      );

      await client.query('commit');

      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'sale.return.approve',
        resourceType: 'sale_return',
        resourceId: returnId,
        after: {
          saleId: returnData.sale_id,
          saleNo: returnData.sale_no,
          refundAmount: Number(returnData.refund_amount),
          totalReturned,
          paymentStatus: newPaymentStatus,
          status: newStatus,
          decisionNote: decisionNote ?? null,
        },
      });

      return {
        ok: true,
        message: 'Return approved and processed.',
        saleNo: returnData.sale_no,
        refundAmount: Number(returnData.refund_amount),
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectReturn(
    returnId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    decisionNote?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query(
      `
        update sales.sale_returns
        set status = 'rejected', updated_at = now(), note = case when $3::text is not null then concat_ws(E'\n', note, $3::text) else note end
        where id = $1
          and store_id = $2
          and status = 'pending_approval'
        returning id, sale_id, refund_amount
      `,
      [returnId, storeId, decisionNote ?? null],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException('Pending return request not found');
    }

    await this.auditService.recordStoreAction({
      storeId,
      actorUserId: userId,
      actionCode: 'sale.return.reject',
      resourceType: 'sale_return',
      resourceId: returnId,
      after: {
        status: 'rejected',
        decisionNote: decisionNote ?? null,
      },
    });

    return {
      ok: true,
      message: 'Return request rejected.',
      refundAmount: Number(updated.refund_amount),
    };
  }

  async getReturnsReport(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { fromDate?: string; toDate?: string; month?: string } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    // Determine date range (same logic as getSalesReport)
    let startDate: string;
    let endDate: string;

    if (filters.month) {
      const [year, monthNum] = filters.month.split('-');
      startDate = `${year}-${monthNum}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      endDate = `${year}-${monthNum}-${lastDay}`;
    } else if (filters.fromDate && filters.toDate) {
      startDate = filters.fromDate;
      endDate = filters.toDate;
    } else {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    }

    const result = await this.pool.query<any>(
      `
        select
          sr.id as return_id,
          sr.sale_id,
          s.sale_no,
          sr.reason,
          sr.refund_amount,
          sr.status as return_status,
          sr.created_at as return_date,
          up.full_name as processed_by_name,
          s.customer_name,
          s.customer_phone,
          json_agg(
            json_build_object(
              'product_name', si.product_name_snapshot,
              'sku_code', si.sku_code_snapshot,
              'qty', sri.qty,
              'line_refund_amount', sri.line_refund_amount
            )
          ) as items
        from sales.sale_returns sr
        join sales.sales s on s.id = sr.sale_id
        left join identity.user_profiles up on up.user_id = sr.processed_by
        left join sales.sale_return_items sri on sri.sale_return_id = sr.id
        left join sales.sale_items si on si.id = sri.sale_item_id
        where sr.store_id = $1
          and sr.created_at::date between $2::date and $3::date
        group by sr.id, sr.sale_id, s.sale_no, sr.reason, sr.refund_amount, sr.status, sr.created_at, up.full_name, s.customer_name, s.customer_phone
        order by sr.created_at desc
      `,
      [storeId, startDate, endDate],
    );

    const returns = result.rows;

    // Summary statistics
    const totalRefunds = returns.reduce((sum, r) => sum + Number(r.refund_amount ?? 0), 0);
    const totalReturnCount = returns.length;

    return {
      period: {
        fromDate: startDate,
        toDate: endDate,
        month: filters.month || null,
      },
      summary: {
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        totalReturns: totalReturnCount,
      },
      returns: returns.map((r: any) => ({
        returnId: r.return_id,
        saleId: r.sale_id,
        saleNo: r.sale_no,
        reason: r.reason,
        refundAmount: Number(r.refund_amount ?? 0),
        returnStatus: r.return_status,
        returnDate: r.return_date,
        processedByName: r.processed_by_name,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        items: Array.isArray(r.items) ? r.items.filter((i: any) => i.product_name) : [],
      })),
    };
  }

  async getSaleReturns(saleId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const returnsResult = await this.pool.query(
      `
        select
          sr.id,
          sr.sale_id,
          sr.reason,
          sr.refund_amount,
          sr.status,
          sr.created_at,
          up.full_name as processed_by_name,
          json_agg(
            json_build_object(
              'id', sri.id,
              'saleItemId', sri.sale_item_id,
              'qty', sri.qty,
              'restockToInventory', sri.restock_to_inventory,
              'lineRefundAmount', sri.line_refund_amount,
              'productName', si.product_name_snapshot,
              'skuCode', si.sku_code_snapshot
            )
          ) as items
        from sales.sale_returns sr
        left join identity.user_profiles up on up.user_id = sr.processed_by
        left join sales.sale_return_items sri on sri.sale_return_id = sr.id
        left join sales.sale_items si on si.id = sri.sale_item_id
        where sr.sale_id = $1
          and sr.store_id = $2
        group by sr.id, sr.sale_id, sr.reason, sr.refund_amount, sr.status, sr.created_at, up.full_name
        order by sr.created_at desc
      `,
      [saleId, storeId],
    );

    return { returns: returnsResult.rows };
  }

  private async buildRefundReceipt(saleId: string, returnId: string, storeId: string) {
    const { sale, items } = await this.getSaleAggregate(saleId, storeId);

    const paymentResult = await this.pool.query<any>(
      `select id, payment_method, gateway_provider, amount, reference_no, status, paid_at
       from sales.sale_payments
       where sale_id = $1
       order by created_at asc`,
      [saleId],
    );
    const paymentRows: any[] = paymentResult.rows ?? [];

    const returnResult = await this.pool.query<any>(
      `
        select
          sr.*,
          up.full_name as processed_by_name,
          json_agg(
            json_build_object(
              'id', sri.id,
              'saleItemId', sri.sale_item_id,
              'qty', sri.qty,
              'restockToInventory', sri.restock_to_inventory,
              'lineRefundAmount', sri.line_refund_amount,
              'productName', si.product_name_snapshot,
              'skuCode', si.sku_code_snapshot
            )
          ) as return_items
        from sales.sale_returns sr
        left join identity.user_profiles up on up.user_id = sr.processed_by
        left join sales.sale_return_items sri on sri.sale_return_id = sr.id
        left join sales.sale_items si on si.id = sri.sale_item_id
        where sr.id = $1
          and sr.store_id = $2
        group by sr.id, up.full_name
        limit 1
      `,
      [returnId, storeId],
    );

    const returnData = returnResult.rows[0];
    if (!returnData) return null;

    const storeResult = await this.pool.query(
      'select s.name, s.logo_url, s.phone, s.email, s.address_text, ss.receipt_footer, ss.receipt_type from store.stores s left join store.store_settings ss on ss.store_id = s.id where s.id = $1 limit 1',
      [storeId],
    );
    const store = storeResult.rows[0] ?? {};

    return {
      type: 'refund',
      returnId: returnData.id,
      saleId: sale.id,
      saleNo: sale.sale_no,
      reason: returnData.reason,
      refundAmount: Number(returnData.refund_amount),
      refundMethod: returnData.refund_method ?? null,
      refundReference: returnData.refund_reference ?? null,
      processedAt: returnData.created_at,
      processedByName: returnData.processed_by_name,
      store: {
        name: store.name ?? null,
        logoUrl: store.logo_url ?? null,
        phone: store.phone ?? null,
        email: store.email ?? null,
        address: store.address_text ?? null,
        footer: store.receipt_footer ?? null,
        receiptType: store.receipt_type ?? 'pos',
      },
      customer: {
        name: sale.customer_name ?? null,
        phone: sale.customer_phone ?? null,
        shopName: sale.customer_shop_name ?? null,
      },
      originalPayments: paymentRows.map((p: any) => ({
        paymentMethod: p.payment_method ?? null,
        amount: Number(p.amount ?? 0),
        status: p.status ?? null,
      })),
      returnItems: (returnData.return_items ?? []).map((ri: any) => ({
        productName: ri.productName ?? 'Item',
        skuCode: ri.skuCode ?? null,
        qty: Number(ri.qty ?? 0),
        restockToInventory: ri.restockToInventory ?? true,
        lineRefundAmount: Number(ri.lineRefundAmount ?? 0),
      })),
      totals: {
        originalTotal: Number(sale.total_amount ?? 0),
        refundAmount: Number(returnData.refund_amount),
        paidAmount: paymentRows.reduce(
          (sum: number, p: any) => sum + (p.status === 'paid' ? Number(p.amount ?? 0) : 0),
          0,
        ),
      },
      printedAt: new Date().toISOString(),
    };
  }

  private async reserveAndDeductInventory(
    client: PoolClient,
    storeId: string,
    locationId: string,
    skuId: string,
    qty: number,
    actorId: string,
    saleNo: string,
    reference?: { type: string; id: string | null },
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
      referenceType: reference?.type ?? 'sale',
      referenceId: reference?.id ?? null,
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
          select si.id, si.sku_id, si.product_name_snapshot, si.sku_code_snapshot,
            sk.variant_label, si.qty, si.unit_price, si.discount_amount, si.tax_amount, si.line_total
          from sales.sale_items si
          left join catalog.skus sk on sk.id = si.sku_id
          where si.sale_id = $1
          order by si.created_at asc
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
          ss.receipt_footer,
          ss.receipt_type,
          ss.invoice_prefix
        from store.stores s
        left join store.store_settings ss on ss.store_id = s.id
        where s.id = $1
        limit 1
      `,
      [storeId],
    );

    const store = storeResult.rows[0] ?? {};

    // Fetch seller name for receipt
    let preparedBy: string | null = null;
    if (sale.sold_by) {
      const userResult = await this.pool.query<{ full_name: string }>(
        'select up.full_name from identity.users u left join identity.user_profiles up on up.user_id = u.id where u.id = $1 limit 1',
        [sale.sold_by],
      );
      if (userResult.rows[0]) {
        preparedBy = userResult.rows[0].full_name;
      }
    }

    const paidAmount = payments.reduce(
      (sum, payment) => sum + (payment.status === 'paid' ? Number(payment.amount ?? 0) : 0),
      0,
    );
    const dueAmount = Math.max(Number(sale.total_amount ?? 0) - paidAmount, 0);

    // Look up exchange product name if this is an exchange sale
    const exchangeAmount = Number(sale.exchange_amount ?? 0);
    let exchangeInfo: Record<string, unknown> | null = null;
    if (sale.exchange_sku_id && exchangeAmount > 0) {
      const exchangeSkuResult = await this.pool.query(
        `
          select p.name as product_name, s.sku_code
          from catalog.skus s
          join catalog.products p on p.id = s.product_id
          where s.id = $1
          limit 1
        `,
        [sale.exchange_sku_id],
      );
      const exchangeSku = exchangeSkuResult.rows[0];
      if (exchangeSku) {
        exchangeInfo = {
          productName: exchangeSku.product_name ?? null,
          skuCode: exchangeSku.sku_code ?? null,
          amount: exchangeAmount,
        };
      }
    }

    const saleType = exchangeInfo && exchangeAmount > 0
      ? 'exchange'
      : dueAmount > 0
        ? 'due'
        : 'paid';

    const paymentTerms = payments.some((p) => p.payment_method === 'cod' && p.status !== 'refunded')
      ? 'cod'
      : sale.payment_status === 'paid'
        ? 'paid'
        : 'due';

    return {
      saleId: sale.id ?? null,
      saleNo: sale.sale_no ?? null,
      invoiceNo: sale.invoice_no ?? null,
      saleDate: sale.sale_date ?? null,
      paymentTerms,
      saleType,
      paymentStatus: sale.payment_status ?? null,
      dueDate: sale.due_date ?? null,
      note: sale.note ?? null,
      store: {
        name: store.name ?? null,
        logoUrl: store.logo_url ?? null,
        phone: store.phone ?? null,
        email: store.email ?? null,
        address: store.address_text ?? null,
        footer: store.receipt_footer ?? null,
        receiptType: store.receipt_type ?? 'pos',
      },
      customer: {
        name: sale.customer_name ?? null,
        phone: sale.customer_phone ?? null,
        email: sale.customer_email ?? null,
        shopName: sale.customer_shop_name ?? null,
        address: sale.customer_address ?? null,
      },
      items: (() => {
        const mapped = items.map((item) => ({
          name: item.product_name_snapshot ?? null,
          skuCode: item.sku_code_snapshot ?? null,
          variantLabel: item.variant_label ?? null,
          qty: Number(item.qty ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          discountAmount: Number(item.discount_amount ?? 0),
          taxAmount: Number(item.tax_amount ?? 0),
          lineTotal: Number(item.line_total ?? 0),
        }));
        if (exchangeInfo && exchangeAmount > 0) {
          (mapped as any[]).push({
            name: (exchangeInfo.productName ?? 'Exchange') + ' (Trade-in)',
            skuCode: exchangeInfo.skuCode ?? null,
            qty: 1,
            unitPrice: exchangeAmount,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: -exchangeAmount,
            isExchangeItem: true,
          });
        }
        return mapped;
      })(),
      totals: {
        subtotal: Number(sale.subtotal_amount ?? 0) - (exchangeInfo && exchangeAmount > 0 ? exchangeAmount : 0),
        discount: Number(sale.discount_amount ?? 0),
        vat: Number(sale.vat_amount ?? 0),
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
      exchange: exchangeInfo,
      preparedBy,
      amountInWords: this.numberToWords(Number(sale.total_amount ?? 0)),
      printedAt: new Date().toISOString(),
    };
  }

  private async getSkuSnapshot(client: PoolClient, skuId: string, storeId: string) {
    const result = await client.query<{
      sku_code: string;
      product_name: string;
      variant_label: string | null;
    }>(
      `
        select
          s.sku_code,
          p.name as product_name,
          s.variant_label
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

  /**
   * FIFO: consume quantity from the oldest active stock batches and return the
   * weighted-average unit cost of what was consumed. Falls back to the latest
   * catalog cost price for legacy stock without batch layers.
   */
  private async consumeFifoBatches(
    client: PoolClient,
    storeId: string,
    skuId: string,
    qty: number,
  ): Promise<number> {
    const batches = await client.query<{ id: string; current_quantity: string; unit_cost: string }>(
      `select id, current_quantity, unit_cost
       from inventory.stock_batches
       where store_id = $1
         and sku_id = $2
         and status = 'active'
         and current_quantity > 0
       order by received_date asc nulls last, created_at asc
       for update`,
      [storeId, skuId],
    );
    let remaining = qty;
    let totalCost = 0;
    for (const batch of batches.rows) {
      if (remaining <= 0) break;
      const take = Math.min(Number(batch.current_quantity), remaining);
      const newQty = Number(batch.current_quantity) - take;
      await client.query(
        `update inventory.stock_batches
         set current_quantity = $2,
             status = case when $3 <= 0 then 'depleted' else status end,
             updated_at = now()
         where id = $1`,
        [batch.id, newQty, newQty],
      );
      totalCost += take * Number(batch.unit_cost);
      remaining -= take;
    }
    if (remaining > 0) {
      const fallback = await client.query<{ cost_price: string | null }>(
        `select cost_price from catalog.prices
         where sku_id = $1
         order by effective_from desc, created_at desc
         limit 1`,
        [skuId],
      );
      totalCost += remaining * Number(fallback.rows[0]?.cost_price ?? 0);
    }
    return qty > 0 ? Math.round((totalCost / qty) * 100) / 100 : 0;
  }

  /** Append a FIFO batch layer when stock re-enters (returns / exchange trade-ins). */
  private async appendRestockBatch(
    client: PoolClient,
    storeId: string,
    skuId: string,
    productId: string | null,
    qty: number,
    unitCost: number,
    batchCode: string,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const tenantResult = await client.query<{ tenant_id: string }>(
      'select tenant_id from store.stores where id = $1 limit 1',
      [storeId],
    );
    await client.query(
      `insert into inventory.stock_batches (id, tenant_id, store_id, batch_code, product_id, sku_id, received_date, received_quantity, current_quantity, unit_cost, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::date, $7, $7, $8, 'active', now(), now())
       on conflict (store_id, batch_code) do update set
         received_quantity = inventory.stock_batches.received_quantity + $7,
         current_quantity = inventory.stock_batches.current_quantity + $7,
         updated_at = now()`,
      [tenantResult.rows[0]?.tenant_id, storeId, batchCode, productId, skuId, today, qty, unitCost],
    );
  }

  /**
   * Flip the serialized units sold on a sale item back to 'returned' at the given
   * location (up to qty units) and void their active warranties.
   * Returns the affected serial ids (oldest first).
   */
  private async revertReturnSerials(
    client: PoolClient,
    storeId: string,
    saleItemId: string,
    locationId: string,
    qty: number,
  ): Promise<string[]> {
    const serials = await client.query<{ id: string }>(
      `select ds.id
       from inventory.device_serial_sales dss
       join inventory.device_serials ds on ds.id = dss.device_serial_id
       where dss.sale_item_id = $1
         and ds.store_id = $2
         and ds.status = 'sold'
       order by ds.received_date asc nulls last, ds.created_at asc
       limit $3`,
      [saleItemId, storeId, Math.ceil(qty)],
    );
    const serialIds = serials.rows.map((row) => row.id);
    for (const serialId of serialIds) {
      await client.query(
        `update inventory.device_serials
         set status = 'returned', current_location_id = $2, updated_at = now()
         where id = $1`,
        [serialId, locationId],
      );
      await client.query(
        `update sales.sale_warranties
         set status = 'voided', updated_at = now()
         where device_serial_id = $1 and status = 'active'`,
        [serialId],
      );
    }
    return serialIds;
  }

  private async generateExchangeNumber(client: PoolClient, storeId: string): Promise<string> {
    const countResult = await client.query<{ count: string }>(
      'select count(*)::text as count from sales.sale_exchanges where store_id = $1',
      [storeId],
    );
    const next = Number(countResult.rows[0]?.count ?? 0) + 1;
    return `EXC-${next.toString().padStart(6, '0')}`;
  }

  /** Per sale item: qty still returnable (sale qty minus processed/pending returns and completed exchanges). */
  private async getSaleRemainingQty(
    client: PoolClient | Pool,
    saleId: string,
  ): Promise<Map<string, { remainingQty: number; soldQty: number }>> {
    const result = await client.query<{ id: string; qty: string; returned: string }>(
      `
        select si.id, si.qty,
          coalesce((
            select sum(ri.qty)
            from sales.sale_return_items ri
            join sales.sale_returns r on r.id = ri.sale_return_id
            where ri.sale_item_id = si.id and r.status in ('processed', 'pending_approval')
          ), 0) + coalesce((
            select sum(ei.qty)
            from sales.sale_exchange_items ei
            join sales.sale_exchanges e on e.id = ei.sale_exchange_id
            where ei.sale_item_id = si.id and ei.side = 'returned' and e.status = 'completed'
          ), 0))::text as returned
        from sales.sale_items si
        where si.sale_id = $1
      `,
      [saleId],
    );
    const map = new Map<string, { remainingQty: number; soldQty: number }>();
    for (const row of result.rows) {
      const soldQty = Number(row.qty);
      map.set(row.id, { remainingQty: soldQty - Number(row.returned), soldQty });
    }
    return map;
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
      deviceSerialId?: string | null;
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
          device_serial_id,
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
          $10,
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
        payload.deviceSerialId ?? null,
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


  async createExchangeItem(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      productName: string;
      categoryName?: string;
      brandName?: string;
      costPrice: number;
      salePrice: number;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const tenantResult = await client.query<{ tenant_id: string; store_code: string }>(
        'select tenant_id, store_code from store.stores where id = $1 limit 1', [storeId],
      );
      const tenantId = tenantResult.rows[0].tenant_id;

      // Resolve category/brand by name
      let categoryId: string | null = null;
      if (payload.categoryName) {
        const result = await client.query<{ id: string }>(
          'select id from catalog.categories where store_id = $1 and name = $2 limit 1',
          [storeId, payload.categoryName],
        );
        categoryId = result.rows[0]?.id ?? null;
      }

      let brandId: string | null = null;
      if (payload.brandName) {
        const result = await client.query<{ id: string }>(
          'select id from catalog.brands where store_id = $1 and name = $2 limit 1',
          [storeId, payload.brandName],
        );
        brandId = result.rows[0]?.id ?? null;
      }

      const productName = payload.productName.trim();
      const baseCode = productName.replace(/[^A-Za-z0-9]/g, '-').toUpperCase().slice(0, 28) || 'EXCHANGE';
      const productCode = `${baseCode}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const ts = Date.now();
      const barcode = '2' + String(ts).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

      // Create exchange product
      const productResult = await client.query<{ id: string }>(
        `insert into catalog.products (id, tenant_id, store_id, product_code, name, category_id, brand_id, has_variants, variant_mode, is_trackable, product_type, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, 'none', false, 'exchange', 'active', now(), now()) returning id`,
        [tenantId, storeId, productCode, productName, categoryId, brandId],
      );
      const productId = productResult.rows[0].id;

      // Create SKU
      const skuCode = `EXC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const skuResult = await client.query<{ id: string }>(
        `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
        [tenantId, storeId, productId, skuCode, barcode],
      );

      // Create price entry
      await client.query(
        `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
        [tenantId, storeId, skuResult.rows[0].id, String(payload.salePrice), String(payload.costPrice)],
      );

      await client.query('commit');

      return { skuId: skuResult.rows[0].id, skuCode };
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

  private numberToWords(amount: number): string {
    if (amount <= 0) return 'Zero Taka Only';
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convertBelowThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return units[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
      return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertBelowThousand(n % 100) : '');
    };
    const whole = Math.floor(amount);
    const frac = Math.round((amount - whole) * 100);
    let result = '';
    const billions = Math.floor(whole / 1000000000);
    const millions = Math.floor((whole % 1000000000) / 1000000);
    const thousands = Math.floor((whole % 1000000) / 1000);
    const remainder = whole % 1000;
    if (billions) result += convertBelowThousand(billions) + ' Billion ';
    if (millions) result += convertBelowThousand(millions) + ' Million ';
    if (thousands) result += convertBelowThousand(thousands) + ' Thousand ';
    if (remainder) result += convertBelowThousand(remainder);
    result = result.trim() + ' Taka';
    if (frac > 0) result += ' ' + convertBelowThousand(frac) + ' Paisa';
    return result + ' Only';
  }

  // ==================== Exchange ====================

  async createExchange(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      originalSaleId: string;
      locationId?: string;
      registerId?: string;
      shiftId?: string;
      note?: string;
      returnedItems: Array<{
        saleItemId: string;
        qty: number;
        restock: boolean;
        serialIds?: string[];
      }>;
      newItems: Array<{
        skuId: string;
        qty: number;
        unitPrice: number;
        discountAmount: number;
        taxAmount: number;
        serialIds?: string[];
      }>;
      payments: Array<{
        paymentMethod: string;
        gatewayProvider?: string;
        amount: number;
        referenceNo?: string;
      }>;
      refundMethod?: string;
      refundReference?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      // 1. Lock the original sale
      const saleResult = await client.query<any>(
        `select id, tenant_id, store_id, location_id, sale_no, customer_id, customer_name,
                customer_phone, customer_email, customer_shop_name, customer_address,
                total_amount, paid_amount, payment_status, status
         from sales.sales
         where id = $1 and store_id = $2
         limit 1
         for update`,
        [payload.originalSaleId, storeId],
      );
      const sale = saleResult.rows[0];
      if (!sale) throw new NotFoundException('Original sale not found');
      if (sale.status === 'cancelled' || sale.status === 'refunded') {
        throw new ForbiddenException(`Sale is ${sale.status} and cannot be exchanged`);
      }
      const paidAmount = Number(sale.paid_amount ?? 0);
      const totalAmount = Number(sale.total_amount ?? 0);
      const paidRatio = totalAmount > 0 ? Math.min(paidAmount / totalAmount, 1) : 1;
      if (paidRatio <= 0) {
        throw new ForbiddenException('Nothing has been paid on the original sale — exchanges require a paid sale');
      }

      const exchangeLocationId = payload.locationId ?? sale.location_id;

      // 2. Validate returned items and compute credit
      const remainingMap = await this.getSaleRemainingQty(client, sale.id);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const returnedLines: Array<Record<string, any>> = [];
      let tradeInCredit = 0;
      for (const item of payload.returnedItems) {
        const remaining = remainingMap.get(item.saleItemId);
        if (!remaining) throw new NotFoundException(`Sale item ${item.saleItemId} not found on the original sale`);
        if (item.qty > remaining.remainingQty + 1e-9) {
          throw new ForbiddenException(`Cannot return ${item.qty} of an item — only ${remaining.remainingQty} returnable`);
        }
        const lineInfo = await client.query<any>(
          `select si.sku_id, si.qty as sold_qty, si.unit_price, si.discount_amount, si.tax_amount,
                  si.product_name_snapshot, si.sku_code_snapshot, sk.product_id, sk.requires_serial, sk.requires_imei
           from sales.sale_items si
           left join catalog.skus sk on sk.id = si.sku_id
           where si.id = $1 and si.sale_id = $2
           limit 1`,
          [item.saleItemId, sale.id],
        );
        const line = lineInfo.rows[0];
        if (!line) throw new NotFoundException('Sale item not found');
        const soldQty = Number(line.sold_qty);
        const share = soldQty > 0 ? item.qty / soldQty : 1;
        const lineReturnTotal = round2(item.qty * Number(line.unit_price) - Number(line.discount_amount) * share + Number(line.tax_amount) * share);
        const lineCredit = round2(lineReturnTotal * paidRatio);

        let serialIds: string[] = [];
        if (line.requires_serial || line.requires_imei) {
          const requested = item.serialIds ?? [];
          if (requested.length !== Math.ceil(item.qty)) {
            throw new ForbiddenException(`Select ${Math.ceil(item.qty)} serial(s) for the returned device`);
          }
          const owned = await client.query<{ id: string }>(
            `select ds.id
             from inventory.device_serial_sales dss
             join inventory.device_serials ds on ds.id = dss.device_serial_id
             where dss.sale_item_id = $1 and ds.id = any($2::uuid[]) and ds.status = 'sold' for update`,
            [item.saleItemId, requested],
          );
          if (owned.rows.length !== requested.length) {
            throw new ForbiddenException('Returned serials do not match the units sold on this sale');
          }
          serialIds = owned.rows.map((r) => r.id);
        }

        tradeInCredit += lineCredit;
        returnedLines.push({ item, line, lineCredit, serialIds });
      }
      tradeInCredit = round2(tradeInCredit);

      // 3. Validate new items and compute totals
      const newLines: Array<Record<string, any>> = [];
      let newItemsTotal = 0;
      for (const item of payload.newItems) {
        const sku = await this.getSkuSnapshot(client, item.skuId, storeId);
        const skuInfo = await client.query<any>(
          `select sk.requires_serial, sk.requires_imei, sk.product_id from catalog.skus sk where sk.id = $1 and sk.store_id = $2 limit 1`,
          [item.skuId, storeId],
        );
        const skuRow = skuInfo.rows[0];
        if (!skuRow) throw new NotFoundException(`SKU ${item.skuId} not found`);

        let serialIds: string[] = [];
        if (skuRow.requires_serial || skuRow.requires_imei) {
          const requested = item.serialIds ?? [];
          if (requested.length !== Math.ceil(item.qty)) {
            throw new ForbiddenException(`Select ${Math.ceil(item.qty)} serial(s) for the new device`);
          }
          const available = await client.query<{ id: string }>(
            `select id from inventory.device_serials
             where id = any($1::uuid[]) and sku_id = $2 and store_id = $3 and status = 'in_stock'
             for update`,
            [requested, item.skuId, storeId],
          );
          if (available.rows.length !== requested.length) {
            throw new ForbiddenException('One or more selected serials are not in stock');
          }
          serialIds = available.rows.map((r) => r.id);
        }

        const lineTotal = round2(item.qty * item.unitPrice - item.discountAmount + item.taxAmount);
        newItemsTotal += lineTotal;
        newLines.push({ item, sku, productId: skuRow.product_id, lineTotal, serialIds });
      }
      newItemsTotal = round2(newItemsTotal);

      const difference = round2(newItemsTotal - tradeInCredit);

      // 4. Settlement guard
      if (difference > 0.009) {
        const paid = payload.payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        if (Math.abs(paid - difference) > 0.009) {
          throw new ForbiddenException(`Payments must total the difference of ${difference.toFixed(2)}`);
        }
      } else if (difference < -0.009) {
        if (!payload.refundMethod) {
          throw new ForbiddenException('Refund method is required when the exchange results in a refund to the customer');
        }
        if (payload.refundMethod !== 'cash' && !payload.refundReference) {
          throw new ForbiddenException('A reference is required for non-cash refunds');
        }
      }

      // 5. Insert exchange header
      const exchangeNo = await this.generateExchangeNumber(client, storeId);
      const exchangeResult = await client.query<{ id: string }>(
        `insert into sales.sale_exchanges (
           tenant_id, store_id, exchange_no, original_sale_id,
           customer_id, customer_name, customer_phone, customer_email, customer_shop_name, customer_address,
           trade_in_credit, new_items_total, difference, payments,
           refund_method, refund_reference, status,
           location_id, register_id, shift_id, processed_by, note
         )
         select s.tenant_id, s.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, 'completed', $16, $17, $18, $19, $20
         from store.stores s where s.id = $1
         returning id`,
        [
          storeId, exchangeNo, sale.id,
          sale.customer_id ?? null, sale.customer_name ?? null, sale.customer_phone ?? null,
          sale.customer_email ?? null, sale.customer_shop_name ?? null, sale.customer_address ?? null,
          tradeInCredit, newItemsTotal, difference,
          JSON.stringify(payload.payments ?? []),
          payload.refundMethod ?? null, payload.refundReference ?? null,
          exchangeLocationId, payload.registerId ?? null, payload.shiftId ?? null, userId, payload.note ?? null,
        ],
      );
      const exchangeId = exchangeResult.rows[0].id;

      // 6. Returned side
      for (const { item, line, lineCredit, serialIds } of returnedLines) {
        const firstSerial = serialIds.length === 1 ? serialIds[0] : null;
        const serialRows = serialIds.length
          ? await client.query<any>(`select id, serial_number, imei_number from inventory.device_serials where id = any($1::uuid[])`, [serialIds])
          : { rows: [] as any[] };
        const serialInfo = serialRows.rows[0];
        await client.query(
          `insert into sales.sale_exchange_items (
             sale_exchange_id, side, sku_id, sale_item_id, device_serial_id,
             product_name_snapshot, sku_code_snapshot, serial_number, imei_number,
             qty, unit_price, discount_amount, tax_amount, line_total, line_credit, restock, unit_cost
           ) values ($1, 'returned', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            exchangeId, line.sku_id, item.saleItemId, firstSerial,
            line.product_name_snapshot, line.sku_code_snapshot,
            serialInfo?.serial_number ?? null, serialInfo?.imei_number ?? null,
            item.qty, line.unit_price,
            round2(Number(line.discount_amount) * (Number(line.sold_qty) > 0 ? item.qty / Number(line.sold_qty) : 1)),
            round2(Number(line.tax_amount) * (Number(line.sold_qty) > 0 ? item.qty / Number(line.sold_qty) : 1)),
            round2(item.qty * Number(line.unit_price)),
            lineCredit, item.restock, Number(line.unit_cost ?? 0),
          ],
        );

        if (item.restock) {
          await this.upsertBalance(client, storeId, exchangeLocationId, line.sku_id, item.qty);
          for (const serialId of serialIds) {
            await client.query(
              `update inventory.device_serials set status = 'returned', current_location_id = $2, updated_at = now() where id = $1`,
              [serialId, exchangeLocationId],
            );
            await client.query(
              `update sales.sale_warranties set status = 'voided', updated_at = now() where device_serial_id = $1 and status = 'active'`,
              [serialId],
            );
          }
          await this.insertLedger(client, {
            storeId,
            locationId: exchangeLocationId,
            skuId: line.sku_id,
            movementType: 'return',
            qtyDelta: item.qty,
            referenceType: 'sale_exchange',
            referenceId: exchangeId,
            note: `Exchange ${exchangeNo} trade-in`,
            actorId: userId,
            deviceSerialId: firstSerial,
          });
          await this.appendRestockBatch(
            client, storeId, line.sku_id, line.product_id, item.qty,
            Number(line.unit_cost ?? 0),
            `EXC-${exchangeId.slice(0, 8)}-${line.sku_id.slice(0, 8)}`,
          );
        }
      }

      // 7. New side
      let newSideCost = 0;
      for (const { item, sku, productId, lineTotal, serialIds } of newLines) {
        const skuTrackable = await client.query<any>(
          `select p.is_trackable from catalog.products p join catalog.skus s on s.product_id = p.id where s.id = $1 limit 1`,
          [item.skuId],
        );
        if (skuTrackable.rows[0]?.is_trackable !== false) {
          await this.reserveAndDeductInventory(
            client, storeId, exchangeLocationId, item.skuId, item.qty, userId,
            `Exchange ${exchangeNo}`, { type: 'sale_exchange', id: exchangeId },
          );
        }
        const unitCost = await this.consumeFifoBatches(client, storeId, item.skuId, item.qty);
        newSideCost += unitCost * item.qty;
        const firstSerial = serialIds.length === 1 ? serialIds[0] : null;
        const serialRows = serialIds.length
          ? await client.query<any>(`select id, serial_number, imei_number from inventory.device_serials where id = any($1::uuid[])`, [serialIds])
          : { rows: [] as any[] };
        const serialInfo = serialRows.rows[0];
        await client.query(
          `insert into sales.sale_exchange_items (
             sale_exchange_id, side, sku_id, device_serial_id,
             product_name_snapshot, sku_code_snapshot, serial_number, imei_number,
             qty, unit_price, discount_amount, tax_amount, line_total, unit_cost
           ) values ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            exchangeId, item.skuId, firstSerial,
            sku.product_name, sku.sku_code,
            serialInfo?.serial_number ?? null, serialInfo?.imei_number ?? null,
            item.qty, item.unitPrice, item.discountAmount, item.taxAmount, lineTotal, unitCost,
          ],
        );
        for (const serialId of serialIds) {
          await client.query(
            `update inventory.device_serials set status = 'sold', updated_at = now() where id = $1`,
            [serialId],
          );
        }
      }

      // 8. Update the original sale's returned amount (credit counts as returned value)
      const creditResult = await client.query<{ total: string }>(
        `select (
           coalesce((select sum(refund_amount) from sales.sale_returns where sale_id = $1 and status = 'processed'), 0)
           + coalesce((select sum(trade_in_credit) from sales.sale_exchanges where original_sale_id = $1 and status = 'completed'), 0)
         )::text as total`,
        [sale.id],
      );
      const totalReturned = Number(creditResult.rows[0]?.total ?? 0);
      if (totalReturned >= totalAmount && totalAmount > 0) {
        await client.query(
          `update sales.sales set returned_amount = $2, payment_status = 'refunded', status = 'refunded', fulfillment_status = 'returned', updated_at = now() where id = $1`,
          [sale.id, totalReturned],
        );
      } else {
        await client.query(
          `update sales.sales set returned_amount = $2, updated_at = now() where id = $1`,
          [sale.id, totalReturned],
        );
      }

      // 9. Outbox + receipt
      await client.query(
        `insert into integration.outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_payload, status, available_at, created_at)
         select gen_random_uuid(), s.tenant_id, 'sale_exchange', $2, 'exchange.completed', $3::jsonb, 'pending', now(), now()
         from store.stores s where s.id = $1`,
        [storeId, exchangeId, JSON.stringify({ exchangeId, exchangeNo, originalSaleId: sale.id, difference })],
      );

      await client.query('commit');

      const exchangeReceipt = await this.buildExchangeReceipt(exchangeId, storeId);

      await this.auditService.recordStoreAction({
        storeId,
        actorUserId: userId,
        actionCode: 'sale.exchange',
        resourceType: 'sale_exchange',
        resourceId: exchangeId,
        after: {
          exchangeNo,
          originalSaleId: sale.id,
          tradeInCredit,
          newItemsTotal,
          difference,
        },
      });

      return {
        exchange: {
          id: exchangeId,
          exchangeNo,
          originalSaleId: sale.id,
          tradeInCredit,
          newItemsTotal,
          difference,
          status: 'completed',
        },
        exchangeReceipt,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async lookupExchangesForExchange(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    selectors: { phone?: string; saleNo?: string; invoice?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const phone = selectors.phone?.trim() || null;
    const saleNo = selectors.saleNo?.trim() || null;
    const invoice = selectors.invoice?.trim() || null;
    if (!phone && !saleNo && !invoice) {
      throw new ForbiddenException('Provide a phone number, sale number, or invoice number');
    }

    const salesResult = await this.pool.query<any>(
      `select id, sale_no, invoice_no, customer_name, customer_phone, total_amount, paid_amount, payment_status, created_at
       from sales.sales
       where store_id = $1
         and status not in ('cancelled')
         and (
           ($2::varchar is not null and customer_phone = $2)
           or ($3::varchar is not null and sale_no ilike '%' || $3 || '%')
           or ($4::varchar is not null and (invoice_no ilike '%' || $4 or sale_no ilike '%' || $4))
         )
       order by created_at desc
       limit 20`,
      [storeId, phone, saleNo, invoice],
    );

    const client = this.pool;
    const sales = [];
    for (const sale of salesResult.rows) {
      const totalAmount = Number(sale.total_amount ?? 0);
      const paidRatio = totalAmount > 0 ? Math.min(Number(sale.paid_amount ?? 0) / totalAmount, 1) : 1;
      const remainingMap = await this.getSaleRemainingQty(client, sale.id);
      const itemsResult = await client.query<any>(
        `select si.id, si.sku_id, si.product_name_snapshot, si.sku_code_snapshot,
                sk.variant_label, sk.requires_serial, sk.requires_imei,
                si.qty, si.unit_price, si.discount_amount, si.tax_amount, si.line_total
         from sales.sale_items si
         left join catalog.skus sk on sk.id = si.sku_id
         where si.sale_id = $1
         order by si.created_at asc`,
        [sale.id],
      );
      const items = [];
      for (const item of itemsResult.rows) {
        const remaining = remainingMap.get(item.id);
        const serialsResult = await client.query<any>(
          `select ds.id, ds.serial_number, ds.imei_number
           from inventory.device_serial_sales dss
           join inventory.device_serials ds on ds.id = dss.device_serial_id
           where dss.sale_item_id = $1 and ds.status = 'sold'`,
          [item.id],
        );
        items.push({
          saleItemId: item.id,
          skuId: item.sku_id,
          productName: item.product_name_snapshot,
          skuCode: item.sku_code_snapshot,
          variantLabel: item.variant_label ?? null,
          requiresSerial: item.requires_serial || item.requires_imei,
          qty: Number(item.qty),
          remainingQty: remaining ? remaining.remainingQty : Number(item.qty),
          unitPrice: Number(item.unit_price),
          discountAmount: Number(item.discount_amount),
          taxAmount: Number(item.tax_amount),
          lineTotal: Number(item.line_total),
          credit: Math.round(Number(item.line_total) * paidRatio * 100) / 100,
          serials: serialsResult.rows.map((s: any) => ({
            id: s.id, serialNumber: s.serial_number, imeiNumber: s.imei_number,
          })),
        });
      }
      sales.push({
        saleId: sale.id,
        saleNo: sale.sale_no,
        invoiceNo: sale.invoice_no ?? null,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        totalAmount,
        paidAmount: Number(sale.paid_amount ?? 0),
        paidRatio: Math.round(paidRatio * 10000) / 10000,
        paymentStatus: sale.payment_status,
        soldAt: sale.created_at,
        items,
      });
    }

    return { sales };
  }

  async listExchanges(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { query?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.query?.trim() || null;

    const result = await this.pool.query(
      `
        select
          e.id,
          e.exchange_no,
          e.original_sale_id,
          s.sale_no as original_sale_no,
          e.customer_name,
          e.customer_phone,
          e.trade_in_credit,
          e.new_items_total,
          e.difference,
          e.refund_method,
          e.status,
          e.created_at,
          coalesce((
            select string_agg(ei.product_name_snapshot, ', ' order by ei.created_at)
            from sales.sale_exchange_items ei
            where ei.sale_exchange_id = e.id
          ), '') as items_summary,
          count(*) over()::int as total_count
        from sales.sale_exchanges e
        join sales.sales s on s.id = e.original_sale_id
        where e.store_id = $1
          and (
            $2::text is null
            or e.exchange_no ilike '%' || $2::text || '%'
            or coalesce(e.customer_name, '') ilike '%' || $2::text || '%'
            or coalesce(e.customer_phone, '') ilike '%' || $2::text || '%'
            or s.sale_no ilike '%' || $2::text || '%'
          )
        order by e.created_at desc
        limit $3 offset $4
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { exchanges: items, pagination: { page, limit, total } };
  }

  async getExchange(exchangeId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const exchangeResult = await this.pool.query<any>(
      `select e.*, s.sale_no as original_sale_no, up.full_name as processed_by_name,
              l.name as location_name
       from sales.sale_exchanges e
       join sales.sales s on s.id = e.original_sale_id
       left join identity.user_profiles up on up.user_id = e.processed_by
       left join inventory.locations l on l.id = e.location_id
       where e.id = $1 and e.store_id = $2
       limit 1`,
      [exchangeId, storeId],
    );
    const exchange = exchangeResult.rows[0];
    if (!exchange) throw new NotFoundException('Exchange not found');

    const itemsResult = await this.pool.query<any>(
      `select * from sales.sale_exchange_items where sale_exchange_id = $1 order by side desc, created_at asc`,
      [exchangeId],
    );

    return {
      exchange: {
        ...exchange,
        trade_in_credit: Number(exchange.trade_in_credit),
        new_items_total: Number(exchange.new_items_total),
        difference: Number(exchange.difference),
      },
      items: itemsResult.rows.map((row: any) => ({
        ...row,
        qty: Number(row.qty),
        unit_price: Number(row.unit_price),
        discount_amount: Number(row.discount_amount),
        tax_amount: Number(row.tax_amount),
        line_total: Number(row.line_total),
        line_credit: Number(row.line_credit),
        unit_cost: Number(row.unit_cost),
      })),
    };
  }

  async reprintExchangeReceipt(exchangeId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const exists = await this.pool.query('select id from sales.sale_exchanges where id = $1 and store_id = $2 limit 1', [exchangeId, storeId]);
    if (!exists.rows[0]) throw new NotFoundException('Exchange not found');
    const receipt = await this.buildExchangeReceipt(exchangeId, storeId);
    return { receipt };
  }

  async updateReturnRefundDetails(
    saleId: string,
    returnId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: { refundMethod?: string; refundReference?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `update sales.sale_returns
       set refund_method = coalesce($4, refund_method),
           refund_reference = coalesce($5, refund_reference),
           updated_at = now()
       where id = $1 and sale_id = $2 and store_id = $3
       returning id`,
      [returnId, saleId, storeId, payload.refundMethod ?? null, payload.refundReference ?? null],
    );
    return { ok: result.rowCount === 1 };
  }

  private async buildExchangeReceipt(exchangeId: string, storeId: string) {
    const exchangeResult = await this.pool.query<any>(
      `select e.*, s.sale_no as original_sale_no, up.full_name as processed_by_name,
              l.name as location_name
       from sales.sale_exchanges e
       join sales.sales s on s.id = e.original_sale_id
       left join identity.user_profiles up on up.user_id = e.processed_by
       left join inventory.locations l on l.id = e.location_id
       where e.id = $1 and e.store_id = $2
       limit 1`,
      [exchangeId, storeId],
    );
    const exchange = exchangeResult.rows[0];
    if (!exchange) return null;

    const itemsResult = await this.pool.query<any>(
      `select side, product_name_snapshot, sku_code_snapshot, serial_number, imei_number,
              qty, line_total, line_credit, unit_price, restock
       from sales.sale_exchange_items
       where sale_exchange_id = $1
       order by side desc, created_at asc`,
      [exchangeId],
    );

    const storeResult = await this.pool.query(
      'select s.name, s.logo_url, s.phone, s.email, s.address_text, ss.receipt_footer, ss.receipt_type from store.stores s left join store.store_settings ss on ss.store_id = s.id where s.id = $1 limit 1',
      [storeId],
    );
    const store = storeResult.rows[0] ?? {};

    const payments = (exchange.payments ?? []) as Array<any>;
    const difference = Number(exchange.difference ?? 0);
    const tradeInCredit = Number(exchange.trade_in_credit ?? 0);
    const newItemsTotal = Number(exchange.new_items_total ?? 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

    const allItems = itemsResult.rows;
    const tradeInItems = allItems.filter((r: any) => r.side === 'returned');
    const newItems = allItems.filter((r: any) => r.side === 'new');

    const stockNotes = [
      ...tradeInItems.filter((r: any) => r.restock).map((r: any) => `${r.product_name_snapshot} ×${Number(r.qty)} returned to stock`),
      ...newItems.map((r: any) => `${r.product_name_snapshot} ×${Number(r.qty)} deducted from stock`),
    ];

    return {
      type: 'exchange',
      exchangeId: exchange.id,
      exchangeNo: exchange.exchange_no,
      originalSaleId: exchange.original_sale_id,
      originalSaleNo: exchange.original_sale_no,
      status: exchange.status,
      processedAt: exchange.created_at,
      processedByName: exchange.processed_by_name,
      locationName: exchange.location_name ?? null,
      store: {
        name: store.name ?? null,
        logoUrl: store.logo_url ?? null,
        phone: store.phone ?? null,
        email: store.email ?? null,
        address: store.address_text ?? null,
        footer: store.receipt_footer ?? null,
        receiptType: store.receipt_type ?? 'pos',
      },
      customer: {
        name: exchange.customer_name ?? null,
        phone: exchange.customer_phone ?? null,
        shopName: exchange.customer_shop_name ?? null,
      },
      tradeInItems: tradeInItems.map((r: any) => ({
        productName: r.product_name_snapshot,
        skuCode: r.sku_code_snapshot,
        serialNumber: r.serial_number,
        imeiNumber: r.imei_number,
        qty: Number(r.qty),
        lineCredit: Number(r.line_credit),
        restock: r.restock,
      })),
      newItems: newItems.map((r: any) => ({
        productName: r.product_name_snapshot,
        skuCode: r.sku_code_snapshot,
        serialNumber: r.serial_number,
        imeiNumber: r.imei_number,
        qty: Number(r.qty),
        unitPrice: Number(r.unit_price),
        lineTotal: Number(r.line_total),
      })),
      paymentSummary: {
        tenders: payments.map((p: any) => ({
          paymentMethod: p.paymentMethod ?? null,
          amount: Number(p.amount ?? 0),
          referenceNo: p.referenceNo ?? null,
        })),
        totalPaid,
        tradeInCredit,
        newItemsTotal,
        exchangeAmount: difference,
        exchangeAmountLabel:
          difference >= 0
            ? `Exchange Amount: ৳${difference.toFixed(2)} (New Total ৳${newItemsTotal.toFixed(2)} - Trade-in Value ৳${tradeInCredit.toFixed(2)})`
            : `Refund Due: ৳${Math.abs(difference).toFixed(2)} (Trade-in Value ৳${tradeInCredit.toFixed(2)} - New Total ৳${newItemsTotal.toFixed(2)})`,
        refund:
          difference < 0
            ? { method: exchange.refund_method, reference: exchange.refund_reference, amount: Math.abs(difference) }
            : null,
      },
      stockNotes,
      note: exchange.note ?? null,
      amountInWords: this.numberToWords(Math.abs(difference)),
      printedAt: new Date().toISOString(),
    };
  }
}
