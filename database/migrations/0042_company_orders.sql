begin;

-- Deposit-first company orders: a dealer places an order against a company,
-- sends a deposit with a reference, the company confirms and ships (often in
-- parts by truck), and stock is received through the existing flow.
alter table procurement.purchases
  add column if not exists order_ref varchar(100),
  add column if not exists expected_date date,
  add column if not exists deposit_amount numeric(14,2) not null default 0,
  add column if not exists deposit_reference varchar(100),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists driver_name varchar(120),
  add column if not exists driver_phone varchar(30),
  add column if not exists delivery_cost numeric(14,2) not null default 0;

-- Ordered (estimated) vs actually-received quantities. `qty` remains the
-- billed/actual quantity used for totals.
alter table procurement.purchase_items
  add column if not exists estimated_qty numeric(14,3),
  add column if not exists received_qty numeric(14,3) not null default 0;

-- Distinguish a deposit from a settlement on the payable.
alter table procurement.purchase_payments
  add column if not exists payment_kind text not null default 'settlement';

alter table procurement.purchase_payments drop constraint if exists procurement_purchase_payments_kind_check;
alter table procurement.purchase_payments add constraint procurement_purchase_payments_kind_check
  check (payment_kind in ('deposit', 'settlement'));

-- Each (partial) delivery against an order: truck, driver, challan.
create table if not exists procurement.purchase_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  purchase_id uuid not null references procurement.purchases(id) on delete cascade,
  delivery_no varchar(50) not null,
  truck_no varchar(60),
  driver_name varchar(120),
  driver_phone varchar(30),
  challan_no varchar(100),
  delivery_cost numeric(14,2) not null default 0,
  received_qty numeric(14,3) not null default 0,
  delivered_at timestamptz not null default now(),
  note text,
  created_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists procurement_purchase_deliveries_purchase_idx
  on procurement.purchase_deliveries (purchase_id, delivered_at desc);

create table if not exists procurement.purchase_delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references procurement.purchase_deliveries(id) on delete cascade,
  purchase_item_id uuid not null references procurement.purchase_items(id) on delete cascade,
  qty numeric(14,3) not null,
  created_at timestamptz not null default now(),
  constraint procurement_purchase_delivery_items_qty_check check (qty > 0)
);

create index if not exists procurement_purchase_delivery_items_delivery_idx
  on procurement.purchase_delivery_items (delivery_id);

commit;
