-- Phase 1: Foundation for Serial-Based Warranty Tracking for Tech Products
-- Adds: Product Categories, Device Serials, Stock Batches, and updates to products/SKUs

begin;

-- ============================================================================
-- 1. PRODUCT CATEGORIES (Tech Product Classification)
-- ============================================================================
create table if not exists catalog.product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  code varchar(50) not null,
  name varchar(150) not null,
  category_type text not null default 'regular',
  description text,
  requires_serial boolean not null default false,
  requires_warranty boolean not null default false,
  requires_imei boolean not null default false,
  has_specifications boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_status_check check (status in ('active', 'inactive')),
  constraint product_categories_type_check check (category_type in ('tech_serial_tracked', 'regular')),
  constraint product_categories_code_unique unique (tenant_id, code)
);

create index if not exists product_categories_tenant_type_idx
  on catalog.product_categories (tenant_id, category_type);

-- Seed mandatory tech product categories
insert into catalog.product_categories (tenant_id, code, name, category_type, requires_serial, requires_warranty, requires_imei, has_specifications, status)
select 
  t.id,
  cat.code,
  cat.name,
  'tech_serial_tracked',
  true,
  true,
  cat.requires_imei,
  true,
  'active'
from platform.tenants t
cross join (
  values 
    ('PC_COMPONENTS', 'PC Components', false),
    ('LAPTOPS', 'Laptops & Notebooks', false),
    ('MOBILE_PHONES', 'Mobile Phones', true),
    ('MOBILE_ACCESSORIES', 'Mobile Accessories', false),
    ('WEARABLES', 'Wearables', false),
    ('IOT_DEVICES', 'IoT Devices', false),
    ('DRONES', 'Drones & Accessories', false),
    ('ELECTRONICS', 'Electronics & Appliances', false),
    ('ELECTRICAL_GOODS', 'Electrical Goods', false)
) as cat(code, name, requires_imei)
on conflict do nothing;

-- ============================================================================
-- 2. DEVICE SERIALS (Individual Unit Tracking)
-- ============================================================================
create table if not exists inventory.device_serials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  serial_number varchar(100) not null,
  imei_number varchar(50),
  device_model varchar(150),
  specifications_json jsonb,
  color varchar(50),
  manufacture_date date,
  batch_code varchar(50),
  received_date date,
  current_location_id uuid references inventory.locations(id) on delete set null,
  status text not null default 'in_stock',
  assigned_to_sale_id uuid references sales.sales(id) on delete set null,
  warranty_linked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_serials_status_check check (status in ('in_stock', 'reserved', 'sold', 'returned', 'damaged', 'lost')),
  constraint device_serials_serial_unique unique (store_id, serial_number)
);

create index if not exists device_serials_sku_status_idx
  on inventory.device_serials (sku_id, status);

create index if not exists device_serials_imei_idx
  on inventory.device_serials (imei_number) where imei_number is not null;

create index if not exists device_serials_assigned_sale_idx
  on inventory.device_serials (assigned_to_sale_id) where assigned_to_sale_id is not null;

create index if not exists device_serials_batch_code_idx
  on inventory.device_serials (batch_code) where batch_code is not null;

create index if not exists device_serials_location_idx
  on inventory.device_serials (current_location_id) where current_location_id is not null;

-- ============================================================================
-- 3. STOCK BATCHES (Batch/Lot Tracking for Quality Control & Recalls)
-- ============================================================================
create table if not exists inventory.stock_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  batch_code varchar(50) not null,
  supplier_id uuid,
  product_id uuid references catalog.products(id) on delete set null,
  sku_id uuid references catalog.skus(id) on delete set null,
  purchase_order_number varchar(100),
  received_date date,
  manufacture_batch_code varchar(100),
  expiry_date date,
  received_quantity numeric(14,3) not null default 0,
  current_quantity numeric(14,3) not null default 0,
  serial_count integer not null default 0,
  notes text,
  status text not null default 'active',
  recall_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_batches_status_check check (status in ('active', 'depleted', 'quarantined', 'recalled')),
  constraint stock_batches_batch_code_unique unique (store_id, batch_code)
);

create index if not exists stock_batches_supplier_idx
  on inventory.stock_batches (supplier_id) where supplier_id is not null;

create index if not exists stock_batches_status_idx
  on inventory.stock_batches (store_id, status);

-- ============================================================================
-- 4. UPDATES TO EXISTING TABLES
-- ============================================================================

-- Add product_category_id to products table
alter table catalog.products
  add column if not exists product_category_id uuid references catalog.product_categories(id) on delete set null,
  add column if not exists serial_tracking_enabled boolean not null default false,
  add column if not exists warranty_tracking_enabled boolean not null default false;

-- Add indices for new product columns
create index if not exists products_category_idx
  on catalog.products (product_category_id) where product_category_id is not null;

-- Add serial tracking flag to SKUs
alter table catalog.skus
  add column if not exists requires_serial boolean not null default false,
  add column if not exists requires_imei boolean not null default false;

-- Update sale_items to support device serials and warranties
alter table sales.sale_items
  add column if not exists device_serial_id uuid references inventory.device_serials(id) on delete set null,
  add column if not exists warranty_applied boolean not null default false;

create index if not exists sale_items_device_serial_idx
  on sales.sale_items (device_serial_id) where device_serial_id is not null;

-- ============================================================================
-- 5. LEDGER EXTENSION FOR DEVICE TRACKING
-- ============================================================================

-- Update inventory ledger movement_types to include device serial tracking
-- Note: This is handled via the constraint check - add 'device_transfer' type
alter table inventory.ledger
  add column if not exists device_serial_id uuid references inventory.device_serials(id) on delete set null;

create index if not exists ledger_device_serial_idx
  on inventory.ledger (device_serial_id) where device_serial_id is not null;

-- ============================================================================
-- 6. AUDIT AND TOUCH UPDATES
-- ============================================================================

select platform.touch_updated_at('catalog', 'product_categories');
select platform.touch_updated_at('catalog', 'products');
select platform.touch_updated_at('catalog', 'skus');
select platform.touch_updated_at('inventory', 'device_serials');
select platform.touch_updated_at('inventory', 'stock_batches');
select platform.touch_updated_at('sales', 'sale_items');
select platform.touch_updated_at('inventory', 'ledger');

commit;
