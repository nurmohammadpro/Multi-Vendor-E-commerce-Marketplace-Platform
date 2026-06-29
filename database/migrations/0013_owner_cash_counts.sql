begin;

create table if not exists finance.owner_cash_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  count_date date not null,
  expected_cash_amount numeric(14,2) not null default 0,
  counted_cash_amount numeric(14,2) not null,
  variance_amount numeric(14,2) not null default 0,
  note text,
  counted_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_cash_counts_expected_check check (expected_cash_amount >= 0),
  constraint owner_cash_counts_counted_check check (counted_cash_amount >= 0)
);

create unique index if not exists owner_cash_counts_store_date_unique_idx
  on finance.owner_cash_counts (store_id, count_date);

create index if not exists owner_cash_counts_store_updated_idx
  on finance.owner_cash_counts (store_id, updated_at desc);

select platform.touch_updated_at('finance', 'owner_cash_counts');

commit;
