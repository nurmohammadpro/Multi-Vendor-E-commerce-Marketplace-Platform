-- Phase 1: Custom Tracking Profiles for Per-Category Serial Fields
-- Adds: Tracking Profiles, Tracking Fields, tracking_values on device_serials

begin;

-- ============================================================================
-- 1. TRACKING PROFILES (Define tracking field sets per product category)
-- ============================================================================
create table if not exists catalog.tracking_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  name varchar(150) not null,
  category_id uuid references catalog.product_categories(id) on delete set null,
  is_global boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracking_profiles_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists tracking_profiles_global_unique
  on catalog.tracking_profiles (tenant_id, category_id) where category_id is not null;

create index if not exists tracking_profiles_tenant_status_idx
  on catalog.tracking_profiles (tenant_id, status);

create index if not exists tracking_profiles_category_idx
  on catalog.tracking_profiles (category_id) where category_id is not null;

create index if not exists tracking_profiles_global_idx
  on catalog.tracking_profiles (tenant_id, is_global) where is_global = true;

-- ============================================================================
-- 2. TRACKING FIELDS (Individual fields within a profile)
-- ============================================================================
create table if not exists catalog.tracking_fields (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references catalog.tracking_profiles(id) on delete cascade,
  field_key varchar(50) not null,
  field_label varchar(100) not null,
  field_type text not null default 'text',
  is_required boolean not null default false,
  is_unique boolean not null default true,
  validation_rules jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tracking_fields_type_check check (field_type in ('text', 'number', 'imei', 'date')),
  constraint tracking_fields_key_unique unique (profile_id, field_key)
);

create index if not exists tracking_fields_profile_idx
  on catalog.tracking_fields (profile_id, sort_order);

-- ============================================================================
-- 3. ADD TRACKING_VALUES TO DEVICE_SERIALS
-- ============================================================================
alter table inventory.device_serials
  add column if not exists tracking_values jsonb not null default '{}',
  add column if not exists tracking_profile_id uuid references catalog.tracking_profiles(id) on delete set null;

-- Migrate existing imei_number/serial_number into tracking_values
update inventory.device_serials
set tracking_values = jsonb_build_object(
  'imei', imei_number,
  'serial_number', serial_number
)
where (imei_number is not null and imei_number != '') or (serial_number is not null and serial_number != '');

create index if not exists device_serials_tracking_values_idx
  on inventory.device_serials using gin (tracking_values);

create index if not exists device_serials_profile_idx
  on inventory.device_serials (tracking_profile_id) where tracking_profile_id is not null;

-- ============================================================================
-- 4. GLOBAL IMEI UNIQUE CONSTRAINT
-- ============================================================================
create unique index if not exists device_serials_imei_global_unique
  on inventory.device_serials (imei_number)
  where imei_number is not null and imei_number != '';

-- ============================================================================
-- 5. ADD TRACKING_PROFILE_ID TO PRODUCTS (for product-level override)
-- ============================================================================
alter table catalog.products
  add column if not exists tracking_profile_id uuid references catalog.tracking_profiles(id) on delete set null;

-- ============================================================================
-- 6. SEED DEFAULT PROFILES FOR EXISTING TECH PRODUCT CATEGORIES
-- ============================================================================

-- Mobile Phones: IMEI + Serial + Battery Health
insert into catalog.tracking_profiles (tenant_id, name, category_id, is_global)
select
  t.id,
  'Mobile Phone Tracking',
  pc.id,
  false
from platform.tenants t
join catalog.product_categories pc on pc.code = 'MOBILE_PHONES' and pc.tenant_id = t.id
on conflict do nothing;

-- Laptops: Serial + Asset Tag
insert into catalog.tracking_profiles (tenant_id, name, category_id, is_global)
select
  t.id,
  'Laptop Tracking',
  pc.id,
  false
from platform.tenants t
join catalog.product_categories pc on pc.code = 'LAPTOPS' and pc.tenant_id = t.id
on conflict do nothing;

-- Global fallback: Serial only (applies to all trackable products without a category profile)
insert into catalog.tracking_profiles (tenant_id, name, category_id, is_global)
select
  t.id,
  'Default Serial Tracking',
  null,
  true
from platform.tenants t
on conflict do nothing;

-- ============================================================================
-- 7. SEED TRACKING FIELDS
-- ============================================================================

-- Mobile Phone Tracking fields
insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'imei', 'IMEI', 'imei', true, true, 1
from catalog.tracking_profiles tp
where tp.name = 'Mobile Phone Tracking'
on conflict do nothing;

insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'serial_number', 'Serial Number', 'text', true, true, 2
from catalog.tracking_profiles tp
where tp.name = 'Mobile Phone Tracking'
on conflict do nothing;

insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'battery_health', 'Battery Health', 'number', false, false, 3
from catalog.tracking_profiles tp
where tp.name = 'Mobile Phone Tracking'
on conflict do nothing;

-- Laptop Tracking fields
insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'serial_number', 'Serial Number', 'text', true, true, 1
from catalog.tracking_profiles tp
where tp.name = 'Laptop Tracking'
on conflict do nothing;

insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'asset_tag', 'Asset Tag', 'text', false, false, 2
from catalog.tracking_profiles tp
where tp.name = 'Laptop Tracking'
on conflict do nothing;

-- Default Serial Tracking fields
insert into catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, sort_order)
select tp.id, 'serial_number', 'Serial Number', 'text', true, true, 1
from catalog.tracking_profiles tp
where tp.name = 'Default Serial Tracking'
on conflict do nothing;

-- ============================================================================
-- 8. AUDIT AND TOUCH UPDATES
-- ============================================================================

select platform.touch_updated_at('catalog', 'tracking_profiles');
select platform.touch_updated_at('catalog', 'tracking_fields');
select platform.touch_updated_at('inventory', 'device_serials');
select platform.touch_updated_at('catalog', 'products');

commit;
