begin;

create table if not exists inventory.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  code varchar(50) not null,
  name varchar(150) not null,
  location_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_locations_type_check check (location_type in ('storefront', 'warehouse', 'backroom')),
  constraint inventory_locations_status_check check (status in ('active', 'inactive')),
  constraint inventory_locations_code_unique unique (store_id, code)
);

create table if not exists inventory.balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  on_hand_qty numeric(14,3) not null default 0,
  reserved_qty numeric(14,3) not null default 0,
  available_qty numeric(14,3) generated always as (on_hand_qty - reserved_qty) stored,
  damaged_qty numeric(14,3) not null default 0,
  returned_qty numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  constraint inventory_balances_unique unique (location_id, sku_id),
  constraint inventory_balances_non_negative_check check (
    on_hand_qty >= 0 and
    reserved_qty >= 0 and
    damaged_qty >= 0 and
    returned_qty >= 0 and
    on_hand_qty >= reserved_qty
  )
);

create index if not exists inventory_balances_store_sku_idx
  on inventory.balances (store_id, sku_id);

create table if not exists inventory.ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete restrict,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  movement_type text not null,
  qty_delta numeric(14,3) not null,
  reference_type text not null,
  reference_id uuid,
  note text,
  actor_id uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_ledger_movement_type_check check (
    movement_type in ('initial', 'sale', 'return', 'manual_adjustment', 'approval_adjustment', 'damage', 'transfer')
  )
);

create index if not exists inventory_ledger_sku_created_idx
  on inventory.ledger (sku_id, created_at desc);

create index if not exists inventory_ledger_reference_idx
  on inventory.ledger (reference_type, reference_id);

create table if not exists inventory.stock_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete restrict,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  requested_by uuid not null references identity.users(id) on delete restrict,
  current_qty numeric(14,3) not null,
  requested_qty numeric(14,3) not null,
  qty_delta numeric(14,3) not null,
  reason text not null,
  status text not null default 'pending',
  decided_by uuid references identity.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_adjustment_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists stock_adjustment_requests_store_status_idx
  on inventory.stock_adjustment_requests (store_id, status, created_at desc);

create table if not exists inventory.stock_initializations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  initialized_by uuid not null references identity.users(id) on delete restrict,
  initialized_at timestamptz not null default now(),
  constraint stock_initializations_unique unique (location_id, sku_id)
);

create table if not exists sales.registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  code varchar(50) not null,
  name varchar(100) not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_registers_status_check check (status in ('active', 'inactive')),
  constraint sales_registers_code_unique unique (store_id, code)
);

create table if not exists sales.register_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  register_id uuid not null references sales.registers(id) on delete restrict,
  opened_by uuid not null references identity.users(id) on delete restrict,
  closed_by uuid references identity.users(id) on delete set null,
  opening_cash numeric(14,2) not null default 0,
  closing_cash numeric(14,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint register_shifts_status_check check (status in ('open', 'closed')),
  constraint register_shifts_cash_check check (
    opening_cash >= 0 and
    (closing_cash is null or closing_cash >= 0)
  )
);

create index if not exists register_shifts_store_status_idx
  on sales.register_shifts (store_id, status, opened_at desc);

create table if not exists sales.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete restrict,
  register_id uuid references sales.registers(id) on delete set null,
  shift_id uuid references sales.register_shifts(id) on delete set null,
  sale_no varchar(50) not null,
  sold_by uuid not null references identity.users(id) on delete restrict,
  customer_name varchar(200),
  customer_phone varchar(30),
  subtotal_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  shipping_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null,
  payment_status text not null default 'paid',
  fulfillment_status text not null default 'completed',
  status text not null default 'completed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_sale_no_unique unique (store_id, sale_no),
  constraint sales_payment_status_check check (payment_status in ('pending', 'paid', 'partial', 'refunded')),
  constraint sales_fulfillment_status_check check (fulfillment_status in ('completed', 'delivery_pending', 'returned')),
  constraint sales_status_check check (status in ('completed', 'voided', 'returned_partially', 'returned_fully')),
  constraint sales_amounts_non_negative_check check (
    subtotal_amount >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    shipping_amount >= 0 and
    total_amount >= 0
  )
);

create index if not exists sales_store_created_idx
  on sales.sales (store_id, created_at desc);

create index if not exists sales_sold_by_idx
  on sales.sales (sold_by, created_at desc);

create table if not exists sales.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales.sales(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  product_name_snapshot varchar(250) not null,
  sku_code_snapshot varchar(80) not null,
  qty numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint sale_items_qty_check check (qty > 0),
  constraint sale_items_amounts_check check (
    unit_price >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    line_total >= 0
  )
);

create index if not exists sale_items_sale_idx
  on sales.sale_items (sale_id);

create table if not exists sales.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales.sales(id) on delete cascade,
  payment_method text not null,
  gateway_provider text,
  amount numeric(14,2) not null,
  reference_no varchar(100),
  status text not null default 'paid',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sale_payments_method_check check (payment_method in ('cash', 'card', 'mfs', 'bank_transfer', 'split')),
  constraint sale_payments_status_check check (status in ('pending', 'paid', 'failed', 'refunded')),
  constraint sale_payments_amount_check check (amount >= 0)
);

create table if not exists sales.sale_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sale_id uuid not null references sales.sales(id) on delete restrict,
  processed_by uuid not null references identity.users(id) on delete restrict,
  reason text not null,
  refund_amount numeric(14,2) not null,
  status text not null default 'processed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_returns_status_check check (status in ('processed', 'rejected')),
  constraint sale_returns_refund_amount_check check (refund_amount >= 0)
);

create table if not exists sales.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references sales.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references sales.sale_items(id) on delete restrict,
  qty numeric(14,3) not null,
  restock_to_inventory boolean not null default true,
  line_refund_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint sale_return_items_qty_check check (qty > 0),
  constraint sale_return_items_line_refund_check check (line_refund_amount >= 0)
);

select platform.touch_updated_at('inventory', 'locations');
select platform.touch_updated_at('inventory', 'stock_adjustment_requests');
select platform.touch_updated_at('sales', 'registers');
select platform.touch_updated_at('sales', 'register_shifts');
select platform.touch_updated_at('sales', 'sales');
select platform.touch_updated_at('sales', 'sale_returns');

commit;
