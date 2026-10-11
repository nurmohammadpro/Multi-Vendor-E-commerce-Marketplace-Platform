import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

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
      pendingReturnResult,
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
      this.pool.query<{ pending_return_count: number }>(
        `
          select count(*)::int as pending_return_count
          from sales.sale_returns
          where store_id = $1
            and status = 'pending_approval'
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
    const pendingReturnApprovals = Number(pendingReturnResult.rows[0]?.pending_return_count ?? 0);
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
        totalPendingApprovals: pendingStockApprovals + pendingPriceApprovals + pendingReturnApprovals,
        pendingReturnApprovals,
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

  async getReceiveSummary(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    params: {
      fromDate?: string;
      toDate?: string;
      productId?: string;
      supplierId?: string;
      locationId?: string;
      groupBy?: 'product' | 'supplier' | 'location' | 'date';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    // Build date filters
    const dateConditions: string[] = [];
    const queryParams: any[] = [storeId];
    let paramIndex = 2;

    if (params.fromDate) {
      dateConditions.push(`p.purchase_date >= $${paramIndex++}::date`);
      queryParams.push(params.fromDate);
    }
    if (params.toDate) {
      dateConditions.push(`p.purchase_date <= $${paramIndex++}::date`);
      queryParams.push(params.toDate);
    }

    const dateFilter = dateConditions.length > 0 ? `and ${dateConditions.join(' and ')}` : '';

    // Build additional filters
    const filters: string[] = [];
    if (params.productId) {
      filters.push(`pi.sku_id in (select id from catalog.skus where product_id = $${paramIndex++})`);
      queryParams.push(params.productId);
    }
    if (params.supplierId) {
      filters.push(`p.supplier_id = $${paramIndex++}`);
      queryParams.push(params.supplierId);
    }
    if (params.locationId) {
      filters.push(`p.location_id = $${paramIndex++}`);
      queryParams.push(params.locationId);
    }

    const additionalFilters = filters.length > 0 ? `and ${filters.join(' and ')}` : '';

    // Build group by clause
    let groupByClause: string;
    let selectFields: string;

    switch (params.groupBy) {
      case 'product':
        groupByClause = 'group by p.id, pi.product_name_snapshot, pi.sku_code_snapshot';
        selectFields = `
          pi.product_name_snapshot as product_name,
          pi.sku_code_snapshot as sku_code,
          coalesce(sum(pi.qty), 0) as total_quantity,
          coalesce(sum(pi.line_total), 0) as total_value,
          count(distinct p.id) as purchase_count
        `;
        break;
      case 'supplier':
        groupByClause = 'group by s.id, s.company_name';
        selectFields = `
          s.id as supplier_id,
          s.company_name as supplier_name,
          coalesce(sum(pi.qty), 0) as total_quantity,
          coalesce(sum(pi.line_total), 0) as total_value,
          count(distinct p.id) as purchase_count
        `;
        break;
      case 'location':
        groupByClause = 'group by l.id, l.name, l.code';
        selectFields = `
          l.id as location_id,
          l.name as location_name,
          l.code as location_code,
          coalesce(sum(pi.qty), 0) as total_quantity,
          coalesce(sum(pi.line_total), 0) as total_value,
          count(distinct p.id) as purchase_count
        `;
        break;
      case 'date':
        groupByClause = 'group by p.purchase_date';
        selectFields = `
          p.purchase_date as receive_date,
          coalesce(sum(pi.qty), 0) as total_quantity,
          coalesce(sum(pi.line_total), 0) as total_value,
          count(distinct p.id) as purchase_count
        `;
        break;
      default:
        groupByClause = 'group by p.id, pi.product_name_snapshot, pi.sku_code_snapshot';
        selectFields = `
          pi.product_name_snapshot as product_name,
          pi.sku_code_snapshot as sku_code,
          coalesce(sum(pi.qty), 0) as total_quantity,
          coalesce(sum(pi.line_total), 0) as total_value,
          count(distinct p.id) as purchase_count
        `;
    }

    const query = `
      select
        ${selectFields}
      from procurement.purchases p
      left join procurement.purchase_items pi on pi.purchase_id = p.id
      left join procurement.suppliers s on s.id = p.supplier_id
      left join inventory.locations l on l.id = p.location_id
      where p.store_id = $1
        and (p.status = 'received' or p.status = 'partially_received' or p.status = 'fully_received')
        ${dateFilter}
        ${additionalFilters}
      ${groupByClause}
      order by total_quantity desc
    `;

    const result = await this.pool.query(query, queryParams);

    return {
      groupBy: params.groupBy || 'product',
      filters: {
        fromDate: params.fromDate || null,
        toDate: params.toDate || null,
        productId: params.productId || null,
        supplierId: params.supplierId || null,
        locationId: params.locationId || null,
      },
      summary: result.rows,
      totalRecords: result.rows.length,
    };
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
      status?: 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'received';
      items: Array<{ skuId: string; qty: number; unitCost: number; batchNo?: string; expiryDate?: string }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const userId = this.requireUserId(session);
    const locationId = payload.locationId ?? await this.getDefaultInventoryLocationId(storeId);
    const purchaseNo = await this.generatePurchaseNumber(storeId, payload.purchaseDate);
    const purchaseStatus = payload.status ?? 'confirmed';

    const supplierExists = await this.pool.query<{ id: string }>(
      `select id from procurement.suppliers where id = $1 and store_id = $2 limit 1`,
      [payload.supplierId, storeId],
    );
    if (!supplierExists.rows[0]) throw new NotFoundException('Supplier not found');

    // For draft purchases, skip SKU validation and allow empty items
    const skuMap = new Map<string, { id: string; sku_code: string; product_name: string; variant_label: string | null }>();
    if (payload.items.length > 0) {
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

      for (const row of skuResult.rows) {
        skuMap.set(row.id, row);
      }
    }

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

    // Calculate totals (skip for empty draft purchases)
    const subtotalAmount = payload.items.length > 0
      ? payload.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
      : 0;
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
            payment_status, status, note, created_by, received_at, created_at, updated_at,
            received_items_qty, total_items_qty
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            case when $14 = 'received' then now() else null end,
            now(), now(),
            case when $14 = 'received' then $17 else 0 end,
            $17
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
          purchaseStatus,
          payload.note ?? null,
          userId,
          payload.items.length,
        ],
      );

      const purchaseId = purchaseResult.rows[0].id;

      // Only process items if not a draft purchase
      if (purchaseStatus !== 'draft' && payload.items.length > 0) {
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
      } else if (payload.items.length > 0) {
        // For draft purchases, still create the purchase items but don't update inventory
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
      }

      await client.query('commit');
      return { purchaseId, purchaseNo, totalAmount, paidAmount, paymentStatus, status: purchaseStatus };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePurchase(
    purchaseId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      status?: 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'received' | 'cancelled';
      invoiceNo?: string;
      discountAmount?: number;
      taxAmount?: number;
      shippingAmount?: number;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    // Get current purchase
    const currentResult = await this.pool.query<{
      id: string;
      status: string;
      subtotal_amount: number;
      discount_amount: number;
      tax_amount: number;
      shipping_amount: number;
      total_amount: number;
    }>(
      'select id, status, subtotal_amount, discount_amount, tax_amount, shipping_amount, total_amount from procurement.purchases where id = $1 and store_id = $2',
      [purchaseId, storeId],
    );

    if (currentResult.rows.length === 0) {
      throw new NotFoundException('Purchase not found');
    }

    const current = currentResult.rows[0];

    // Validate status transitions for enhanced workflow
    const validTransitions: Record<string, string[]> = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['partially_received', 'fully_received', 'cancelled'],
      partially_received: ['partially_received', 'fully_received', 'cancelled'],
      fully_received: ['cancelled'],
      received: ['cancelled'], // Legacy support
      cancelled: [],
    };

    if (payload.status && payload.status !== current.status) {
      const allowedTransitions = validTransitions[current.status] || [];
      if (!allowedTransitions.includes(payload.status)) {
        throw new ForbiddenException(`Cannot transition from ${current.status} to ${payload.status}`);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (payload.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(payload.status);
        if (payload.status === 'received' || payload.status === 'partially_received' || payload.status === 'fully_received') {
          updates.push(`received_at = $${paramIndex++}`);
          values.push(new Date().toISOString());
        }
      }

      if (payload.invoiceNo !== undefined) {
        updates.push(`invoice_no = $${paramIndex++}`);
        values.push(payload.invoiceNo);
      }

      if (payload.discountAmount !== undefined) {
        updates.push(`discount_amount = $${paramIndex++}`);
        values.push(payload.discountAmount);
      }

      if (payload.taxAmount !== undefined) {
        updates.push(`tax_amount = $${paramIndex++}`);
        values.push(payload.taxAmount);
      }

      if (payload.shippingAmount !== undefined) {
        updates.push(`shipping_amount = $${paramIndex++}`);
        values.push(payload.shippingAmount);
      }

      if (payload.note !== undefined) {
        updates.push(`note = $${paramIndex++}`);
        values.push(payload.note);
      }

      updates.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());

      // Recalculate total if amounts changed
      if (payload.discountAmount !== undefined || payload.taxAmount !== undefined || payload.shippingAmount !== undefined) {
        const newSubtotal = current.subtotal_amount;
        const newDiscount = payload.discountAmount !== undefined ? payload.discountAmount : current.discount_amount;
        const newTax = payload.taxAmount !== undefined ? payload.taxAmount : current.tax_amount;
        const newShipping = payload.shippingAmount !== undefined ? payload.shippingAmount : current.shipping_amount;
        const newTotal = newSubtotal - newDiscount + newTax + newShipping;

        updates.push(`total_amount = $${paramIndex++}`);
        values.push(newTotal);
      }

      values.push(purchaseId, storeId);

      if (updates.length > 0) {
        await client.query(
          `update procurement.purchases set ${updates.join(', ')} where id = $${paramIndex++} and store_id = $${paramIndex++}`,
          values,
        );
      }

      await client.query('commit');
      return { success: true, message: 'Purchase updated successfully' };
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
    filters: { search?: string; page?: number; limit?: number; sortBy?: string; sortDir?: string } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const sortBy = ['supplier_name', 'purchase_date', 'outstanding_amount', 'aging_days'].includes(filters.sortBy ?? '') ? filters.sortBy! : 'purchase_date';
    const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';

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
          order by ${sortBy} ${sortDir}, p.created_at desc
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
          union all
          select
            opening_payable_amount as outstanding_amount,
            0 as aging_days
          from procurement.suppliers
          where store_id = $1
            and status = 'active'
            and opening_payable_amount > 0
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

  async getSupplierLedger(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { supplierId?: string; fromDate?: string; toDate?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { supplierId, fromDate, toDate } = filters;

    if (!supplierId) {
      throw new Error('supplierId is required');
    }

    // Supplier info
    const supplierResult = await this.pool.query(
      `select id, company_name, phone, email, address, opening_payable_amount
       from procurement.suppliers where id = $1 and store_id = $2`,
      [supplierId, storeId],
    );
    if (!supplierResult.rows.length) {
      throw new NotFoundException('Supplier not found');
    }
    const supplier = supplierResult.rows[0];

    // Opening balance before the fromDate
    const openingResult = await this.pool.query(
      `
        select
          coalesce(sum(greatest(total_amount - paid_amount, 0)), 0) as purchase_outstanding
        from procurement.purchases
        where supplier_id = $1
          and store_id = $2
          and status <> 'cancelled'
          and purchase_date < $3::date
      `,
      [supplierId, storeId, fromDate || '1900-01-01'],
    );
    const openingPurchasesOutstanding = Number(openingResult.rows[0]?.purchase_outstanding ?? 0);
    const openingBalance = Number(supplier.opening_payable_amount ?? 0) + openingPurchasesOutstanding;

    // Transactions within the date range
    const txResult = await this.pool.query(
      `
        select
          p.purchase_date as tx_date,
          p.purchase_no as tx_ref,
          p.invoice_no,
          p.total_amount as purchase_total,
          p.paid_amount as purchase_paid,
          greatest(p.total_amount - p.paid_amount, 0) as purchase_outstanding,
          p.payment_status,
          'purchase' as tx_type,
          p.id as source_id
        from procurement.purchases p
        where p.supplier_id = $1
          and p.store_id = $2
          and p.status <> 'cancelled'
          and p.purchase_date between $3::date and $4::date
        union all
        select
          pp.paid_at::date as tx_date,
          p.purchase_no as tx_ref,
          null as invoice_no,
          null as purchase_total,
          pp.amount as purchase_paid,
          null as purchase_outstanding,
          pp.status as payment_status,
          'payment' as tx_type,
          pp.id as source_id
        from procurement.purchase_payments pp
        join procurement.purchases p on p.id = pp.purchase_id
        where p.supplier_id = $1
          and p.store_id = $2
          and p.status <> 'cancelled'
          and pp.status = 'paid'
          and pp.paid_at::date between $3::date and $4::date
        order by tx_date asc, tx_type, source_id
      `,
      [supplierId, storeId, fromDate || '1900-01-01', toDate || '2099-12-31'],
    );

    // Balance after each transaction
    let runningBalance = openingBalance;
    const transactions = (txResult.rows ?? []).map((row: any) => {
      if (row.tx_type === 'purchase') {
        const debit = Number(row.purchase_total ?? 0);
        const credit = Number(row.purchase_paid ?? 0);
        runningBalance = runningBalance + debit - credit;
        return {
          tx_date: row.tx_date,
          tx_ref: row.tx_ref,
          invoice_no: row.invoice_no,
          tx_type: 'purchase',
          debit,
          credit,
          runningBalance: Math.round(runningBalance * 100) / 100,
        };
      }
      // payment
      const credit = Number(row.purchase_paid ?? 0);
      runningBalance -= credit;
      return {
        tx_date: row.tx_date,
        tx_ref: row.tx_ref,
        invoice_no: null,
        tx_type: 'payment',
        credit,
        debit: 0,
        runningBalance: Math.round(runningBalance * 100) / 100,
      };
    });

    // Closing balance = last running balance
    const closingBalance = transactions.length > 0
      ? transactions[transactions.length - 1].runningBalance
      : openingBalance;

    return {
      supplier: {
        id: supplier.id,
        companyName: supplier.company_name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
      },
      fromDate: fromDate || null,
      toDate: toDate || null,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      transactions,
    };
  }

  async getCustomerLedger(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { customerId?: string; fromDate?: string; toDate?: string },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const { customerId, fromDate, toDate } = filters;

    if (!customerId) {
      throw new Error('customerId is required');
    }

    // Customer info
    const customerResult = await this.pool.query(
      `select id, full_name, mobile_no as phone, email, address, opening_receivable_amount
       from store.customers where id = $1 and store_id = $2`,
      [customerId, storeId],
    );
    if (!customerResult.rows.length) {
      throw new NotFoundException('Customer not found');
    }
    const customer = customerResult.rows[0];

    // Opening balance before the fromDate
    const openingResult = await this.pool.query(
      `
        select
          coalesce(sum(greatest(total_amount - paid_amount - returned_amount, 0)), 0) as sales_outstanding
        from sales.sales
        where customer_id = $1
          and store_id = $2
          and status <> 'cancelled'
          and sale_date < $3::date
      `,
      [customerId, storeId, fromDate || '1900-01-01'],
    );
    const openingSalesOutstanding = Number(openingResult.rows[0]?.sales_outstanding ?? 0);
    const openingBalance = Number(customer.opening_receivable_amount ?? 0) + openingSalesOutstanding;

    // Transactions within the date range
    const txResult = await this.pool.query(
      `
        select
          s.sale_date as tx_date,
          s.sale_no as tx_ref,
          s.invoice_no,
          s.total_amount as sale_total,
          s.paid_amount as sale_paid,
          s.returned_amount as sale_returned,
          greatest(s.total_amount - s.paid_amount - s.returned_amount, 0) as sale_outstanding,
          s.payment_status,
          'sale' as tx_type,
          s.id as source_id
        from sales.sales s
        where s.customer_id = $1
          and s.store_id = $2
          and s.status <> 'cancelled'
          and s.sale_date between $3::date and $4::date
        union all
        select
          sp.paid_at::date as tx_date,
          s.sale_no as tx_ref,
          null as invoice_no,
          null as sale_total,
          sp.amount as sale_paid,
          null as sale_returned,
          null as sale_outstanding,
          sp.status as payment_status,
          'payment' as tx_type,
          sp.id as source_id
        from sales.sale_payments sp
        join sales.sales s on s.id = sp.sale_id
        where s.customer_id = $1
          and s.store_id = $2
          and s.status <> 'cancelled'
          and sp.status = 'paid'
          and sp.paid_at::date between $3::date and $4::date
        order by tx_date asc, tx_type, source_id
      `,
      [customerId, storeId, fromDate || '1900-01-01', toDate || '2099-12-31'],
    );

    // Balance after each transaction
    let runningBalance = openingBalance;
    const transactions = (txResult.rows ?? []).map((row: any) => {
      if (row.tx_type === 'sale') {
        const debit = Number(row.sale_total ?? 0);
        const credit = Number(row.sale_paid ?? 0) + Number(row.sale_returned ?? 0);
        runningBalance = runningBalance + debit - credit;
        return {
          tx_date: row.tx_date,
          tx_ref: row.tx_ref,
          invoice_no: row.invoice_no,
          tx_type: 'sale',
          debit,
          credit,
          runningBalance: Math.round(runningBalance * 100) / 100,
        };
      }
      // payment
      const credit = Number(row.sale_paid ?? 0);
      runningBalance = runningBalance - credit;
      return {
        tx_date: row.tx_date,
        tx_ref: row.tx_ref,
        invoice_no: row.invoice_no,
        tx_type: 'payment',
        debit: 0,
        credit,
        runningBalance: Math.round(runningBalance * 100) / 100,
      };
    });

    // Closing balance = last running balance
    const closingBalance = transactions.length > 0
      ? transactions[transactions.length - 1].runningBalance
      : openingBalance;

    return {
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      },
      fromDate: fromDate || null,
      toDate: toDate || null,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      transactions,
    };
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
    filters: { search?: string; page?: number; limit?: number; startDate?: string; endDate?: string } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const startDate = filters.startDate?.trim() || null;
    const endDate = filters.endDate?.trim() || null;
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
            and ($3::date is null or pr.period_start >= $3::date)
            and ($4::date is null or pr.period_end <= $4::date)
          group by pr.id
          order by pr.period_end desc, pr.created_at desc
          limit $5
          offset $6
        ) payroll_runs
      `,
      [storeId, search, startDate, endDate, limit, offset],
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

  private async syncSkuPricesOnReceive(
    client: PoolClient,
    tenantId: string,
    storeId: string,
    skuId: string,
    unitCost?: number,
    sellPrice?: number,
  ) {
    const nextCost = unitCost && unitCost > 0 ? String(unitCost) : null;
    const nextSell = sellPrice && sellPrice > 0 ? String(sellPrice) : null;
    const latest = await client.query<{ cost_price: string; sale_price: string }>(
      `select cost_price, sale_price from catalog.prices
       where sku_id = $1
       order by effective_from desc, created_at desc
       limit 1`,
      [skuId],
    );
    const prev = latest.rows[0];
    if (!prev) {
      await client.query(
        `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
        [tenantId, storeId, skuId, nextSell ?? '0', nextCost ?? '0'],
      );
      return;
    }
    const costChanged = nextCost !== null && Number(prev.cost_price) !== Number(nextCost);
    const sellChanged = nextSell !== null && Number(prev.sale_price) !== Number(nextSell);
    if (!costChanged && !sellChanged) return;
    await client.query(
      `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
      [tenantId, storeId, skuId, nextSell ?? String(prev.sale_price), nextCost ?? String(prev.cost_price)],
    );
  }

  private async addReceiveBatch(
    client: PoolClient,
    tenantId: string,
    storeId: string,
    skuId: string,
    productId: string,
    purchaseId: string,
    supplierId: string | null,
    qty: number,
    unitCost: number,
    receivedDate: string,
    serialCount: number,
  ) {
    const batchCode = `B-${purchaseId.slice(0, 8)}-${skuId.slice(0, 8)}`;
    await client.query(
      `insert into inventory.stock_batches (id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id, received_date, received_quantity, current_quantity, serial_count, unit_cost, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::date, $8, $8, $9, $10, 'active', now(), now())
       on conflict (store_id, batch_code) do update set
         received_quantity = inventory.stock_batches.received_quantity + $8,
         current_quantity = inventory.stock_batches.current_quantity + $8,
         serial_count = inventory.stock_batches.serial_count + $9,
         updated_at = now()`,
      [tenantId, storeId, batchCode, supplierId, productId, skuId, receivedDate, qty, serialCount, unitCost],
    );
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

      // Resolve brand and category codes for SKU generation
      const brandCode = await this.resolveBrandCode(client, brandId);
      const categoryCode = await this.resolveCategoryCode(client, categoryId);

      // Generate purchase number (use same logic as createPurchase)
      const today = new Date().toISOString().slice(0, 10);
      const purchaseNo = await this.generatePurchaseNumber(storeId, today);

      // Calculate totals
      const subtotal = payload.purchaseQty * payload.unitCost;
      const totalAmount = subtotal;
      const paidAmount = Math.min(payload.paidAmount, totalAmount);
      const isFullyPaid = paidAmount >= totalAmount;

      // 1. Create product — Quick Add makes simple non-variant products; trackable
      // only when explicitly requested (serial intake comes through Receive Stock).
      const productResult = await client.query<{ id: string }>(
        `insert into catalog.products (id, tenant_id, store_id, product_code, name, category_id, brand_id, has_variants, variant_mode, is_trackable, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', now(), now()) returning id`,
        [tenantId, storeId, productCode, productName, categoryId, brandId, payload.hasVariants, payload.hasVariants ? 'single' : 'none', payload.isTrackable ?? false],
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
          const spec = this.encodeSkuSpec(label, productName);
          const skuCode = await this.findUniqueSkuCode(client, storeId, brandCode, categoryCode, spec);
          const skuResult = await client.query<{ id: string }>(
            `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, variant_label, barcode, status, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
            [tenantId, storeId, productId, skuCode, label, vBarcode],
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
        const ts = Date.now();
        const barcode = '2' + String(ts).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const spec = this.encodeSkuSpec(null, productName);
        const skuCode = await this.findUniqueSkuCode(client, storeId, brandCode, categoryCode, spec);
        const skuResult = await client.query<{ id: string }>(
          `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
          [tenantId, storeId, productId, skuCode, barcode],
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

        // FIFO batch layer for non-serialized costing
        await this.addReceiveBatch(client, tenantId, storeId, sku.id, productId, purchaseId, payload.supplierId, sku.qty, sku.cost, today, 0);
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

  async receiveWithTracking(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      productId: string;
      skuId?: string;
      supplierId: string;
      locationId: string;
      unitCost?: number;
      sellPrice?: number;
      batchNo?: string;
      expiryDate?: string;
      qty?: number;
      trackingValuesList?: Record<string, string>[];
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      // Resolve tenant
      const tenantResult = await client.query<{ tenant_id: string }>(
        'select tenant_id from store.stores where id = $1 limit 1', [storeId],
      );
      const { tenant_id: tenantId } = tenantResult.rows[0];

      // 1. Validate product exists and belongs to this store
      const productResult = await client.query<{ id: string; name: string; is_trackable: boolean }>(
        `select id, name, is_trackable from catalog.products where id = $1 and store_id = $2`,
        [payload.productId, storeId],
      );
      if (productResult.rows.length === 0) throw new Error('Product not found');
      const product = productResult.rows[0];

      // 2. Resolve SKU (use provided skuId or get the first/default SKU)
      let skuId = payload.skuId;
      let skuCode: string;
      if (skuId) {
        const skuResult = await client.query<{ id: string; sku_code: string }>(
          `select id, sku_code from catalog.skus where id = $1 and product_id = $2`,
          [skuId, payload.productId],
        );
        if (skuResult.rows.length === 0) throw new Error('SKU not found for this product');
        skuCode = skuResult.rows[0].sku_code;
      } else {
        const skuResult = await client.query<{ id: string; sku_code: string }>(
          `select id, sku_code from catalog.skus where product_id = $1 and status = 'active' order by created_at asc limit 1`,
          [payload.productId],
        );
        if (skuResult.rows.length === 0) throw new Error('No active SKU found for this product');
        skuId = skuResult.rows[0].id;
        skuCode = skuResult.rows[0].sku_code;
      }

      // 3. Resolve tracking profile (if product has one)
      let trackingProfileId: string | null = null;
      const profileResult = await client.query<{ id: string }>(
        `select tp.id from catalog.tracking_profiles tp
         join catalog.products p on p.category_id = tp.category_id
         where p.id = $1 and tp.is_global = false
         union
         select tp.id from catalog.tracking_profiles tp
         where tp.is_global = true and not exists (
           select 1 from catalog.tracking_profiles tp2
           join catalog.products p2 on p2.category_id = tp2.category_id
           where p2.id = $1 and tp2.is_global = false
         )
         limit 1`,
        [payload.productId],
      );
      if (profileResult.rows.length > 0) {
        trackingProfileId = profileResult.rows[0].id;
      }

      // 4. Generate purchase number
      const today = new Date().toISOString().slice(0, 10);
      const purchaseNo = await this.generatePurchaseNumber(storeId, today);

      // 5. Determine quantity and costs
      const isTracked = (payload.trackingValuesList?.length ?? 0) > 0;
      const unitCost = payload.unitCost ?? 0;
      const qty = isTracked ? payload.trackingValuesList!.length : (payload.qty ?? 1);
      const lineTotal = unitCost * qty;

      // 6. Create purchase record with proper totals
      const purchaseResult = await client.query<{ id: string }>(
        `insert into procurement.purchases (id, tenant_id, store_id, supplier_id, location_id, purchase_no, purchase_date, status, subtotal_amount, discount_amount, tax_amount, shipping_amount, total_amount, paid_amount, payment_status, note, created_by, received_at, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'received', $7, 0, 0, 0, $8, 0, 'pending', $9, $10, now(), now(), now()) returning id`,
        [tenantId, storeId, payload.supplierId, payload.locationId, purchaseNo, today, lineTotal, lineTotal, `Receive ${qty} unit(s) of ${product.name}`, userId],
      );
      const purchaseId = purchaseResult.rows[0].id;

      // 7. Create purchase item with proper cost, batch, and expiry
      await client.query(
        `insert into procurement.purchase_items (id, purchase_id, sku_id, product_name_snapshot, sku_code_snapshot, qty, unit_cost, line_total, batch_no, expiry_date, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [purchaseId, skuId, product.name, skuCode, qty, unitCost, lineTotal, payload.batchNo?.trim() || null, payload.expiryDate || null],
      );

      // 8. Create device serials with tracking values for each unit (only for tracked products)
      const createdSerials: Array<{ id: string; serialNumber: string; imeiNumber?: string }> = [];
      if (isTracked) {
        for (const trackingValues of payload.trackingValuesList!) {
        // Determine serial number and IMEI from tracking values
        const serialNumber = trackingValues['serial_number'] || trackingValues['serial'] || `SN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const imeiNumber = trackingValues['imei'] || trackingValues['imei_number'] || undefined;

        // Validate global IMEI uniqueness with enhanced error handling
        if (imeiNumber) {
          try {
            const existingImei = await client.query(
              'select id, serial_number, sku_id from inventory.device_serials where imei_number = $1',
              [imeiNumber],
            );
            if (existingImei.rows.length > 0) {
              const existing = existingImei.rows[0];
              throw new ConflictException(
                `IMEI ${imeiNumber} already exists in the system. ` +
                `Previously registered as serial ${existing.serial_number} for SKU ${existing.sku_id}. ` +
                `Please use a different device or contact support if this appears to be an error.`
              );
            }
          } catch (imeiError: any) {
            if (imeiError instanceof ConflictException) {
              throw imeiError;
            }
            throw new Error(`Failed to validate IMEI uniqueness: ${imeiError.message}`);
          }
        }

        const serialResult = await client.query<{ id: string }>(
          `insert into inventory.device_serials (id, tenant_id, store_id, sku_id, serial_number, imei_number, tracking_values, tracking_profile_id, current_location_id, status, received_date, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'in_stock', now(), now(), now()) returning id`,
          [
            tenantId,
            storeId,
            skuId,
            serialNumber,
            imeiNumber || null,
            JSON.stringify(trackingValues),
            trackingProfileId,
            payload.locationId,
          ],
        );
        createdSerials.push({ id: serialResult.rows[0].id, serialNumber, imeiNumber });
        }
      }

      // 9. Update inventory balance with enhanced error handling
      try {
        await client.query(
          `insert into inventory.balances (id, tenant_id, store_id, location_id, sku_id, on_hand_qty, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, now())
             on conflict (location_id, sku_id) do update set on_hand_qty = inventory.balances.on_hand_qty + $5, updated_at = now()`,
          [tenantId, storeId, payload.locationId, skuId, qty],
        );
      } catch (balanceError: any) {
        if (balanceError.code === '23503') {
          throw new ConflictException('Invalid location or SKU reference');
        } else if (balanceError.code === '23505') {
          throw new ConflictException('Balance record already exists for this location and SKU combination');
        }
        throw new Error(`Failed to update inventory balance: ${balanceError.message}`);
      }

      // 10. Write ledger entries with enhanced error handling
      if (isTracked) {
        for (const serial of createdSerials) {
          try {
            await client.query(
              `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
                 values (gen_random_uuid(), $1, $2, $3, $4, 'purchase_receive', 1, 'purchase', $5, $6, $7, now())`,
              [tenantId, storeId, payload.locationId, skuId, purchaseId, `Receive ${serial.serialNumber}${serial.imeiNumber ? ` (IMEI: ${serial.imeiNumber})` : ''}`, userId],
            );
          } catch (ledgerError: any) {
            if (ledgerError.code === '23503') {
              throw new ConflictException('Invalid reference to location, SKU, or purchase in ledger entry');
            } else if (ledgerError.code === '23514') {
              throw new ConflictException('Invalid movement type for ledger entry');
            }
            throw new Error(`Failed to create ledger entry for ${serial.serialNumber}: ${ledgerError.message}`);
          }
        }
      } else {
        // Single ledger entry for non-tracked bulk receive
        try {
          await client.query(
            `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
               values (gen_random_uuid(), $1, $2, $3, $4, 'purchase_receive', $5, 'purchase', $6, $7, $8, now())`,
            [tenantId, storeId, payload.locationId, skuId, qty, purchaseId, `Receive ${qty} unit(s) of ${product.name}`, userId],
          );
        } catch (ledgerError: any) {
          if (ledgerError.code === '23503') {
            throw new ConflictException('Invalid reference to location, SKU, or purchase in ledger entry');
          } else if (ledgerError.code === '23514') {
            throw new ConflictException('Invalid movement type for ledger entry');
          }
          throw new Error(`Failed to create ledger entry: ${ledgerError.message}`);
        }
      }

      // Sync per-SKU prices (cost + sell) into the price history
      await this.syncSkuPricesOnReceive(client, tenantId, storeId, skuId, unitCost, payload.sellPrice);
      // FIFO batch layer for non-serialized costing
      await this.addReceiveBatch(client, tenantId, storeId, skuId, product.id, purchaseId, payload.supplierId, qty, unitCost, today, isTracked ? qty : 0);

      await client.query('commit');

      return {
        product: { id: product.id, name: product.name },
        purchase: { id: purchaseId, purchaseNo, totalAmount: lineTotal, unitCost },
        sku: { id: skuId, skuCode },
        serials: createdSerials,
        stockUpdated: true,
        unitsReceived: qty,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async receiveBulk(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      items: Array<{
        productId: string;
        skuId?: string;
        supplierId: string;
        locationId: string;
        unitCost?: number;
        sellPrice?: number;
        batchNo?: string;
        expiryDate?: string;
        qty?: number;
        trackingValuesList?: Record<string, string>[];
      }>;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const tenantResult = await client.query<{ tenant_id: string }>(
        'select tenant_id from store.stores where id = $1 limit 1', [storeId],
      );
      const tenantId = tenantResult.rows[0].tenant_id;

      const results = [];
      const errors = [];

      // Process each item in the bulk receive
      for (let i = 0; i < payload.items.length; i++) {
        const item = payload.items[i];

        try {
          // Validate and get product info
          const productResult = await client.query<{ id: string; name: string; is_trackable: boolean }>(
            `select id, name, is_trackable from catalog.products where id = $1 and store_id = $2`,
            [item.productId, storeId],
          );

          if (productResult.rows.length === 0) {
            errors.push({ index: i, error: `Product ${item.productId} not found` });
            continue;
          }

          const product = productResult.rows[0];

          // Resolve SKU
          let skuId = item.skuId;
          let skuCode: string;
          if (skuId) {
            const skuResult = await client.query<{ id: string; sku_code: string }>(
              `select id, sku_code from catalog.skus where id = $1 and product_id = $2`,
              [skuId, item.productId],
            );
            if (skuResult.rows.length === 0) {
              errors.push({ index: i, error: `SKU ${item.skuId} not found for this product` });
              continue;
            }
            skuCode = skuResult.rows[0].sku_code;
          } else {
            const skuResult = await client.query<{ id: string; sku_code: string }>(
              `select id, sku_code from catalog.skus where product_id = $1 and status = 'active' order by created_at asc limit 1`,
              [item.productId],
            );
            if (skuResult.rows.length === 0) {
              errors.push({ index: i, error: `No active SKU found for this product` });
              continue;
            }
            skuId = skuResult.rows[0].id;
            skuCode = skuResult.rows[0].sku_code;
          }

          // Generate purchase number for each item
          const today = new Date().toISOString().slice(0, 10);
          const purchaseNo = await this.generatePurchaseNumber(storeId, today);

          // Calculate costs
          const isTracked = (item.trackingValuesList?.length ?? 0) > 0;
          const unitCost = item.unitCost ?? 0;
          const qty = isTracked ? item.trackingValuesList!.length : (item.qty ?? 1);
          const lineTotal = unitCost * qty;

          // Create purchase record
          const purchaseResult = await client.query<{ id: string }>(
            `insert into procurement.purchases (id, tenant_id, store_id, supplier_id, location_id, purchase_no, purchase_date, status, subtotal_amount, discount_amount, tax_amount, shipping_amount, total_amount, paid_amount, payment_status, note, created_by, received_at, created_at, updated_at)
             values (gen_random_uuid(), (select tenant_id from store.stores where id = $1), $1, $2, $3, $4, $5, 'received', $6, 0, 0, 0, $7, 0, 'pending', $8, $9, now(), now(), now()) returning id`,
            [storeId, item.supplierId, item.locationId, purchaseNo, today, lineTotal, lineTotal, `Bulk receive ${qty} unit(s) of ${product.name}`, userId],
          );
          const purchaseId = purchaseResult.rows[0].id;

          // Create purchase item
          await client.query(
            `insert into procurement.purchase_items (id, purchase_id, sku_id, product_name_snapshot, sku_code_snapshot, qty, unit_cost, line_total, batch_no, expiry_date, created_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
            [purchaseId, skuId, product.name, skuCode, qty, unitCost, lineTotal, item.batchNo?.trim() || null, item.expiryDate || null],
          );

          // Create device serials and update inventory (tracked products only)
          const createdSerials: Array<{ id: string; serialNumber: string; imeiNumber?: string }> = [];

          if (isTracked) {
            for (const trackingValues of item.trackingValuesList!) {
            const serialNumber = trackingValues['serial_number'] || trackingValues['serial'] || `SN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const imeiNumber = trackingValues['imei'] || trackingValues['imei_number'] || undefined;

            if (imeiNumber) {
              const existingImei = await client.query(
                'select id from inventory.device_serials where imei_number = $1',
                [imeiNumber],
              );
              if (existingImei.rows.length > 0) {
                throw new Error(`IMEI ${imeiNumber} already exists in the system`);
              }
            }

            const serialResult = await client.query<{ id: string }>(
              `insert into inventory.device_serials (id, tenant_id, store_id, sku_id, serial_number, imei_number, tracking_values, current_location_id, status, received_date, created_at, updated_at)
               values (gen_random_uuid(), (select tenant_id from store.stores where id = $1), $1, $2, $3, $4, $5, $6, 'in_stock', now(), now(), now()) returning id`,
              [storeId, skuId, serialNumber, imeiNumber || null, JSON.stringify(trackingValues), item.locationId],
            );
              createdSerials.push({ id: serialResult.rows[0].id, serialNumber, imeiNumber });
            }
            }

          // Update inventory balance
          await client.query(
            `insert into inventory.balances (id, tenant_id, store_id, location_id, sku_id, on_hand_qty, updated_at)
             values (gen_random_uuid(), (select tenant_id from store.stores where id = $1), $1, $2, $3, $4, now())
             on conflict (location_id, sku_id) do update set on_hand_qty = inventory.balances.on_hand_qty + $4, updated_at = now()`,
            [storeId, item.locationId, skuId, qty],
          );

          // Write ledger entries
          if (isTracked) {
            for (const serial of createdSerials) {
              await client.query(
                `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
                 values (gen_random_uuid(), (select tenant_id from store.stores where id = $1), $1, $2, $3, 'purchase_receive', 1, 'purchase', $4, $5, $6, now())`,
                [storeId, item.locationId, skuId, purchaseId, `Bulk receive ${serial.serialNumber}${serial.imeiNumber ? ` (IMEI: ${serial.imeiNumber})` : ''}`, userId],
              );
            }
          } else {
            // Single ledger entry for non-tracked bulk receive
            await client.query(
              `insert into inventory.ledger (id, tenant_id, store_id, location_id, sku_id, movement_type, qty_delta, reference_type, reference_id, note, actor_id, created_at)
               values (gen_random_uuid(), (select tenant_id from store.stores where id = $1), $1, $2, $3, 'purchase_receive', $4, 'purchase', $5, $6, $7, now())`,
              [storeId, item.locationId, skuId, qty, purchaseId, `Bulk receive ${qty} unit(s) of ${product.name}`, userId],
            );
          }

          await this.syncSkuPricesOnReceive(client, tenantId, storeId, skuId, unitCost, item.sellPrice);
          await this.addReceiveBatch(client, tenantId, storeId, skuId, product.id, purchaseId, item.supplierId, qty, unitCost, today, isTracked ? qty : 0);

          results.push({
            index: i,
            productId: product.id,
            productName: product.name,
            purchaseId,
            purchaseNo,
            unitsReceived: qty,
            success: true,
          });
        } catch (error) {
          errors.push({
            index: i,
            error: (error as Error).message,
          });
        }
      }

      await client.query('commit');

      return {
        success: true,
        processed: payload.items.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
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

      // Resolve brand and category codes for SKU generation
      const brandCode = await this.resolveBrandCode(client, brandId);
      const categoryCode = await this.resolveCategoryCode(client, categoryId);

      // 1. Create exchange product
      const productResult = await client.query<{ id: string }>(
        `insert into catalog.products (id, tenant_id, store_id, product_code, name, category_id, brand_id, has_variants, variant_mode, is_trackable, product_type, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'exchange', 'active', now(), now()) returning id`,
        [tenantId, storeId, productCode, productName, categoryId, brandId, payload.hasVariants, payload.hasVariants ? 'single' : 'none', payload.isTrackable ?? true],
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
          const spec = this.encodeSkuSpec(label, productName);
          const skuCode = await this.findUniqueSkuCode(client, storeId, brandCode, categoryCode, spec);
          const skuResult = await client.query<{ id: string }>(
            `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, variant_label, barcode, status, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
            [tenantId, storeId, productId, skuCode, label, vBarcode],
          );
          await client.query(
            `insert into catalog.prices (id, tenant_id, store_id, sku_id, sale_price, cost_price, effective_from, created_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
            [tenantId, storeId, skuResult.rows[0].id, String(price), String(cost)],
          );
          skus.push({ id: skuResult.rows[0].id, skuCode, label, price, cost });
        }
      } else {
        const ts = Date.now();
        const spec = this.encodeSkuSpec(null, productName);
        const skuCode = await this.findUniqueSkuCode(client, storeId, brandCode, categoryCode, spec);
        const barcode = '2' + String(ts).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const skuResult = await client.query<{ id: string }>(
          `insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) returning id`,
          [tenantId, storeId, productId, skuCode, barcode],
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

  private async resolveBrandCode(client: PoolClient, brandId: string | null): Promise<string> {
    if (!brandId) return 'GEN';
    const result = await client.query<{ name: string }>('select name from catalog.brands where id = $1 limit 1', [brandId]);
    if (!result.rows[0]) return 'GEN';
    return result.rows[0].name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  }

  private async resolveCategoryCode(client: PoolClient, categoryId: string | null): Promise<string> {
    if (!categoryId) return 'GN';
    const result = await client.query<{ code: string }>('select code from catalog.categories where id = $1 limit 1', [categoryId]);
    if (!result.rows[0]) return 'GN';
    return result.rows[0].code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 2).padEnd(2, 'X');
  }

  private encodeSkuSpec(variantLabel: string | null, productName: string): string {
    if (variantLabel) {
      const upper = variantLabel.toUpperCase();
      let position = '';
      if (/^FRONT\b/.test(upper) || /\bFRONT\b/.test(upper)) position = 'F';
      else if (/^REAR\b/.test(upper) || /\bREAR\b/.test(upper)) position = 'R';
      const widthMatch = upper.match(/(\d{2,3})/);
      if (widthMatch) {
        const width = widthMatch[1];
        const widthCode = width.length >= 3 ? width.slice(0, 2) : width.padStart(2, '0');
        if (position) return `${position}${widthCode}`;
      }
      return upper.replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
    }
    const upper = productName.toUpperCase();
    const words = upper.split(/[^A-Z0-9]+/).filter(w => w.length > 0);
    if (words.length > 1 && /^[A-Z]{2,6}$/.test(words[0])) {
      const rest = words.slice(1).join('');
      return rest.slice(0, 3).padEnd(3, 'X');
    }
    return upper.replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
  }

  private async findUniqueSkuCode(
    client: PoolClient,
    storeId: string,
    brandCode: string,
    categoryCode: string,
    spec: string,
  ): Promise<string> {
    const base = `${brandCode}-${categoryCode}-${spec}`.slice(0, 80);
    const result = await client.query(
      'select 1 from catalog.skus where store_id = $1 and sku_code = $2 limit 1',
      [storeId, base],
    );
    if (!result.rows.length) return base;
    for (let i = 2; i <= 99; i++) {
      const candidate = `${brandCode}-${categoryCode}-${spec.slice(0, 2)}${i}`.slice(0, 80);
      const r = await client.query(
        'select 1 from catalog.skus where store_id = $1 and sku_code = $2 limit 1',
        [storeId, candidate],
      );
      if (!r.rows.length) return candidate;
    }
    return `${brandCode}-${categoryCode}-${spec.slice(0, 1)}${Date.now().toString(36).slice(-2).toUpperCase()}`.slice(0, 80);
  }
}
