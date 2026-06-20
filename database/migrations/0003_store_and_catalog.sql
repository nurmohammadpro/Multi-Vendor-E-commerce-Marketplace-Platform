begin;

create table if not exists store.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  owner_user_id uuid not null references identity.users(id) on delete restrict,
  store_code varchar(50) not null,
  name varchar(200) not null,
  name_bn varchar(200),
  slug varchar(200) not null,
  phone varchar(30) not null,
  email citext,
  status text not null default 'pending',
  subscription_status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_status_check check (status in ('pending', 'active', 'suspended', 'inactive')),
  constraint stores_subscription_status_check check (subscription_status in ('inactive', 'trial', 'active', 'past_due', 'suspended', 'expired')),
  constraint stores_store_code_unique unique (tenant_id, store_code),
  constraint stores_slug_unique unique (slug)
);

alter table access.store_memberships
  add constraint store_memberships_store_id_fkey
  foreign key (store_id) references store.stores(id) on delete cascade;

create table if not exists store.store_settings (
  store_id uuid primary key references store.stores(id) on delete cascade,
  timezone varchar(100) not null default 'Asia/Dhaka',
  currency_code varchar(10) not null default 'BDT',
  locale varchar(10) not null default 'en',
  receipt_footer text,
  invoice_prefix varchar(20),
  allow_negative_stock boolean not null default false,
  low_stock_threshold_default integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_settings_locale_check check (locale in ('en', 'bn')),
  constraint store_settings_low_stock_threshold_check check (low_stock_threshold_default is null or low_stock_threshold_default >= 0)
);

create table if not exists store.store_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  invited_email citext,
  invited_phone varchar(30),
  role_id uuid not null references access.roles(id) on delete restrict,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint store_invitations_contact_check check (invited_email is not null or invited_phone is not null)
);

create index if not exists store_invitations_store_idx
  on store.store_invitations (store_id, expires_at desc);

create table if not exists catalog.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  parent_id uuid references catalog.categories(id) on delete set null,
  code varchar(50) not null,
  name varchar(150) not null,
  name_bn varchar(150),
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_status_check check (status in ('active', 'inactive')),
  constraint categories_code_unique unique (tenant_id, code)
);

create index if not exists categories_parent_idx
  on catalog.categories (parent_id, sort_order);

create table if not exists catalog.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  name varchar(150) not null,
  name_bn varchar(150),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_status_check check (status in ('active', 'inactive')),
  constraint brands_name_unique unique (tenant_id, name)
);

create table if not exists catalog.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  category_id uuid references catalog.categories(id) on delete set null,
  brand_id uuid references catalog.brands(id) on delete set null,
  product_code varchar(50) not null,
  name varchar(250) not null,
  name_bn varchar(250),
  description text,
  status text not null default 'active',
  is_trackable boolean not null default true,
  created_by uuid references identity.users(id) on delete set null,
  updated_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status_check check (status in ('active', 'inactive', 'archived', 'out_of_stock')),
  constraint products_product_code_unique unique (store_id, product_code)
);

create index if not exists products_store_status_idx
  on catalog.products (store_id, status);

create index if not exists products_name_trgm_idx
  on catalog.products using gin (name gin_trgm_ops);

create table if not exists catalog.product_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  product_id uuid not null references catalog.products(id) on delete cascade,
  media_type text not null,
  storage_path text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_media_type_check check (media_type in ('image', 'document'))
);

create index if not exists product_media_product_idx
  on catalog.product_media (product_id, sort_order);

create table if not exists catalog.skus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  product_id uuid not null references catalog.products(id) on delete cascade,
  sku_code varchar(80) not null,
  barcode varchar(80),
  variant_json jsonb,
  unit_name varchar(50),
  weight_value numeric(12,3),
  weight_unit varchar(20),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skus_status_check check (status in ('active', 'inactive', 'archived')),
  constraint skus_sku_code_unique unique (store_id, sku_code),
  constraint skus_weight_value_check check (weight_value is null or weight_value >= 0)
);

create unique index if not exists skus_barcode_unique_idx
  on catalog.skus (store_id, barcode)
  where barcode is not null;

create index if not exists skus_product_idx
  on catalog.skus (product_id, status);

create table if not exists catalog.prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  cost_price numeric(14,2),
  sale_price numeric(14,2) not null,
  compare_at_price numeric(14,2),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references identity.users(id) on delete set null,
  constraint prices_amount_check check (
    sale_price >= 0 and
    (cost_price is null or cost_price >= 0) and
    (compare_at_price is null or compare_at_price >= 0)
  ),
  constraint prices_range_check check (effective_to is null or effective_to > effective_from)
);

create index if not exists prices_sku_effective_idx
  on catalog.prices (sku_id, effective_from desc);

select platform.touch_updated_at('store', 'stores');
select platform.touch_updated_at('store', 'store_settings');
select platform.touch_updated_at('catalog', 'categories');
select platform.touch_updated_at('catalog', 'brands');
select platform.touch_updated_at('catalog', 'products');
select platform.touch_updated_at('catalog', 'skus');

commit;
