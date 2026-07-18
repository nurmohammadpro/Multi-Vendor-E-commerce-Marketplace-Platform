import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type StoreRole = 'store_owner' | 'store_manager' | 'store_salesman';

const HARDWARE_CATALOG = {
  receiptPrinters: [
    { tier: 'low', model: 'Xprinter XP80T', useCase: '80mm thermal receipt', connectivity: 'USB', priceBdt: '4650-6500', recommended: false },
    { tier: 'medium', model: 'Xprinter XP-Q80A', useCase: '80mm thermal receipt', connectivity: 'USB', priceBdt: '6100', recommended: true },
    { tier: 'high', model: 'Xprinter XP-E200L', useCase: '80mm thermal receipt', connectivity: 'USB+LAN or USB+Serial', priceBdt: '8000', recommended: true },
  ],
  labelPrinters: [
    { tier: 'low', model: 'Xprinter XP-420B', useCase: 'Direct thermal barcode labels', connectivity: 'USB', priceBdt: '9500-10000', recommended: true },
    { tier: 'medium', model: 'Zebra ZD220', useCase: 'Desktop barcode labels', connectivity: 'USB', priceBdt: '15900-16000', recommended: false },
    { tier: 'high', model: 'TSC TE244', useCase: 'Desktop barcode labels', connectivity: 'USB', priceBdt: '18800-19000', recommended: true },
  ],
  barcodeScanners: [
    { tier: 'low', model: 'Zebra LS2208', useCase: '1D handheld scanning', connectivity: 'USB HID', priceBdt: '6690-7900', recommended: false },
    { tier: 'medium', model: 'Zebra DS2208', useCase: '1D/2D handheld scanning', connectivity: 'USB HID', priceBdt: '8800-9600', recommended: true },
    { tier: 'high', model: 'Zebra DS9308', useCase: '1D/2D presentation scanning', connectivity: 'USB HID', priceBdt: '12200-14700', recommended: false },
  ],
  bundles: [
    { tier: 'budget', name: 'XP80T + XP-420B + LS2208', priceBdt: '20850-24400', recommended: false },
    { tier: 'balanced', name: 'XP-Q80A + XP-420B + DS2208', priceBdt: '24400-25700', recommended: true },
    { tier: 'premium', name: 'XP-E200L + TSC TE244 + DS9308', priceBdt: '39000-41700', recommended: false },
  ],
};

