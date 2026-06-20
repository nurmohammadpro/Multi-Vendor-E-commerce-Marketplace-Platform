begin;

alter table catalog.products
  add column if not exists has_variants boolean not null default false,
  add column if not exists variant_mode text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_variant_mode_check'
  ) then
    alter table catalog.products
      add constraint products_variant_mode_check
      check (variant_mode in ('none', 'single', 'multi'));
  end if;
end $$;

alter table catalog.skus
  add column if not exists variant_label varchar(255),
  add column if not exists variant_key text;

create unique index if not exists skus_product_variant_key_unique_idx
  on catalog.skus (product_id, variant_key)
  where variant_key is not null;

create table if not exists catalog.product_variant_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  product_id uuid not null references catalog.products(id) on delete cascade,
  code varchar(80) not null,
  name varchar(120) not null,
  input_type text not null default 'text',
  sort_order integer not null default 0,
  is_required boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variant_groups_input_type_check check (input_type in ('text', 'color', 'number')),
  constraint product_variant_groups_status_check check (status in ('active', 'inactive')),
  constraint product_variant_groups_unique unique (product_id, code)
);

create index if not exists product_variant_groups_product_idx
  on catalog.product_variant_groups (product_id, sort_order, created_at);

create table if not exists catalog.product_variant_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  product_id uuid not null references catalog.products(id) on delete cascade,
  variant_group_id uuid not null references catalog.product_variant_groups(id) on delete cascade,
  code varchar(80) not null,
  label varchar(120) not null,
  value_text varchar(120),
  value_number numeric(14,3),
  color_hex varchar(20),
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variant_options_status_check check (status in ('active', 'inactive')),
  constraint product_variant_options_unique unique (variant_group_id, code)
);

create index if not exists product_variant_options_group_idx
  on catalog.product_variant_options (variant_group_id, sort_order, created_at);

create table if not exists catalog.sku_variant_options (
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  variant_group_id uuid not null references catalog.product_variant_groups(id) on delete restrict,
  variant_option_id uuid not null references catalog.product_variant_options(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (sku_id, variant_group_id),
  constraint sku_variant_options_unique_option unique (sku_id, variant_option_id)
);

create index if not exists sku_variant_options_option_idx
  on catalog.sku_variant_options (variant_option_id, sku_id);

select platform.touch_updated_at('catalog', 'products');
select platform.touch_updated_at('catalog', 'skus');
select platform.touch_updated_at('catalog', 'product_variant_groups');
select platform.touch_updated_at('catalog', 'product_variant_options');

commit;
