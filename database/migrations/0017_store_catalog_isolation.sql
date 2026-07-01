-- Store-level isolation for catalog categories and brands
-- Previously scoped only by tenant_id, causing cross-store data leaks

begin;

-- Add store_id column to categories (nullable initially for backfill)
alter table catalog.categories
  add column store_id uuid references store.stores(id) on delete cascade;

-- Add store_id column to brands (nullable initially for backfill)
alter table catalog.brands
  add column store_id uuid references store.stores(id) on delete cascade;

-- Backfill categories from product references
with category_store as (
  select distinct p.category_id, p.store_id
  from catalog.products p
  where p.category_id is not null
)
update catalog.categories c
set store_id = cs.store_id
from category_store cs
where c.id = cs.category_id;

-- Backfill brands from product references
with brand_store as (
  select distinct p.brand_id, p.store_id
  from catalog.products p
  where p.brand_id is not null
)
update catalog.brands b
set store_id = bs.store_id
from brand_store bs
where b.id = bs.brand_id;

-- Backfill parent categories (no direct products) from their children
with parent_fix as (
  select distinct c.parent_id, c2.store_id
  from catalog.categories c
  join catalog.categories c2 on c2.id = c.parent_id
  where c.parent_id is not null
    and c2.store_id is not null
    and c.store_id is null
)
update catalog.categories c
set store_id = pf.store_id
from parent_fix pf
where c.id = pf.parent_id;

-- Repeat parent backfill one more level deep for grandparent categories
with grandparent_fix as (
  select distinct c.parent_id, c2.store_id
  from catalog.categories c
  join catalog.categories c2 on c2.id = c.parent_id
  where c.parent_id is not null
    and c2.store_id is not null
    and c.store_id is null
)
update catalog.categories c
set store_id = gp.store_id
from grandparent_fix gp
where c.id = gp.parent_id;

-- For any remaining orphaned categories or brands (no product references),
-- assign to the first active store in the same tenant
with first_store as (
  select distinct on (s.tenant_id) s.id, s.tenant_id
  from store.stores s
  where s.status = 'active'
  order by s.tenant_id, s.created_at asc
)
update catalog.categories c
set store_id = fs.id
from first_store fs
where c.store_id is null
  and c.tenant_id = fs.tenant_id;

with first_store as (
  select distinct on (s.tenant_id) s.id, s.tenant_id
  from store.stores s
  where s.status = 'active'
  order by s.tenant_id, s.created_at asc
)
update catalog.brands b
set store_id = fs.id
from first_store fs
where b.store_id is null
  and b.tenant_id = fs.tenant_id;

-- Final safety check — if any still have null store_id,
-- assign to the first store overall
with fallback_store as (
  select id from store.stores
  order by created_at asc
  limit 1
)
update catalog.categories c
set store_id = (select id from fallback_store)
where c.store_id is null;

with fallback_store as (
  select id from store.stores
  order by created_at asc
  limit 1
)
update catalog.brands b
set store_id = (select id from fallback_store)
where b.store_id is null;

-- Now make store_id NOT NULL
alter table catalog.categories alter column store_id set not null;
alter table catalog.brands alter column store_id set not null;

-- Drop old tenant-level unique constraints
alter table catalog.categories drop constraint if exists categories_code_unique;
alter table catalog.brands drop constraint if exists brands_name_unique;

-- Add new store-level unique constraints
alter table catalog.categories
  add constraint categories_code_unique unique (store_id, code);

alter table catalog.brands
  add constraint brands_name_unique unique (store_id, name);

-- Add indexes for store-scoped lookups
create index if not exists categories_store_idx
  on catalog.categories (store_id, sort_order);

create index if not exists brands_store_idx
  on catalog.brands (store_id);

commit;
