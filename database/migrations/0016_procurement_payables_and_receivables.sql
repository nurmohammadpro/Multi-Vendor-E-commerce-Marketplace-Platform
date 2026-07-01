begin;

create schema if not exists procurement;

insert into access.permissions (code, resource, action, description)
values
  ('procurement.manage', 'procurement', 'manage', 'Manage suppliers, purchases, and stock receiving'),
  ('finance.payables.manage', 'finance', 'manage_payables', 'Manage supplier payables and purchase payments')
on conflict (code) do nothing;

with role_map as (
  select code, id from access.roles
),
permission_map as (
  select code, id from access.permissions
),
assignments(role_code, permission_code) as (
  values
    ('store_owner', 'procurement.manage'),
    ('store_owner', 'finance.payables.manage'),
    ('store_manager', 'procurement.manage'),
    ('store_manager', 'finance.payables.manage')
)
insert into access.role_permissions (role_id, permission_id)
select r.id, p.id
from assignments a
join role_map r on r.code = a.role_code
join permission_map p on p.code = a.permission_code
on conflict do nothing;

create table if not exists procurement.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  supplier_type text not null default 'supplier',
  company_name varchar(200) not null,
  contact_name varchar(200),
  phone varchar(30),
  email citext,
  address text,
  note text,
  opening_payable_amount numeric(14,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procurement_suppliers_type_check check (supplier_type in ('supplier', 'importer', 'company')),
  constraint procurement_suppliers_status_check check (status in ('active', 'inactive')),
  constraint procurement_suppliers_opening_check check (opening_payable_amount >= 0)
);

create index if not exists procurement_suppliers_store_created_idx
  on procurement.suppliers (store_id, created_at desc);

create index if not exists procurement_suppliers_store_name_idx
  on procurement.suppliers (store_id, company_name);

create table if not exists procurement.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  supplier_id uuid not null references procurement.suppliers(id) on delete restrict,
  location_id uuid not null references inventory.locations(id) on delete restrict,
  purchase_no varchar(50) not null,
  purchase_date date not null,
  invoice_no varchar(100),
  subtotal_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  shipping_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  payment_status text not null default 'pending',
  status text not null default 'received',
  note text,
  created_by uuid not null references identity.users(id) on delete restrict,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procurement_purchases_no_unique unique (store_id, purchase_no),
  constraint procurement_purchases_amounts_check check (
    subtotal_amount >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    shipping_amount >= 0 and
    total_amount >= 0 and
    paid_amount >= 0 and
    paid_amount <= total_amount
  ),
  constraint procurement_purchases_payment_status_check check (payment_status in ('pending', 'partial', 'paid')),
  constraint procurement_purchases_status_check check (status in ('draft', 'received', 'cancelled'))
);

create index if not exists procurement_purchases_store_created_idx
  on procurement.purchases (store_id, created_at desc);

create index if not exists procurement_purchases_supplier_idx
  on procurement.purchases (supplier_id, purchase_date desc);

create table if not exists procurement.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references procurement.purchases(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  product_name_snapshot varchar(250) not null,
  sku_code_snapshot varchar(100) not null,
  variant_label_snapshot varchar(250),
  qty numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint procurement_purchase_items_qty_check check (qty > 0),
  constraint procurement_purchase_items_amount_check check (
    unit_cost >= 0 and
    line_total >= 0
  )
);

create index if not exists procurement_purchase_items_purchase_idx
  on procurement.purchase_items (purchase_id);

create table if not exists procurement.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references procurement.purchases(id) on delete cascade,
  payment_method text not null,
  amount numeric(14,2) not null,
  reference_no varchar(100),
  status text not null default 'paid',
  note text,
  paid_at timestamptz,
  created_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint procurement_purchase_payments_method_check check (payment_method in ('cash', 'card', 'mfs', 'bank_transfer')),
  constraint procurement_purchase_payments_status_check check (status in ('pending', 'paid', 'failed', 'refunded')),
  constraint procurement_purchase_payments_amount_check check (amount >= 0)
);

create index if not exists procurement_purchase_payments_purchase_idx
  on procurement.purchase_payments (purchase_id, created_at desc);

select platform.touch_updated_at('procurement', 'suppliers');
select platform.touch_updated_at('procurement', 'purchases');
select platform.touch_updated_at('procurement', 'purchase_items');
select platform.touch_updated_at('procurement', 'purchase_payments');

commit;
