begin;

create schema if not exists settlement;

create table if not exists settlement.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  account_code varchar(50) not null,
  account_type text not null,
  description varchar(200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_accounts_type_check check (account_type in ('asset','liability','equity','revenue','expense')),
  constraint settlement_accounts_store_unique unique (store_id, account_code)
);

create table if not exists settlement.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  entry_no varchar(50) not null,
  business_date date not null default current_date,
  description varchar(300),
  reference_type text not null,
  reference_id uuid,
  is_posted boolean not null default false,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint journal_entries_no_unique unique (store_id, entry_no)
);

create table if not exists settlement.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references settlement.journal_entries(id) on delete cascade,
  account_id uuid not null references settlement.accounts(id) on delete restrict,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  description varchar(300),
  created_at timestamptz not null default now(),
  constraint journal_lines_amounts_check check (
    debit_amount >= 0 and credit_amount >= 0 and (debit_amount > 0 or credit_amount > 0)
  )
);

create table if not exists settlement.settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  settlement_no varchar(50) not null,
  gateway_id uuid references integration.payment_gateways(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(14,2) not null,
  fee_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null,
  status text not null default 'pending',
  settled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_status_check check (status in ('pending','settled','disputed')),
  constraint settlements_no_unique unique (store_id, settlement_no),
  constraint settlements_period_check check (period_end >= period_start),
  constraint settlements_amounts_check check (gross_amount >= 0 and fee_amount >= 0 and net_amount >= 0)
);

select platform.touch_updated_at('settlement', 'accounts');
select platform.touch_updated_at('settlement', 'journal_entries');
select platform.touch_updated_at('settlement', 'journal_lines');
select platform.touch_updated_at('settlement', 'settlements');

commit;
