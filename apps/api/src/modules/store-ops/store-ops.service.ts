import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type StoreRole = 'store_owner' | 'store_manager' | 'store_salesman';

@Injectable()
export class StoreOpsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listCustomers(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    query?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
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
          ), 0) as outstanding_due_amount
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
      `,
      [storeId, query?.trim() ? query.trim() : null],
    );

    return { customers: result.rows };
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

  async listDueSales(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
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
        order by coalesce(s.due_date, s.created_at::date) asc, s.created_at desc
      `,
      [storeId],
    );

    return { dueSales: result.rows };
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

  async listExpenses(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);

    const result = await this.pool.query(
      `
        select id, expense_date, category_name, title, amount, payment_method, note, status, created_at, updated_at
        from finance.daily_expenses
        where store_id = $1
        order by expense_date desc, created_at desc
      `,
      [storeId],
    );

    return { expenses: result.rows };
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

  async listEmployees(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const result = await this.pool.query(
      `
        select *
        from hr.employees
        where store_id = $1
        order by created_at desc
      `,
      [storeId],
    );
    return { employees: result.rows };
  }

  async createEmployee(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      fullName: string;
      mobileNo?: string;
      email?: string;
      roleCode: string;
      employmentStatus: 'active' | 'inactive' | 'terminated';
      joinDate: string;
      monthlySalary: number;
      note?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner', 'store_manager']);
    const result = await this.pool.query(
      `
        insert into hr.employees (
          id, tenant_id, store_id, full_name, mobile_no, email, role_code, employment_status, join_date, monthly_salary, note, created_at, updated_at
        )
        select gen_random_uuid(), $2, $1, $3, $4, $5::citext, $6, $7, $8, $9, $10, now(), now()
        returning *
      `,
      [storeId, session?.user.tenantId ?? '', payload.fullName, payload.mobileNo ?? null, payload.email ?? null, payload.roleCode, payload.employmentStatus, payload.joinDate, payload.monthlySalary, payload.note ?? null],
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
      roleCode: string;
      employmentStatus: 'active' | 'inactive' | 'terminated';
      joinDate: string;
      monthlySalary: number;
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
          role_code = coalesce($6, role_code),
          employment_status = coalesce($7, employment_status),
          join_date = coalesce($8::date, join_date),
          monthly_salary = coalesce($9, monthly_salary),
          note = case when $10::text is null then note else $10::text end,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning *
      `,
      [employeeId, storeId, payload.fullName ?? null, payload.mobileNo === undefined ? null : payload.mobileNo, payload.email === undefined ? null : payload.email, payload.roleCode ?? null, payload.employmentStatus ?? null, payload.joinDate ?? null, payload.monthlySalary ?? null, payload.note === undefined ? null : payload.note],
    );
    if (!result.rows[0]) throw new NotFoundException('Employee not found');
    return { employee: result.rows[0] };
  }

  async listPayrollRuns(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        select pr.*, coalesce(count(pri.id), 0)::int as item_count
        from hr.payroll_runs pr
        left join hr.payroll_run_items pri on pri.payroll_run_id = pr.id
        where pr.store_id = $1
        group by pr.id
        order by pr.period_end desc, pr.created_at desc
      `,
      [storeId],
    );
    return { payrollRuns: result.rows };
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

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const runResult = await client.query<{ id: string }>(
        `
          insert into hr.payroll_runs (
            id, tenant_id, store_id, period_start, period_end, status, total_amount, processed_by, note, created_at, updated_at
          )
          select gen_random_uuid(), $2, $1, $3, $4, $5, $6, $7, $8, now(), now()
          returning id
        `,
        [storeId, session?.user.tenantId ?? '', payload.periodStart, payload.periodEnd, payload.status, totalAmount, userId, payload.note ?? null],
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
      return { payrollRunId, totalAmount };
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

  async listBankAccounts(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        select *
        from finance.bank_accounts
        where store_id = $1
        order by created_at desc
      `,
      [storeId],
    );
    return { bankAccounts: result.rows };
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

  async listBankEntries(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    this.assertAllowedRoles(authContext, ['store_owner']);
    const result = await this.pool.query(
      `
        select bre.*, ba.account_name, ba.bank_name
        from finance.bank_reconciliation_entries bre
        join finance.bank_accounts ba on ba.id = bre.bank_account_id
        where bre.store_id = $1
        order by bre.entry_date desc, bre.created_at desc
      `,
      [storeId],
    );
    return { entries: result.rows };
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
}
