begin;

-- ============ 1. Exchange document header ============
create table if not exists sales.sale_exchanges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  exchange_no varchar(50) not null,
  original_sale_id uuid not null references sales.sales(id) on delete restrict,
  customer_id uuid references store.customers(id) on delete set null,
  customer_name varchar(200),
  customer_phone varchar(30),
  customer_email citext,
  customer_shop_name varchar(200),
  customer_address text,
  trade_in_credit numeric(14,2) not null default 0,
  new_items_total numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  payments jsonb not null default '[]'::jsonb,
  refund_method text,
  refund_reference varchar(100),
  status text not null default 'completed',
  location_id uuid not null references inventory.locations(id) on delete restrict,
  register_id uuid references sales.registers(id) on delete set null,
  shift_id uuid references sales.register_shifts(id) on delete set null,
  processed_by uuid not null references identity.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_exchanges_no_unique unique (store_id, exchange_no),
  constraint sale_exchanges_status_check check (status in ('completed', 'cancelled')),
  constraint sale_exchanges_refund_method_check check (
    refund_method is null or refund_method in ('cash', 'card', 'mfs', 'bank_transfer')
  ),
  constraint sale_exchanges_refund_consistency_check check (
    (difference >= 0 and refund_method is null)
    or (difference < 0 and refund_method is not null)
  )
);

create index if not exists sale_exchanges_store_created_idx
  on sales.sale_exchanges (store_id, created_at desc);
create index if not exists sale_exchanges_original_sale_idx
  on sales.sale_exchanges (original_sale_id);
create index if not exists sale_exchanges_phone_idx
  on sales.sale_exchanges (store_id, customer_phone);
select platform.touch_updated_at('sales', 'sale_exchanges');

-- ============ 2. Exchange items (both sides in one child table) ============
create table if not exists sales.sale_exchange_items (
  id uuid primary key default gen_random_uuid(),
  sale_exchange_id uuid not null references sales.sale_exchanges(id) on delete cascade,
  side text not null,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  sale_item_id uuid references sales.sale_items(id) on delete set null,
  device_serial_id uuid references inventory.device_serials(id) on delete set null,
  product_name_snapshot varchar(250) not null,
  sku_code_snapshot varchar(80) not null,
  serial_number varchar(100),
  imei_number varchar(50),
  qty numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  line_credit numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  restock boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sale_exchange_items_side_check check (side in ('returned', 'new')),
  constraint sale_exchange_items_qty_check check (qty > 0),
  constraint sale_exchange_items_amounts_check check (
    unit_price >= 0 and discount_amount >= 0 and tax_amount >= 0
    and line_total >= 0 and line_credit >= 0
  )
);

create index if not exists sale_exchange_items_exchange_idx
  on sales.sale_exchange_items (sale_exchange_id);
create index if not exists sale_exchange_items_sale_item_idx
  on sales.sale_exchange_items (sale_item_id) where sale_item_id is not null;
create index if not exists sale_exchange_items_serial_idx
  on sales.sale_exchange_items (device_serial_id) where device_serial_id is not null;
select platform.touch_updated_at('sales', 'sale_exchange_items');

-- ============ 3. Returns hardening ============
alter table sales.sale_returns
  add column if not exists refund_method text,
  add column if not exists refund_reference varchar(100),
  add column if not exists note text;

-- ============ 4. device_serial_sales DDL (API writes to it; never had a migration) ============
create table if not exists inventory.device_serial_sales (
  id uuid primary key default gen_random_uuid(),
  device_serial_id uuid not null references inventory.device_serials(id) on delete cascade,
  sale_item_id uuid not null references sales.sale_items(id) on delete cascade,
  sale_id uuid not null references sales.sales(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists device_serial_sales_sale_item_idx
  on inventory.device_serial_sales (sale_item_id);
create index if not exists device_serial_sales_sale_idx
  on inventory.device_serial_sales (sale_id);

-- ============ 5. FIFO costing columns ============
alter table inventory.stock_batches
  add column if not exists unit_cost numeric(14,2) not null default 0;
alter table sales.sale_items
  add column if not exists unit_cost numeric(14,2) not null default 0;
alter table sales.sales
  add column if not exists cost_amount numeric(14,2) not null default 0;

commit;
