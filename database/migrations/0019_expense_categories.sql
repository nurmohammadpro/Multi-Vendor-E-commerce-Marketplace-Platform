-- Add store-level expense categories so stores can manage reusable categories.
-- Also backfill from existing unique category names in daily_expenses.

begin;

create table if not exists finance.expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  name varchar(120) not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_categories_store_idx
  on finance.expense_categories (store_id, name);

-- Backfill: create categories from existing unique category_name values
insert into finance.expense_categories (id, tenant_id, store_id, name, status, created_at)
select
  gen_random_uuid(),
  de.tenant_id,
  de.store_id,
  de.category_name,
  'active',
  now()
from (
  select distinct tenant_id, store_id, category_name
  from finance.daily_expenses
) de
where not exists (
  select 1
  from finance.expense_categories ec
  where ec.store_id = de.store_id
    and ec.name = de.category_name
);

commit;