@Injectable()
export class StoreOpsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listCustomers(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { query?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const query = filters.query?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            c.id,
            c.full_name,
            c.mobile_no,
            c.email,
            c.shop_name,
            c.address,
            c.note,
            c.created_at,
            c.updated_at,
            coalesce(count(distinct s.id), 0)::int as total_sales_count,
            coalesce(sum(
              case
                when s.payment_status in ('due', 'partial') then greatest(s.total_amount - coalesce(paid.paid_amount, 0), 0)
                else 0
              end
            ), 0) as outstanding_due_amount,
            count(*) over()::int as total_count
          from store.customers c
          left join sales.sales s on s.customer_id = c.id
          left join lateral (
            select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_amount
            from sales.sale_payments sp
            where sp.sale_id = s.id
          ) paid on true
          where c.store_id = $1
            and (
              $2::text is null
              or coalesce(c.full_name, '') ilike '%' || $2::text || '%'
              or coalesce(c.mobile_no, '') ilike '%' || $2::text || '%'
              or coalesce(c.email::text, '') ilike '%' || $2::text || '%'
              or coalesce(c.shop_name, '') ilike '%' || $2::text || '%'
            )
          group by c.id
          order by c.updated_at desc, c.created_at desc
          limit $3
          offset $4
        ) customers
      `,
      [storeId, query, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { customers: items, pagination: { page, limit, total } };
  }

  async getCustomer(customerId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const customerResult = await this.pool.query(
      `
        select *
        from store.customers
        where id = $1
          and store_id = $2
        limit 1
      `,
      [customerId, storeId],
    );

    const customer = customerResult.rows[0];
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const dueSales = await this.pool.query(
      `
        select
          s.id,
          s.sale_no,
          s.total_amount,
          s.payment_status,
          s.due_date,
          s.created_at,
          greatest(s.total_amount - coalesce(paid.paid_amount, 0), 0) as outstanding_due_amount
        from sales.sales s
        left join lateral (
          select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_amount
          from sales.sale_payments sp
          where sp.sale_id = s.id
        ) paid on true
        where s.store_id = $1
          and s.customer_id = $2
          and s.payment_status in ('due', 'partial')
        order by coalesce(s.due_date, s.created_at::date) asc, s.created_at desc
      `,
      [storeId, customerId],
    );

    return { customer, dueSales: dueSales.rows };
  }

  async listDueSales(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { query?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const query = filters.query?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            s.id,
            s.sale_no,
            s.total_amount,
            s.payment_status,
            s.customer_name,
            s.customer_phone,
            s.customer_email,
            s.customer_shop_name,
            s.customer_address,
            s.due_date,
            s.created_at,
            greatest(s.total_amount - coalesce(paid.paid_amount, 0), 0) as outstanding_due_amount,
            greatest((current_date - coalesce(s.due_date, s.created_at::date)), 0) as aging_days,
            count(*) over()::int as total_count
          from sales.sales s
          left join lateral (
            select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_amount
            from sales.sale_payments sp
            where sp.sale_id = s.id
          ) paid on true
          where s.store_id = $1
            and s.status = 'completed'
            and s.payment_status in ('due', 'partial')
            and (
              $2::text is null
              or s.sale_no ilike '%' || $2::text || '%'
              or coalesce(s.customer_name, '') ilike '%' || $2::text || '%'
              or coalesce(s.customer_phone, '') ilike '%' || $2::text || '%'
              or coalesce(s.customer_shop_name, '') ilike '%' || $2::text || '%'
            )
          order by coalesce(s.due_date, s.created_at::date) asc, s.created_at desc
          limit $3
          offset $4
        ) due_sales
      `,
      [storeId, query, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { dueSales: items, pagination: { page, limit, total } };
  }

  async getDueSalesAging(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        with due_sales as (
          select
            greatest(s.total_amount - coalesce(paid.paid_amount, 0), 0) as outstanding_due_amount,
            greatest((current_date - coalesce(s.due_date, s.created_at::date)), 0) as aging_days
          from sales.sales s
          left join lateral (
            select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_amount
            from sales.sale_payments sp
            where sp.sale_id = s.id
          ) paid on true
          where s.store_id = $1
            and s.status = 'completed'
            and s.payment_status in ('due', 'partial')
        )
        select
          coalesce(sum(outstanding_due_amount) filter (where aging_days = 0), 0) as today_amount,
          count(*) filter (where aging_days = 0)::int as today_count,
          coalesce(sum(outstanding_due_amount) filter (where aging_days between 1 and 7), 0) as days_7_amount,
          count(*) filter (where aging_days between 1 and 7)::int as days_7_count,
          coalesce(sum(outstanding_due_amount) filter (where aging_days between 8 and 30), 0) as days_30_amount,
          count(*) filter (where aging_days between 8 and 30)::int as days_30_count,
          coalesce(sum(outstanding_due_amount) filter (where aging_days between 31 and 90), 0) as days_90_amount,
          count(*) filter (where aging_days between 31 and 90)::int as days_90_count,
          coalesce(sum(outstanding_due_amount) filter (where aging_days > 90), 0) as days_90_plus_amount,
          count(*) filter (where aging_days > 90)::int as days_90_plus_count
        from due_sales
      `,
      [storeId],
    );

    return { aging: result.rows[0] ?? null };
  }

  async getOwnerOverview(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);

    const [
      pendingStockResult,
      pendingPriceResult,
      dueCollectionsResult,
      cashSalesResult,
      cashDueCollectionsResult,
      cashExpensesResult,
      cashCountResult,
      cashCountHistoryResult,
    ] = await Promise.all([
      this.pool.query<{ pending_stock_count: number }>(
        `
          select count(*)::int as pending_stock_count
          from inventory.stock_adjustment_requests
          where store_id = $1
            and status = 'pending'
        `,
        [storeId],
      ),
      this.pool.query<{ pending_price_count: number }>(
        `
          select count(*)::int as pending_price_count
          from catalog.price_change_requests
          where store_id = $1
            and status = 'pending'
        `,
        [storeId],
      ),
      this.pool.query<{ today_due_collection_amount: string; today_due_collection_count: number }>(
        `
          select
            coalesce(sum(sp.amount) filter (where sp.status = 'paid'), 0) as today_due_collection_amount,
            count(*) filter (where sp.status = 'paid')::int as today_due_collection_count
          from sales.sale_payments sp
          join sales.sales s on s.id = sp.sale_id
          where s.store_id = $1
            and s.due_date is not null
            and sp.paid_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query<{ today_cash_sales_amount: string }>(
        `
          select
            coalesce(sum(sp.amount) filter (where sp.status = 'paid'), 0) as today_cash_sales_amount
          from sales.sale_payments sp
          join sales.sales s on s.id = sp.sale_id
          where s.store_id = $1
            and s.due_date is null
            and sp.payment_method = 'cash'
            and sp.paid_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query<{ today_cash_due_collection_amount: string }>(
        `
          select
            coalesce(sum(sp.amount) filter (where sp.status = 'paid'), 0) as today_cash_due_collection_amount
          from sales.sale_payments sp
          join sales.sales s on s.id = sp.sale_id
          where s.store_id = $1
            and s.due_date is not null
            and sp.payment_method = 'cash'
            and sp.paid_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query<{ today_cash_expense_amount: string }>(
        `
          select
            coalesce(sum(amount), 0) as today_cash_expense_amount
          from finance.daily_expenses
          where store_id = $1
            and payment_method = 'cash'
            and expense_date = current_date
            and status <> 'void'
        `,
        [storeId],
      ),
      this.pool.query<{
        counted_cash_amount: string;
        expected_cash_amount: string;
        variance_amount: string;
        note: string | null;
        updated_at: string;
      }>(
        `
          select
            counted_cash_amount,
            expected_cash_amount,
            variance_amount,
            note,
            updated_at
          from finance.owner_cash_counts
          where store_id = $1
            and count_date = current_date
          limit 1
        `,
        [storeId],
      ),
      this.pool.query<{
        count_date: string;
        counted_cash_amount: string;
        expected_cash_amount: string;
        variance_amount: string;
        note: string | null;
        updated_at: string;
      }>(
        `
          select
            count_date,
            counted_cash_amount,
            expected_cash_amount,
            variance_amount,
            note,
            updated_at
          from finance.owner_cash_counts
          where store_id = $1
          order by count_date desc, updated_at desc
          limit 7
        `,
        [storeId],
      ),
    ]);

    const pendingStockApprovals = Number(pendingStockResult.rows[0]?.pending_stock_count ?? 0);
    const pendingPriceApprovals = Number(pendingPriceResult.rows[0]?.pending_price_count ?? 0);
    const todayDueCollectionsAmount = Number(dueCollectionsResult.rows[0]?.today_due_collection_amount ?? 0);
    const todayDueCollectionsCount = Number(dueCollectionsResult.rows[0]?.today_due_collection_count ?? 0);
    const todayCashSalesAmount = Number(cashSalesResult.rows[0]?.today_cash_sales_amount ?? 0);
    const todayCashDueCollectionsAmount = Number(cashDueCollectionsResult.rows[0]?.today_cash_due_collection_amount ?? 0);
    const todayCashExpenseAmount = Number(cashExpensesResult.rows[0]?.today_cash_expense_amount ?? 0);
    const expectedCashAmount = todayCashSalesAmount + todayCashDueCollectionsAmount - todayCashExpenseAmount;
    const savedCashCount = cashCountResult.rows[0];
    const countedCashAmount = savedCashCount ? Number(savedCashCount.counted_cash_amount ?? 0) : null;
    const cashVarianceAmount = countedCashAmount === null
      ? expectedCashAmount
      : countedCashAmount - expectedCashAmount;

    return {
      overview: {
        pendingStockApprovals,
        pendingPriceApprovals,
        totalPendingApprovals: pendingStockApprovals + pendingPriceApprovals,
        todayDueCollectionsAmount,
        todayDueCollectionsCount,
        todayCashSalesAmount,
        todayCashDueCollectionsAmount,
        todayCashExpenseAmount,
        expectedCashAmount,
        countedCashAmount,
        cashVarianceAmount,
        cashCountNote: savedCashCount?.note ?? null,
        cashCountUpdatedAt: savedCashCount?.updated_at ?? null,
        recentCashCounts: cashCountHistoryResult.rows.map((entry) => ({
          countDate: entry.count_date,
          countedCashAmount: Number(entry.counted_cash_amount ?? 0),
          expectedCashAmount: Number(entry.expected_cash_amount ?? 0),
          varianceAmount: Number(entry.variance_amount ?? 0),
          note: entry.note ?? null,
          updatedAt: entry.updated_at,
        })),
      },
    };
  }

  async saveOwnerCashCount(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { countedCashAmount: number; note?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const userId = this.requireUserId(session);
    const expectedCashAmount = await this.getExpectedCashAmount(storeId);
    const varianceAmount = payload.countedCashAmount - expectedCashAmount;

    await this.pool.query(
      `
        insert into finance.owner_cash_counts (
          tenant_id,
          store_id,
          count_date,
          expected_cash_amount,
          counted_cash_amount,
          variance_amount,
          note,
          counted_by
        )
        values (
          (select tenant_id from store.stores where id = $1),
          $1,
          current_date,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        on conflict (store_id, count_date)
        do update set
          expected_cash_amount = excluded.expected_cash_amount,
          counted_cash_amount = excluded.counted_cash_amount,
          variance_amount = excluded.variance_amount,
          note = excluded.note,
          counted_by = excluded.counted_by,
          updated_at = now()
      `,
      [
        storeId,
        expectedCashAmount,
        payload.countedCashAmount,
        varianceAmount,
        payload.note?.trim() || null,
        userId,
      ],
    );

    return this.getOwnerOverview(storeId, authContext);
  }

  async collectDueSalePayment(
    saleId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { amount: number; paymentMethod: 'cash' | 'card' | 'mfs' | 'bank_transfer'; referenceNo?: string; note?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.requireUserId(session);

    const saleResult = await this.pool.query<{
      id: string;
      total_amount: string;
      payment_status: string;
      sale_no: string;
    }>(
      `
        select id, total_amount, payment_status, sale_no
        from sales.sales
        where id = $1
          and store_id = $2
        limit 1
      `,
      [saleId, storeId],
    );

    const sale = saleResult.rows[0];
    if (!sale) {
      throw new NotFoundException('Due sale not found');
    }

    const paidResult = await this.pool.query<{ paid_amount: string }>(
      `
        select coalesce(sum(amount) filter (where status = 'paid'), 0)::text as paid_amount
        from sales.sale_payments
        where sale_id = $1
      `,
      [saleId],
    );
    const outstanding = Number(sale.total_amount) - Number(paidResult.rows[0]?.paid_amount ?? '0');
    if (payload.amount > outstanding) {
      throw new ForbiddenException('Collection amount is greater than outstanding due');
    }

    await this.pool.query(
      `
        insert into sales.sale_payments (
          id,
          sale_id,
          payment_method,
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
          'paid',
          now(),
          now()
        )
      `,
      [saleId, payload.paymentMethod, payload.amount, payload.referenceNo ?? null],
    );

    const newPaid = Number(paidResult.rows[0]?.paid_amount ?? '0') + payload.amount;
    const nextStatus = newPaid >= Number(sale.total_amount) ? 'paid' : 'partial';

    await this.pool.query(
      `
        update sales.sales
        set payment_status = $2,
            note = case when $3::text is null then note else concat_ws(E'\n', note, $3::text) end,
            updated_at = now()
        where id = $1
      `,
      [saleId, nextStatus, payload.note ?? null],
    );

    return {
      saleId,
      saleNo: sale.sale_no,
      collectedAmount: payload.amount,
      outstandingAmount: Math.max(Number(sale.total_amount) - newPaid, 0),
      paymentStatus: nextStatus,
    };
  }

  async listSuppliers(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; status?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const status = filters.status?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            s.*,
            coalesce(p.purchase_count, 0)::int as purchase_count,
            coalesce(p.total_payable_amount, 0) as total_payable_amount,
            count(*) over()::int as total_count
          from procurement.suppliers s
          left join lateral (
            select
              count(*) as purchase_count,
              coalesce(sum(greatest(total_amount - paid_amount, 0)), 0) as total_payable_amount
            from procurement.purchases p
            where p.supplier_id = s.id
              and p.status <> 'cancelled'
          ) p on true
          where s.store_id = $1
            and ($2::text is null or s.status = $2::text)
            and (
              $3::text is null
              or s.company_name ilike '%' || $3::text || '%'
              or coalesce(s.contact_name, '') ilike '%' || $3::text || '%'
              or coalesce(s.phone, '') ilike '%' || $3::text || '%'
              or coalesce(s.email::text, '') ilike '%' || $3::text || '%'
            )
          order by s.updated_at desc, s.created_at desc
          limit $4
          offset $5
        ) suppliers
      `,
      [storeId, status, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { suppliers: items, pagination: { page, limit, total } };
  }

  async createSupplier(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      supplierType: 'supplier' | 'importer' | 'company';
      companyName: string;
      contactName?: string;
      phone?: string;
      email?: string;
      address?: string;
      note?: string;
      openingPayableAmount: number;
      status: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const tenantId = session?.user.tenantId ?? '';

    const result = await this.pool.query(
      `
        insert into procurement.suppliers (
          id, tenant_id, store_id, supplier_type, company_name, contact_name, phone, email, address, note, opening_payable_amount, status, created_at, updated_at
        )
        values (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::citext, $8, $9, $10, $11, now(), now()
        )
        returning *
      `,
      [
        tenantId,
        storeId,
        payload.supplierType,
        payload.companyName,
        payload.contactName ?? null,
        payload.phone ?? null,
        payload.email ?? null,
        payload.address ?? null,
        payload.note ?? null,
        payload.openingPayableAmount,
        payload.status,
      ],
    );

    return { supplier: result.rows[0] };
  }

  async updateSupplier(
    supplierId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{
      supplierType: 'supplier' | 'importer' | 'company';
      companyName: string;
      contactName: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      note: string | null;
      openingPayableAmount: number;
      status: 'active' | 'inactive';
    }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query(
      `
        update procurement.suppliers
        set
          supplier_type = coalesce($3, supplier_type),
          company_name = coalesce($4, company_name),
          contact_name = case when $5::varchar is null then contact_name else $5::varchar end,
          phone = case when $6::varchar is null then phone else $6::varchar end,
          email = case when $7::citext is null then email else $7::citext end,
          address = case when $8::text is null then address else $8::text end,
          note = case when $9::text is null then note else $9::text end,
          opening_payable_amount = coalesce($10, opening_payable_amount),
          status = coalesce($11, status),
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [
        supplierId,
        storeId,
        payload.supplierType ?? null,
        payload.companyName ?? null,
        payload.contactName === undefined ? null : payload.contactName,
        payload.phone === undefined ? null : payload.phone,
        payload.email === undefined ? null : payload.email,
        payload.address === undefined ? null : payload.address,
        payload.note === undefined ? null : payload.note,
        payload.openingPayableAmount ?? null,
        payload.status ?? null,
      ],
    );

    if (!result.rows[0]) throw new NotFoundException('Supplier not found');
    return { supplier: result.rows[0] };
  }

  async listPurchases(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; status?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const status = filters.status?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            p.id,
            p.purchase_no,
            p.purchase_date,
            p.invoice_no,
            p.total_amount,
            p.paid_amount,
            p.payment_status,
            p.status,
            p.note,
            p.created_at,
            s.company_name as supplier_name,
            l.name as location_name,
            count(pi.id)::int as item_count,
            count(*) over()::int as total_count
          from procurement.purchases p
          join procurement.suppliers s on s.id = p.supplier_id
          join inventory.locations l on l.id = p.location_id
          left join procurement.purchase_items pi on pi.purchase_id = p.id
          where p.store_id = $1
            and ($2::text is null or p.status = $2::text)
            and (
              $3::text is null
              or p.purchase_no ilike '%' || $3::text || '%'
              or coalesce(p.invoice_no, '') ilike '%' || $3::text || '%'
              or s.company_name ilike '%' || $3::text || '%'
            )
          group by p.id, s.company_name, l.name
          order by p.purchase_date desc, p.created_at desc
          limit $4
          offset $5
        ) purchases
      `,
      [storeId, status, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { purchases: items, pagination: { page, limit, total } };
  }

  async getPurchase(purchaseId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const purchaseResult = await this.pool.query(
      `
        select
          p.*,
          s.company_name as supplier_name,
          s.contact_name as supplier_contact_name,
          s.phone as supplier_phone,
          l.name as location_name
        from procurement.purchases p
        join procurement.suppliers s on s.id = p.supplier_id
        join inventory.locations l on l.id = p.location_id
        where p.id = $1
          and p.store_id = $2
        limit 1
      `,
      [purchaseId, storeId],
    );

    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new NotFoundException('Purchase not found');

    const [itemsResult, paymentsResult] = await Promise.all([
      this.pool.query(
        `
          select id, sku_id, product_name_snapshot, sku_code_snapshot, variant_label_snapshot, qty, unit_cost, line_total, batch_no, expiry_date
          from procurement.purchase_items
          where purchase_id = $1
          order by created_at asc
        `,
        [purchaseId],
      ),
      this.pool.query(
        `
          select id, payment_method, amount, reference_no, status, note, paid_at, created_at
          from procurement.purchase_payments
          where purchase_id = $1
          order by created_at desc
        `,
        [purchaseId],
      ),
    ]);

    return { purchase, items: itemsResult.rows, payments: paymentsResult.rows };
  }

  async createPurchase(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      supplierId: string;
      locationId?: string;
      purchaseDate: string;
      invoiceNo?: string;
      discountAmount: number;
      taxAmount: number;
      shippingAmount: number;
      note?: string;
      paymentMethod?: 'cash' | 'card' | 'mfs' | 'bank_transfer';
      paidAmount: number;
      paymentReferenceNo?: string;
      paymentNote?: string;
      items: Array<{ skuId: string; qty: number; unitCost: number; batchNo?: string; expiryDate?: string }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const userId = this.requireUserId(session);
    const locationId = payload.locationId ?? await this.getDefaultInventoryLocationId(storeId);
    const purchaseNo = await this.generatePurchaseNumber(storeId, payload.purchaseDate);

    const supplierExists = await this.pool.query<{ id: string }>(
      `select id from procurement.suppliers where id = $1 and store_id = $2 limit 1`,
      [payload.supplierId, storeId],
    );
    if (!supplierExists.rows[0]) throw new NotFoundException('Supplier not found');

    const skuResult = await this.pool.query<{
      id: string;
      sku_code: string;
      product_name: string;
      variant_label: string | null;
    }>(
      `
        select
          s.id,
          s.sku_code,
          p.name as product_name,
          s.variant_label
        from catalog.skus s
        join catalog.products p on p.id = s.product_id
        where p.store_id = $1
          and s.id = any($2::uuid[])
      `,
      [storeId, payload.items.map((item) => item.skuId)],
    );

    if (skuResult.rows.length !== payload.items.length) {
      throw new NotFoundException('One or more SKUs were not found for this store');
    }

    const skuMap = new Map(skuResult.rows.map((row) => [row.id, row]));
    const subtotalAmount = payload.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
    const totalAmount = subtotalAmount - payload.discountAmount + payload.taxAmount + payload.shippingAmount;
    const paidAmount = Math.min(payload.paidAmount, totalAmount);
    const paymentStatus = paidAmount <= 0 ? 'pending' : paidAmount >= totalAmount ? 'paid' : 'partial';

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const purchaseResult = await client.query<{ id: string }>(
        `
          insert into procurement.purchases (
            id, tenant_id, store_id, supplier_id, location_id, purchase_no, purchase_date, invoice_no,
            subtotal_amount, discount_amount, tax_amount, shipping_amount, total_amount, paid_amount,
            payment_status, status, note, created_by, received_at, created_at, updated_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, 'received', $14, $15, now(), now(), now()
          from store.stores s
          where s.id = $1
          returning id
        `,
        [
          storeId,
          payload.supplierId,
          locationId,
          purchaseNo,
          payload.purchaseDate,
          payload.invoiceNo ?? null,
          subtotalAmount,
          payload.discountAmount,
          payload.taxAmount,
          payload.shippingAmount,
          totalAmount,
          paidAmount,
          paymentStatus,
          payload.note ?? null,
          userId,
        ],
      );

      const purchaseId = purchaseResult.rows[0].id;

      for (const item of payload.items) {
        const sku = skuMap.get(item.skuId);
        if (!sku) continue;
        const lineTotal = item.qty * item.unitCost;

        await client.query(
          `
            insert into procurement.purchase_items (
              id, purchase_id, sku_id, product_name_snapshot, sku_code_snapshot, variant_label_snapshot, qty, unit_cost, line_total, batch_no, expiry_date, created_at
            )
            values (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
            )
          `,
          [
            purchaseId,
            item.skuId,
            sku.product_name,
            sku.sku_code,
            sku.variant_label,
            item.qty,
            item.unitCost,
            lineTotal,
            item.batchNo?.trim() || null,
            item.expiryDate ?? null,
          ],
        );

        await client.query(
          `
            insert into inventory.balances (
              id, tenant_id, store_id, location_id, sku_id, on_hand_qty, reserved_qty, damaged_qty, returned_qty, updated_at
            )
            select
              gen_random_uuid(),
              s.tenant_id,
              s.id,
              $2, $3, $4, 0, 0, 0, now()
            from store.stores s
            where s.id = $1
            on conflict (location_id, sku_id)
            do update set
              on_hand_qty = inventory.balances.on_hand_qty + excluded.on_hand_qty,
              updated_at = now()
          `,
          [storeId, locationId, item.skuId, item.qty],
        );

        await client.query(
          `
            insert into inventory.ledger (
              id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at
            )
            select
              gen_random_uuid(),
              s.tenant_id,
              s.id,
              $2, $3, 'purchase_receive', $4, 'purchase', $5, $6, $7, now()
            from store.stores s
            where s.id = $1
          `,
          [storeId, locationId, item.skuId, item.qty, purchaseId, `Purchase receive ${purchaseNo}`, userId],
        );
      }

      if (paidAmount > 0) {
        await client.query(
          `
            insert into procurement.purchase_payments (
              id, purchase_id, payment_method, amount, reference_no, status, note, paid_at, created_by, created_at
            )
            values (
              gen_random_uuid(), $1, $2, $3, $4, 'paid', $5, now(), $6, now()
            )
          `,
          [purchaseId, payload.paymentMethod ?? 'cash', paidAmount, payload.paymentReferenceNo ?? null, payload.paymentNote ?? null, userId],
        );
      }

      await client.query('commit');
      return { purchaseId, purchaseNo, totalAmount, paidAmount, paymentStatus };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async createPurchasePayment(
    purchaseId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      amount: number;
      paymentMethod: 'cash' | 'card' | 'mfs' | 'bank_transfer';
      referenceNo?: string;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const userId = this.requireUserId(session);

    const purchaseResult = await this.pool.query<{ id: string; purchase_no: string; total_amount: string; paid_amount: string; status: string }>(
      `
        select id, purchase_no, total_amount, paid_amount, status
        from procurement.purchases
        where id = $1
          and store_id = $2
        limit 1
      `,
      [purchaseId, storeId],
    );

    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (purchase.status === 'cancelled') throw new ForbiddenException('Cancelled purchases cannot receive payments');

    const outstanding = Math.max(Number(purchase.total_amount) - Number(purchase.paid_amount), 0);
    if (outstanding <= 0) {
      throw new ForbiddenException('This purchase is already fully paid');
    }

    const appliedAmount = Math.min(payload.amount, outstanding);
    const nextPaidAmount = Number(purchase.paid_amount) + appliedAmount;
    const nextStatus = nextPaidAmount >= Number(purchase.total_amount) ? 'paid' : 'partial';

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `
          insert into procurement.purchase_payments (
            id, purchase_id, payment_method, amount, reference_no, status, note, paid_at, created_by, created_at
          )
          values (
            gen_random_uuid(), $1, $2, $3, $4, 'paid', $5, now(), $6, now()
          )
        `,
        [purchaseId, payload.paymentMethod, appliedAmount, payload.referenceNo ?? null, payload.note ?? null, userId],
      );
      await client.query(
        `
          update procurement.purchases
          set
            paid_amount = $2,
            payment_status = $3,
            updated_at = now()
          where id = $1
        `,
        [purchaseId, nextPaidAmount, nextStatus],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return {
      purchaseId,
      purchaseNo: purchase.purchase_no,
      paidAmount: appliedAmount,
      outstandingAmount: Math.max(Number(purchase.total_amount) - nextPaidAmount, 0),
      paymentStatus: nextStatus,
    };
  }

  async listPayables(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            p.id,
            p.purchase_no,
            p.purchase_date,
            p.invoice_no,
            p.total_amount,
            p.paid_amount,
            greatest(p.total_amount - p.paid_amount, 0) as outstanding_amount,
            p.payment_status,
            s.company_name as supplier_name,
            s.phone as supplier_phone,
            greatest((current_date - p.purchase_date), 0) as aging_days,
            count(*) over()::int as total_count
          from procurement.purchases p
          join procurement.suppliers s on s.id = p.supplier_id
          where p.store_id = $1
            and p.status <> 'cancelled'
            and greatest(p.total_amount - p.paid_amount, 0) > 0
            and (
              $2::text is null
              or p.purchase_no ilike '%' || $2::text || '%'
              or coalesce(p.invoice_no, '') ilike '%' || $2::text || '%'
              or s.company_name ilike '%' || $2::text || '%'
              or coalesce(s.phone, '') ilike '%' || $2::text || '%'
            )
          order by p.purchase_date asc, p.created_at desc
          limit $3
          offset $4
        ) payables
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { payables: items, pagination: { page, limit, total } };
  }

  async getPayablesAging(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query(
      `
        with payables as (
          select
            greatest(total_amount - paid_amount, 0) as outstanding_amount,
            greatest((current_date - purchase_date), 0) as aging_days
          from procurement.purchases
          where store_id = $1
            and status <> 'cancelled'
            and greatest(total_amount - paid_amount, 0) > 0
        )
        select
          coalesce(sum(outstanding_amount) filter (where aging_days = 0), 0) as today_amount,
          count(*) filter (where aging_days = 0)::int as today_count,
          coalesce(sum(outstanding_amount) filter (where aging_days between 1 and 7), 0) as days_7_amount,
          count(*) filter (where aging_days between 1 and 7)::int as days_7_count,
          coalesce(sum(outstanding_amount) filter (where aging_days between 8 and 30), 0) as days_30_amount,
          count(*) filter (where aging_days between 8 and 30)::int as days_30_count,
          coalesce(sum(outstanding_amount) filter (where aging_days between 31 and 90), 0) as days_90_amount,
          count(*) filter (where aging_days between 31 and 90)::int as days_90_count,
          coalesce(sum(outstanding_amount) filter (where aging_days > 90), 0) as days_90_plus_amount,
          count(*) filter (where aging_days > 90)::int as days_90_plus_count
        from payables
      `,
      [storeId],
    );

    return { aging: result.rows[0] ?? null };
  }

  async listExpenses(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            id,
            expense_date,
            category_name,
            title,
            amount,
            payment_method,
            note,
            status,
            created_at,
            updated_at,
            count(*) over()::int as total_count
          from finance.daily_expenses
          where store_id = $1
            and (
              $2::text is null
              or title ilike '%' || $2::text || '%'
              or category_name ilike '%' || $2::text || '%'
              or coalesce(note, '') ilike '%' || $2::text || '%'
            )
          order by expense_date desc, created_at desc
          limit $3
          offset $4
        ) expenses
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { expenses: items, pagination: { page, limit, total } };
  }

  async createExpense(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      expenseDate: string;
      categoryName: string;
      title: string;
      amount: number;
      paymentMethod: 'cash' | 'card' | 'mfs' | 'bank_transfer';
      note?: string;
      status: 'draft' | 'approved' | 'void';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query(
      `
        insert into finance.daily_expenses (
          id, tenant_id, store_id, expense_date, category_name, title, amount, payment_method, note, status, recorded_by, created_at, updated_at
        )
        select gen_random_uuid(), $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, now(), now()
        returning *
      `,
      [storeId, session?.user.tenantId ?? '', payload.expenseDate, payload.categoryName, payload.title, payload.amount, payload.paymentMethod, payload.note ?? null, payload.status, userId],
    );

    return { expense: result.rows[0] };
  }

  async updateExpense(
    expenseId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{
      expenseDate: string;
      categoryName: string;
      title: string;
      amount: number;
      paymentMethod: 'cash' | 'card' | 'mfs' | 'bank_transfer';
      note: string | null;
      status: 'draft' | 'approved' | 'void';
    }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query(
      `
        update finance.daily_expenses
        set
          expense_date = coalesce($3::date, expense_date),
          category_name = coalesce($4, category_name),
          title = coalesce($5, title),
          amount = coalesce($6, amount),
          payment_method = coalesce($7, payment_method),
          note = case when $8::text is null then note else $8::text end,
          status = coalesce($9, status),
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [expenseId, storeId, payload.expenseDate ?? null, payload.categoryName ?? null, payload.title ?? null, payload.amount ?? null, payload.paymentMethod ?? null, payload.note === undefined ? null : payload.note, payload.status ?? null],
    );

    if (!result.rows[0]) throw new NotFoundException('Expense not found');
    return { expense: result.rows[0] };
  }

  async listExpenseCategories(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const result = await this.pool.query(
      `
        select id, name, status, created_at
        from finance.expense_categories
        where store_id = $1
        order by name asc
      `,
      [storeId],
    );
    return { categories: result.rows };
  }

  async createExpenseCategory(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: { name: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const result = await this.pool.query(
      `
        insert into finance.expense_categories (id, tenant_id, store_id, name, created_at, updated_at)
        select gen_random_uuid(), s.tenant_id, s.id, $2, now(), now()
        from store.stores s
        where s.id = $1
        returning id, name, status, created_at
      `,
      [storeId, payload.name],
    );
    return { category: result.rows[0] };
  }

  async updateExpenseCategory(
    categoryId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: { name?: string; status?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const result = await this.pool.query(
      `
        update finance.expense_categories
        set name = coalesce($3, name),
            status = coalesce($4, status),
            updated_at = now()
        where id = $1
          and store_id = $2
        returning id, name, status, created_at
      `,
      [categoryId, storeId, payload.name ?? null, payload.status ?? null],
    );
    if (!result.rows[0]) throw new NotFoundException('Expense category not found');
    return { category: result.rows[0] };
  }

  async listEmployees(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            id,
            user_id,
            employee_number,
            full_name,
            mobile_no,
            email,
            address_text,
            role_code,
            employment_status,
            join_date,
            employment_type,
            designation,
            department,
            monthly_salary,
            emergency_contact_name,
            emergency_contact_phone,
            salary_payment_mode,
            bank_name,
            bank_account_name,
            bank_account_number,
            mobile_banking_type,
            mobile_banking_number,
            education_summary,
            experience_summary,
            training_summary,
            note,
            created_at,
            updated_at,
            count(*) over()::int as total_count
          from hr.employees
          where store_id = $1
            and (
              $2::text is null
              or full_name ilike '%' || $2::text || '%'
              or coalesce(employee_number, '') ilike '%' || $2::text || '%'
              or coalesce(role_code, '') ilike '%' || $2::text || '%'
              or coalesce(designation, '') ilike '%' || $2::text || '%'
              or coalesce(department, '') ilike '%' || $2::text || '%'
            )
          order by created_at desc
          limit $3
          offset $4
        ) employees
      `,
      [storeId, search, limit, offset],
    );
    const { items, total } = stripPaginationTotal(result.rows);
    return { employees: items, pagination: { page, limit, total } };
  }

  async createEmployee(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      fullName: string;
      mobileNo?: string;
      email?: string;
      addressText: string;
      roleCode: string;
      employmentStatus: 'active' | 'inactive' | 'terminated';
      joinDate: string;
      employmentType: string;
      designation?: string;
      department?: string;
      monthlySalary: number;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      salaryPaymentMode?: 'cash' | 'bank_transfer' | 'mobile_banking';
      bankName?: string;
      bankAccountName?: string;
      bankAccountNumber?: string;
      mobileBankingType?: string;
      mobileBankingNumber?: string;
      educationSummary?: string;
      experienceSummary?: string;
      trainingSummary?: string;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const employeeNumber = await this.generateEmployeeNumber(storeId);
    const result = await this.pool.query(
      `
        insert into hr.employees (
          id,
          tenant_id,
          store_id,
          employee_number,
          full_name,
          mobile_no,
          email,
          address_text,
          role_code,
          employment_status,
          join_date,
          employment_type,
          designation,
          department,
          monthly_salary,
          emergency_contact_name,
          emergency_contact_phone,
          salary_payment_mode,
          bank_name,
          bank_account_name,
          bank_account_number,
          mobile_banking_type,
          mobile_banking_number,
          education_summary,
          experience_summary,
          training_summary,
          note,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          $2,
          $1,
          $3,
          $4,
          $5,
          $6::citext,
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
          $24,
          $25,
          $26,
          now(),
          now()
        returning *
      `,
      [
        storeId,
        session?.user.tenantId ?? '',
        employeeNumber,
        payload.fullName,
        payload.mobileNo ?? null,
        payload.email ?? null,
        payload.addressText,
        payload.roleCode,
        payload.employmentStatus,
        payload.joinDate,
        payload.employmentType ?? 'permanent',
        payload.designation ?? null,
        payload.department ?? null,
        payload.monthlySalary,
        payload.emergencyContactName ?? null,
        payload.emergencyContactPhone ?? null,
        payload.salaryPaymentMode ?? null,
        payload.bankName ?? null,
        payload.bankAccountName ?? null,
        payload.bankAccountNumber ?? null,
        payload.mobileBankingType ?? null,
        payload.mobileBankingNumber ?? null,
        payload.educationSummary ?? null,
        payload.experienceSummary ?? null,
        payload.trainingSummary ?? null,
        payload.note ?? null,
      ],
    );
    return { employee: result.rows[0] };
  }

  async updateEmployee(
    employeeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{
      fullName: string;
      mobileNo: string | null;
      email: string | null;
      addressText: string | null;
      roleCode: string;
      employmentStatus: 'active' | 'inactive' | 'terminated';
      joinDate: string;
      employmentType: string;
      designation: string;
      department: string;
      monthlySalary: number;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      salaryPaymentMode: 'cash' | 'bank_transfer' | 'mobile_banking';
      bankName: string | null;
      bankAccountName: string | null;
      bankAccountNumber: string | null;
      mobileBankingType: string | null;
      mobileBankingNumber: string | null;
      educationSummary: string | null;
      experienceSummary: string | null;
      trainingSummary: string | null;
      note: string | null;
    }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const result = await this.pool.query(
      `
        update hr.employees
        set
          full_name = coalesce($3, full_name),
          mobile_no = case when $4::varchar is null then mobile_no else $4::varchar end,
          email = case when $5::citext is null then email else $5::citext end,
          address_text = case when $6::text is null then address_text else $6::text end,
          role_code = coalesce($7, role_code),
          employment_status = coalesce($8, employment_status),
          join_date = coalesce($9::date, join_date),
          employment_type = coalesce($10, employment_type),
          designation = case when $11::varchar is null then designation else $11::varchar end,
          department = case when $12::varchar is null then department else $12::varchar end,
          monthly_salary = coalesce($13, monthly_salary),
          emergency_contact_name = case when $14::varchar is null then emergency_contact_name else $14::varchar end,
          emergency_contact_phone = case when $15::varchar is null then emergency_contact_phone else $15::varchar end,
          salary_payment_mode = case when $16::varchar is null then salary_payment_mode else $16::varchar end,
          bank_name = case when $17::varchar is null then bank_name else $17::varchar end,
          bank_account_name = case when $18::varchar is null then bank_account_name else $18::varchar end,
          bank_account_number = case when $19::varchar is null then bank_account_number else $19::varchar end,
          mobile_banking_type = case when $20::varchar is null then mobile_banking_type else $20::varchar end,
          mobile_banking_number = case when $21::varchar is null then mobile_banking_number else $21::varchar end,
          education_summary = case when $22::text is null then education_summary else $22::text end,
          experience_summary = case when $23::text is null then experience_summary else $23::text end,
          training_summary = case when $24::text is null then training_summary else $24::text end,
          note = case when $25::text is null then note else $25::text end,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [
        employeeId,
        storeId,
        payload.fullName ?? null,
        payload.mobileNo === undefined ? null : payload.mobileNo,
        payload.email === undefined ? null : payload.email,
        payload.addressText === undefined ? null : payload.addressText,
        payload.roleCode ?? null,
        payload.employmentStatus ?? null,
        payload.joinDate ?? null,
        payload.employmentType ?? null,
        payload.designation ?? null,
        payload.department ?? null,
        payload.monthlySalary ?? null,
        payload.emergencyContactName === undefined ? null : payload.emergencyContactName,
        payload.emergencyContactPhone === undefined ? null : payload.emergencyContactPhone,
        payload.salaryPaymentMode ?? null,
        payload.bankName === undefined ? null : payload.bankName,
        payload.bankAccountName === undefined ? null : payload.bankAccountName,
        payload.bankAccountNumber === undefined ? null : payload.bankAccountNumber,
        payload.mobileBankingType === undefined ? null : payload.mobileBankingType,
        payload.mobileBankingNumber === undefined ? null : payload.mobileBankingNumber,
        payload.educationSummary === undefined ? null : payload.educationSummary,
        payload.experienceSummary === undefined ? null : payload.experienceSummary,
        payload.trainingSummary === undefined ? null : payload.trainingSummary,
        payload.note === undefined ? null : payload.note,
      ],
    );
    if (!result.rows[0]) throw new NotFoundException('Employee not found');
    return { employee: result.rows[0] };
  }

  async listPayrollRuns(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            pr.*,
            coalesce(count(pri.id), 0)::int as item_count,
            count(*) over()::int as total_count
          from hr.payroll_runs pr
          left join hr.payroll_run_items pri on pri.payroll_run_id = pr.id
          where pr.store_id = $1
            and (
              $2::text is null
              or coalesce(pr.payroll_no, '') ilike '%' || $2::text || '%'
              or coalesce(pr.status, '') ilike '%' || $2::text || '%'
            )
          group by pr.id
          order by pr.period_end desc, pr.created_at desc
          limit $3
          offset $4
        ) payroll_runs
      `,
      [storeId, search, limit, offset],
    );
    const { items, total } = stripPaginationTotal(result.rows);
    return { payrollRuns: items, pagination: { page, limit, total } };
  }

  async createPayrollRun(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      periodStart: string;
      periodEnd: string;
      status: 'draft' | 'approved' | 'paid';
      note?: string;
      items: Array<{
        employeeId: string;
        grossAmount: number;
        bonusAmount: number;
        deductionAmount: number;
        note?: string;
      }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    this.assertAllowedRoles(authContext, ['store_owner']);

    const totalAmount = payload.items.reduce(
      (sum, item) => sum + item.grossAmount + item.bonusAmount - item.deductionAmount,
      0,
    );
    const totalBonusAmount = payload.items.reduce((sum, item) => sum + item.bonusAmount, 0);
    const totalDeductionAmount = payload.items.reduce((sum, item) => sum + item.deductionAmount, 0);
    const payrollNo = await this.generatePayrollNumber(storeId, payload.periodStart);

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const runResult = await client.query<{ id: string }>(
        `
          insert into hr.payroll_runs (
            id, tenant_id, store_id, payroll_no, period_start, period_end, status, total_amount, total_employees, total_bonus_amount, total_deduction_amount, processed_by, note, created_at, updated_at
          )
          select gen_random_uuid(), $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now()
          returning id
        `,
        [storeId, session?.user.tenantId ?? '', payrollNo, payload.periodStart, payload.periodEnd, payload.status, totalAmount, payload.items.length, totalBonusAmount, totalDeductionAmount, userId, payload.note ?? null],
      );

      const payrollRunId = runResult.rows[0].id;
      for (const item of payload.items) {
        const netAmount = item.grossAmount + item.bonusAmount - item.deductionAmount;
        await client.query(
          `
            insert into hr.payroll_run_items (
              id, payroll_run_id, employee_id, gross_amount, bonus_amount, deduction_amount, net_amount, note, created_at
            )
            values (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now()
            )
          `,
          [payrollRunId, item.employeeId, item.grossAmount, item.bonusAmount, item.deductionAmount, netAmount, item.note ?? null],
        );
      }
      await client.query('commit');
      return { payrollRunId, payrollNo, totalAmount, totalBonusAmount, totalDeductionAmount };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePayrollRun(
    payrollRunId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{ status: 'draft' | 'approved' | 'paid'; note: string | null }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        update hr.payroll_runs
        set
          status = coalesce($3, status),
          note = case when $4::text is null then note else $4::text end,
          paid_at = case
            when coalesce($3, status) = 'paid' and paid_at is null then now()
            when coalesce($3, status) <> 'paid' then null
            else paid_at
          end,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [payrollRunId, storeId, payload.status ?? null, payload.note === undefined ? null : payload.note],
    );
    if (!result.rows[0]) throw new NotFoundException('Payroll run not found');
    return { payrollRun: result.rows[0] };
  }

  async getHardwareProfile(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query<{ hardware_profile: Record<string, unknown> | null }>(
      `
        select hardware_profile
        from store.store_settings
        where store_id = $1
        limit 1
      `,
      [storeId],
    );

    return {
      profile: result.rows[0]?.hardware_profile ?? {},
      catalog: HARDWARE_CATALOG,
      autostart: {
        windowsScript: 'print-agent/scripts/install-windows-task.ps1',
        macScript: 'print-agent/scripts/install-macos-launchagent.sh',
      },
    };
  }

  async updateHardwareProfile(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      bundlePreset?: string | null;
      receiptPrinterModel?: string | null;
      labelPrinterModel?: string | null;
      barcodeScannerModel?: string | null;
      cashDrawerModel?: string | null;
      silentPrintingEnabled?: boolean;
      printAgentAutostart?: 'windows_task' | 'mac_launchagent' | 'manual';
      notes?: string | null;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    this.requireUserId(session);

    const patch = JSON.stringify({
      ...(payload.bundlePreset !== undefined ? { bundlePreset: payload.bundlePreset } : {}),
      ...(payload.receiptPrinterModel !== undefined ? { receiptPrinterModel: payload.receiptPrinterModel } : {}),
      ...(payload.labelPrinterModel !== undefined ? { labelPrinterModel: payload.labelPrinterModel } : {}),
      ...(payload.barcodeScannerModel !== undefined ? { barcodeScannerModel: payload.barcodeScannerModel } : {}),
      ...(payload.cashDrawerModel !== undefined ? { cashDrawerModel: payload.cashDrawerModel } : {}),
      ...(payload.silentPrintingEnabled !== undefined ? { silentPrintingEnabled: payload.silentPrintingEnabled } : {}),
      ...(payload.printAgentAutostart !== undefined ? { printAgentAutostart: payload.printAgentAutostart } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    });

    const result = await this.pool.query(
      `
        update store.store_settings
        set
          hardware_profile = coalesce(hardware_profile, '{}'::jsonb) || $2::jsonb,
          updated_at = now()
        where store_id = $1
        returning hardware_profile
      `,
      [storeId, patch],
    );

    if (!result.rows[0]) throw new NotFoundException('Store settings not found');

    return { profile: result.rows[0].hardware_profile, catalog: HARDWARE_CATALOG };
  }

  async listBankAccounts(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            *,
            count(*) over()::int as total_count
          from finance.bank_accounts
          where store_id = $1
            and (
              $2::text is null
              or account_name ilike '%' || $2::text || '%'
              or bank_name ilike '%' || $2::text || '%'
              or account_number ilike '%' || $2::text || '%'
            )
          order by created_at desc
          limit $3
          offset $4
        ) bank_accounts
      `,
      [storeId, search, limit, offset],
    );
    const { items, total } = stripPaginationTotal(result.rows);
    return { bankAccounts: items, pagination: { page, limit, total } };
  }

  async createBankAccount(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      accountName: string;
      bankName: string;
      accountNumber: string;
      openingBalance: number;
      currentBalance: number;
      status: 'active' | 'inactive';
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        insert into finance.bank_accounts (
          id, tenant_id, store_id, account_name, bank_name, account_number, opening_balance, current_balance, status, note, created_at, updated_at
        )
        select gen_random_uuid(), $2, $1, $3, $4, $5, $6, $7, $8, $9, now(), now()
        returning *
      `,
      [storeId, session?.user.tenantId ?? '', payload.accountName, payload.bankName, payload.accountNumber, payload.openingBalance, payload.currentBalance, payload.status, payload.note ?? null],
    );
    return { bankAccount: result.rows[0] };
  }

  async updateBankAccount(
    bankAccountId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{
      accountName: string;
      bankName: string;
      accountNumber: string;
      openingBalance: number;
      currentBalance: number;
      status: 'active' | 'inactive';
      note: string | null;
    }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        update finance.bank_accounts
        set
          account_name = coalesce($3, account_name),
          bank_name = coalesce($4, bank_name),
          account_number = coalesce($5, account_number),
          opening_balance = coalesce($6, opening_balance),
          current_balance = coalesce($7, current_balance),
          status = coalesce($8, status),
          note = case when $9::text is null then note else $9::text end,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [bankAccountId, storeId, payload.accountName ?? null, payload.bankName ?? null, payload.accountNumber ?? null, payload.openingBalance ?? null, payload.currentBalance ?? null, payload.status ?? null, payload.note === undefined ? null : payload.note],
    );
    if (!result.rows[0]) throw new NotFoundException('Bank account not found');
    return { bankAccount: result.rows[0] };
  }

  async listBankEntries(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            bre.*,
            ba.account_name,
            ba.bank_name,
            count(*) over()::int as total_count
          from finance.bank_reconciliation_entries bre
          join finance.bank_accounts ba on ba.id = bre.bank_account_id
          where bre.store_id = $1
            and (
              $2::text is null
              or ba.account_name ilike '%' || $2::text || '%'
              or ba.bank_name ilike '%' || $2::text || '%'
              or coalesce(bre.reference_no, '') ilike '%' || $2::text || '%'
              or bre.source_type ilike '%' || $2::text || '%'
            )
          order by bre.entry_date desc, bre.created_at desc
          limit $3
          offset $4
        ) bank_entries
      `,
      [storeId, search, limit, offset],
    );
    const { items, total } = stripPaginationTotal(result.rows);
    return { entries: items, pagination: { page, limit, total } };
  }

  async createBankEntry(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      bankAccountId: string;
      entryDate: string;
      entryType: 'credit' | 'debit';
      sourceType: 'sale' | 'expense' | 'deposit' | 'adjustment';
      referenceNo?: string;
      amount: number;
      status: 'pending' | 'matched' | 'flagged';
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        insert into finance.bank_reconciliation_entries (
          id, tenant_id, store_id, bank_account_id, entry_date, entry_type, source_type, reference_no, amount, status, note, created_by, created_at, updated_at
        )
        select gen_random_uuid(), $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now()
        returning *
      `,
      [storeId, session?.user.tenantId ?? '', payload.bankAccountId, payload.entryDate, payload.entryType, payload.sourceType, payload.referenceNo ?? null, payload.amount, payload.status, payload.note ?? null, userId],
    );
    return { entry: result.rows[0] };
  }

  async updateBankEntry(
    entryId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: Partial<{
      entryDate: string;
      entryType: 'credit' | 'debit';
      sourceType: 'sale' | 'expense' | 'deposit' | 'adjustment';
      referenceNo: string | null;
      amount: number;
      status: 'pending' | 'matched' | 'flagged';
      note: string | null;
    }>,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        update finance.bank_reconciliation_entries
        set
          entry_date = coalesce($3::date, entry_date),
          entry_type = coalesce($4, entry_type),
          source_type = coalesce($5, source_type),
          reference_no = case when $6::varchar is null then reference_no else $6::varchar end,
          amount = coalesce($7, amount),
          status = coalesce($8, status),
          note = case when $9::text is null then note else $9::text end,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [entryId, storeId, payload.entryDate ?? null, payload.entryType ?? null, payload.sourceType ?? null, payload.referenceNo === undefined ? null : payload.referenceNo, payload.amount ?? null, payload.status ?? null, payload.note === undefined ? null : payload.note],
    );
    if (!result.rows[0]) throw new NotFoundException('Bank entry not found');
    return { entry: result.rows[0] };
  }

  private async generateEmployeeNumber(storeId: string) {
    const storeResult = await this.pool.query<{ store_code: string }>(
      `
        select store_code
        from store.stores
        where id = $1
        limit 1
      `,
      [storeId],
    );

    const rawStoreCode = storeResult.rows[0]?.store_code ?? 'STORE';
    const prefix = rawStoreCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'STORE';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const countResult = await this.pool.query<{ total: string }>(
        `
          select count(*)::text as total
          from hr.employees
          where store_id = $1
        `,
        [storeId],
      );
      const candidate = `${prefix}-${String(Number(countResult.rows[0]?.total ?? '0') + 1 + attempt).padStart(4, '0')}`;
      const existing = await this.pool.query<{ id: string }>(
        `
          select id
          from hr.employees
          where store_id = $1
            and employee_number = $2
          limit 1
        `,
        [storeId, candidate],
      );
      if (!existing.rows[0]) {
        return candidate;
      }
    }

    return `${prefix}-${Date.now().toString().slice(-4)}`;
  }

  private async generatePayrollNumber(storeId: string, periodStart: string) {
    const storeResult = await this.pool.query<{ store_code: string }>(
      `
        select store_code
        from store.stores
        where id = $1
        limit 1
      `,
      [storeId],
    );

    const prefix = (storeResult.rows[0]?.store_code ?? 'STORE')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'STORE';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const countResult = await this.pool.query<{ total: string }>(
        `
          select count(*)::text as total
          from hr.payroll_runs
          where store_id = $1
            and to_char(period_start, 'YYYYMM') = to_char($2::date, 'YYYYMM')
        `,
        [storeId, periodStart],
      );
      const candidate = `PAY-${prefix}-${periodStart.slice(0, 7).replace('-', '')}-${String(Number(countResult.rows[0]?.total ?? '0') + 1 + attempt).padStart(3, '0')}`;
      const existing = await this.pool.query<{ id: string }>(
        `
          select id
          from hr.payroll_runs
          where store_id = $1
            and payroll_no = $2
          limit 1
        `,
        [storeId, candidate],
      );
      if (!existing.rows[0]) {
        return candidate;
      }
    }

    return `PAY-${prefix}-${Date.now().toString().slice(-6)}`;
  }

  private async getDefaultInventoryLocationId(storeId: string) {
    const locationResult = await this.pool.query<{ id: string }>(
      `
        select id
        from inventory.locations
        where store_id = $1
          and status = 'active'
        order by
          case when location_type = 'storefront' then 0 when location_type = 'warehouse' then 1 else 2 end,
          created_at asc
        limit 1
      `,
      [storeId],
    );

    const locationId = locationResult.rows[0]?.id;
    if (!locationId) {
      throw new NotFoundException('Create an active inventory location before receiving purchases');
    }

    return locationId;
  }

  private async generatePurchaseNumber(storeId: string, purchaseDate: string) {
    const storeResult = await this.pool.query<{ store_code: string }>(
      `
        select store_code
        from store.stores
        where id = $1
        limit 1
      `,
      [storeId],
    );

    const prefix = (storeResult.rows[0]?.store_code ?? 'STORE')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'STORE';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const countResult = await this.pool.query<{ total: string }>(
        `
          select count(*)::text as total
          from procurement.purchases
          where store_id = $1
            and to_char(purchase_date, 'YYYYMM') = to_char($2::date, 'YYYYMM')
        `,
        [storeId, purchaseDate],
      );
      const candidate = `PUR-${prefix}-${purchaseDate.slice(0, 7).replace('-', '')}-${String(Number(countResult.rows[0]?.total ?? '0') + 1 + attempt).padStart(3, '0')}`;
      const existing = await this.pool.query<{ id: string }>(
        `
          select id
          from procurement.purchases
          where store_id = $1
            and purchase_no = $2
          limit 1
        `,
        [storeId, candidate],
      );
      if (!existing.rows[0]) {
        return candidate;
      }
    }

    return `PUR-${prefix}-${Date.now().toString().slice(-6)}`;
  }



  async quickReceive(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      productName: string;
      categoryId?: string;
      brandId?: string;
      supplierId: string;
      locationId: string;
      salePrice: number;
      purchaseQty: number;
      unitCost: number;
      paidAmount: number;
      paymentMethod: string;
      paymentReference?: string;
      hasVariants: boolean;
      variantLabels?: string[];
      variantPrices?: number[];
      variantCosts?: number[];
      isTrackable?: boolean;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      // Resolve tenant
      const tenantResult = await client.query<{ tenant_id: string; store_code: string }>(
        `select tenant_id, store_code from store.stores where id = $1 limit 1`, [storeId],
      );
      const { tenant_id: tenantId } = tenantResult.rows[0];

      // Trim name and generate product code
      const productName = payload.productName.trim();
      const baseCode = productName.replace(/[^A-Za-z0-9]/g, '-').toUpperCase().slice(0, 28) || 'PRODUCT';
      const productCode = `${baseCode}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const categoryId = payload.categoryId || null;
      const brandId = payload.brandId || null;

      // Generate purchase number (use same logic as createPurchase)
      const today = new Date().toISOString().slice(0, 10);
      const purchaseNo = await this.generatePurchaseNumber(storeId, today);

      // Calculate totals
      const subtotal = payload.purchaseQty * payload.unitCost;
      const totalAmount = subtotal;
      const paidAmount = Math.min(payload.paidAmount, totalAmount);
      const isFullyPaid = paidAmount >= totalAmount;

      // 1. Create product
      const productResult = await client.query<{ id: string }>(
        `insert into catalog.products (id, tenant_id, store_id, product_code, name, category_id, brand_id, has_variants, variant_mode, is_trackable, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', now(), now()) returning id`,
        [tenantId, storeId, productCode, productName, categoryId, brandId, payload.hasVariants, payload.hasVariants ? 'single' : 'none', payload.isTrackable ?? true],
      );
      const productId = productResult.rows[0].id;

      // 2. Create SKU(s)
      const skus: Array<{ id: string; skuCode: string; label: string | null; price: number; cost: number; qty: number }> = [];

      if (payload.hasVariants && payload.variantLabels?.length) {
        for (let i = 0; i < payload.variantLabels.length; i++) {
          const label = payload.variantLabels[i].trim();
          const price = payload.variantPrices?.[i] ?? payload.salePrice;
          const cost = payload.variantCosts?.[i] ?? payload.unitCost;
          const vTs = Date.now() + i;
          const vBarcode = '2' + String(vTs).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
          const skuCode = `${productCode}-${label.replace(/[^A-Za-z0-9]/g, '-').toUpperCase()}`.slice(0, 80);
          const skuResult = await client.query<{ id: string }>(
            `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, variant_label, status, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
            [tenantId, storeId, productId, skuCode, label],
          );
          // Insert price record
          await client.query(
            `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
            [tenantId, storeId, skuResult.rows[0].id, String(price), String(cost)],
          );
          skus.push({ id: skuResult.rows[0].id, skuCode, label, price, cost, qty: 1 });
        }
      } else {
        const skuCode = productCode.slice(0, 40);
        const skuResult = await client.query<{ id: string }>(
          `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, status, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'active', now(), now()) returning id`,
          [tenantId, storeId, productId, skuCode],
        );
        // Insert price record
        await client.query(
          `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
          [tenantId, storeId, skuResult.rows[0].id, String(payload.salePrice), String(payload.unitCost)],
        );
        skus.push({ id: skuResult.rows[0].id, skuCode, label: null, price: payload.salePrice, cost: payload.unitCost, qty: payload.purchaseQty });
      }

      // 3. Create purchase record
      const purchaseResult = await client.query<{ id: string }>(
        `insert into procurement.purchases (id, tenant_id, store_id, supplier_id, location_id, purchase_no, purchase_date, status, subtotal_amount, discount_amount, tax_amount, shipping_amount, total_amount, paid_amount, payment_status, note, created_by, received_at, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'received', $7, 0, 0, 0, $8, $9, $10, $11, $12, now(), now(), now()) returning id`,
        [tenantId, storeId, payload.supplierId, payload.locationId, purchaseNo, today, subtotal, totalAmount, paidAmount, paidAmount <= 0 ? 'pending' : isFullyPaid ? 'paid' : 'partial', payload.note || null, userId],
      );
      const purchaseId = purchaseResult.rows[0].id;

      // 4. Create purchase items, update balances, write ledger
      for (const sku of skus) {
        const lineTotal = sku.qty * sku.cost;
        await client.query(
          `insert into procurement.purchase_items (id, purchase_id, sku_id, product_name_snapshot, sku_code_snapshot, qty, unit_cost, line_total, created_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now())`,
          [purchaseId, sku.id, productName, sku.skuCode, sku.qty, sku.cost, lineTotal],
        );

        // Upsert inventory balance
        await client.query(
          `insert into inventory.balances (id, tenant_id, store_id, location_id, sku_id, on_hand_qty, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, now())
           on conflict (location_id, sku_id) do update set on_hand_qty = inventory.balances.on_hand_qty + $5, updated_at = now()`,
          [tenantId, storeId, payload.locationId, sku.id, sku.qty],
        );

        // Write ledger
        await client.query(
          `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'purchase_receive', $5, 'purchase', $6, $7, $8, now())`,
          [tenantId, storeId, payload.locationId, sku.id, sku.qty, purchaseId, `Quick receive ${purchaseNo}`, userId],
        );
      }

      // 5. Record payment if paid
      if (paidAmount > 0) {
        await client.query(
          `insert into procurement.purchase_payments (id, purchase_id, payment_method, amount, reference_no, status, paid_at, created_by, created_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'paid', now(), $5, now())`,
          [purchaseId, payload.paymentMethod, paidAmount, payload.paymentReference || null, userId],
        );
      }

      await client.query('commit');

      return {
        product: { id: productId, name: productName, productCode },
        purchase: { id: purchaseId, purchaseNo, totalAmount, paidAmount },
        skus,
        stockUpdated: true,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async quickExchange(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      productName: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      categoryId?: string;
      brandId?: string;
      salePrice: number;
      unitCost: number;
      hasVariants: boolean;
      variantLabels?: string[];
      variantPrices?: number[];
      variantCosts?: number[];
      isTrackable?: boolean;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const tenantResult = await client.query<{ tenant_id: string; store_code: string }>(
        'select tenant_id, store_code from store.stores where id = $1 limit 1', [storeId],
      );
      const tenantId = tenantResult.rows[0].tenant_id;

      const productName = payload.productName.trim();
      const baseCode = productName.replace(/[^A-Za-z0-9]/g, '-').toUpperCase().slice(0, 28) || 'EXCHANGE';
      const productCode = `${baseCode}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const categoryId = payload.categoryId || null;
      const brandId = payload.brandId || null;

      // 1. Create exchange product
      const productResult = await client.query<{ id: string }>(
        `insert into catalog.products (id, tenant_id, store_id, product_code, name, category_id, brand_id, has_variants, variant_mode, is_trackable, product_type, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'exchange', 'active', now(), now()) returning id`,
        [tenantId, storeId, productCode, productName, categoryId, brandId, payload.hasVariants, payload.hasVariants ? 'single' : 'none', payload.isTrackable ?? false],
      );
      const productId = productResult.rows[0].id;

      // 2. Create SKU(s) + prices (no inventory or purchase)
      const skus: Array<{ id: string; skuCode: string; label: string | null; price: number; cost: number }> = [];

      if (payload.hasVariants && payload.variantLabels?.length) {
        for (let i = 0; i < payload.variantLabels.length; i++) {
          const label = payload.variantLabels[i].trim();
          const price = payload.variantPrices?.[i] ?? payload.salePrice;
          const cost = payload.variantCosts?.[i] ?? payload.unitCost;
          const vTs = Date.now() + i;
          const vBarcode = '2' + String(vTs).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
          const skuCode = `${productCode}-${label.replace(/[^A-Za-z0-9]/g, '-').toUpperCase()}`.slice(0, 80);
          const skuResult = await client.query<{ id: string }>(
            `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, variant_label, status, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
            [tenantId, storeId, productId, skuCode, label],
          );
          await client.query(
            `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
            [tenantId, storeId, skuResult.rows[0].id, String(price), String(cost)],
          );
          skus.push({ id: skuResult.rows[0].id, skuCode, label, price, cost });
        }
      } else {
        const skuCode = productCode.slice(0, 40);
        const skuResult = await client.query<{ id: string }>(
          `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, status, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'active', now(), now()) returning id`,
          [tenantId, storeId, productId, skuCode],
        );
        await client.query(
          `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
          [tenantId, storeId, skuResult.rows[0].id, String(payload.salePrice), String(payload.unitCost)],
        );
        skus.push({ id: skuResult.rows[0].id, skuCode, label: null, price: payload.salePrice, cost: payload.unitCost });
      }

      // 3. Record exchange product metadata — store customer info in product description
      const customerInfo = [
        `Exchange from: ${payload.customerName}`,
        `Phone: ${payload.customerPhone}`,
        payload.customerEmail ? `Email: ${payload.customerEmail}` : null,
        payload.note ? `Note: ${payload.note}` : null,
      ].filter(Boolean).join('\n');

      await client.query(
        `update catalog.products set description = $1, updated_at = now() where id = $2`,
        [customerInfo, productId],
      );

      await client.query('commit');

      return {
        product: { id: productId, name: productName, productCode },
        skus,
        customer: { name: payload.customerName, phone: payload.customerPhone, email: payload.customerEmail },
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

  private assertAllowedRoles(authContext: StoreAuthContext | null, allowedRoles: StoreRole[]) {
    const roles = authContext?.roles ?? [];
    if (!roles.some((role) => allowedRoles.includes(role as StoreRole))) {
      throw new ForbiddenException('Your role cannot access this workflow');
    }
  }

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }
    return session.user.id;
  }

  private async getExpectedCashAmount(storeId: string) {
    const [cashSalesResult, cashDueCollectionsResult, cashExpensesResult] = await Promise.all([
      this.pool.query<{ today_cash_sales_amount: string }>(
        `
          select
            coalesce(sum(sp.amount) filter (where sp.status = 'paid'), 0) as today_cash_sales_amount
          from sales.sale_payments sp
          join sales.sales s on s.id = sp.sale_id
          where s.store_id = $1
            and s.due_date is null
            and sp.payment_method = 'cash'
            and sp.paid_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query<{ today_cash_due_collection_amount: string }>(
        `
          select
            coalesce(sum(sp.amount) filter (where sp.status = 'paid'), 0) as today_cash_due_collection_amount
          from sales.sale_payments sp
          join sales.sales s on s.id = sp.sale_id
          where s.store_id = $1
            and s.due_date is not null
            and sp.payment_method = 'cash'
            and sp.paid_at::date = current_date
        `,
        [storeId],
      ),
      this.pool.query<{ today_cash_expense_amount: string }>(
        `
          select
            coalesce(sum(amount), 0) as today_cash_expense_amount
          from finance.daily_expenses
          where store_id = $1
            and payment_method = 'cash'
            and expense_date = current_date
            and status <> 'void'
        `,
        [storeId],
      ),
    ]);

    return Number(cashSalesResult.rows[0]?.today_cash_sales_amount ?? 0)
      + Number(cashDueCollectionsResult.rows[0]?.today_cash_due_collection_amount ?? 0)
      - Number(cashExpensesResult.rows[0]?.today_cash_expense_amount ?? 0);
  }
}
