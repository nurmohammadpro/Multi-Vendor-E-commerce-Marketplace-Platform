begin;

create schema if not exists finance;
create schema if not exists hr;

create table if not exists store.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  full_name varchar(200),
  mobile_no varchar(30),
  email citext,
  shop_name varchar(200),
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_customers_store_created_idx
  on store.customers (store_id, created_at desc);

create unique index if not exists store_customers_mobile_unique_idx
  on store.customers (store_id, mobile_no)
  where mobile_no is not null;

create unique index if not exists store_customers_email_unique_idx
  on store.customers (store_id, email)
  where email is not null;

alter table sales.sales
  add column if not exists customer_id uuid references store.customers(id) on delete set null,
  add column if not exists customer_email citext,
  add column if not exists due_date date;

create index if not exists sales_customer_idx
  on sales.sales (store_id, customer_id, created_at desc);

create table if not exists finance.daily_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  expense_date date not null,
  category_name varchar(120) not null,
  title varchar(200) not null,
  amount numeric(14,2) not null,
  payment_method text not null default 'cash',
  note text,
  status text not null default 'draft',
  recorded_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_expenses_amount_check check (amount >= 0),
  constraint daily_expenses_payment_method_check check (payment_method in ('cash', 'card', 'mfs', 'bank_transfer')),
  constraint daily_expenses_status_check check (status in ('draft', 'approved', 'void'))
);

create index if not exists daily_expenses_store_date_idx
  on finance.daily_expenses (store_id, expense_date desc);

create table if not exists hr.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  user_id uuid references identity.users(id) on delete set null,
  full_name varchar(200) not null,
  mobile_no varchar(30),
  email citext,
  role_code varchar(50) not null,
  employment_status text not null default 'active',
  join_date date not null,
  monthly_salary numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_status_check check (employment_status in ('active', 'inactive', 'terminated')),
  constraint employees_salary_check check (monthly_salary >= 0)
);

create index if not exists employees_store_created_idx
  on hr.employees (store_id, created_at desc);

create table if not exists hr.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  total_amount numeric(14,2) not null default 0,
  processed_by uuid not null references identity.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_status_check check (status in ('draft', 'approved', 'paid')),
  constraint payroll_runs_total_check check (total_amount >= 0),
  constraint payroll_runs_period_check check (period_end >= period_start)
);

create table if not exists hr.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references hr.payroll_runs(id) on delete cascade,
  employee_id uuid not null references hr.employees(id) on delete restrict,
  gross_amount numeric(14,2) not null default 0,
  bonus_amount numeric(14,2) not null default 0,
  deduction_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  constraint payroll_run_items_amounts_check check (
    gross_amount >= 0 and
    bonus_amount >= 0 and
    deduction_amount >= 0 and
    net_amount >= 0
  )
);

create index if not exists payroll_runs_store_period_idx
  on hr.payroll_runs (store_id, period_end desc);

create table if not exists finance.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  account_name varchar(150) not null,
  bank_name varchar(150) not null,
  account_number varchar(80) not null,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_accounts_status_check check (status in ('active', 'inactive')),
  constraint bank_accounts_balance_check check (opening_balance >= 0)
);

create index if not exists bank_accounts_store_created_idx
  on finance.bank_accounts (store_id, created_at desc);

create table if not exists finance.bank_reconciliation_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  bank_account_id uuid not null references finance.bank_accounts(id) on delete cascade,
  entry_date date not null,
  entry_type text not null,
  source_type text not null,
  reference_no varchar(100),
  amount numeric(14,2) not null,
  status text not null default 'pending',
  note text,
  created_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_reconciliation_entry_type_check check (entry_type in ('credit', 'debit')),
  constraint bank_reconciliation_source_type_check check (source_type in ('sale', 'expense', 'deposit', 'adjustment')),
  constraint bank_reconciliation_status_check check (status in ('pending', 'matched', 'flagged')),
  constraint bank_reconciliation_amount_check check (amount >= 0)
);

create index if not exists bank_reconciliation_store_date_idx
  on finance.bank_reconciliation_entries (store_id, entry_date desc);

select platform.touch_updated_at('store', 'customers');
select platform.touch_updated_at('finance', 'daily_expenses');
select platform.touch_updated_at('hr', 'employees');
select platform.touch_updated_at('hr', 'payroll_runs');
select platform.touch_updated_at('finance', 'bank_accounts');
select platform.touch_updated_at('finance', 'bank_reconciliation_entries');

commit;
