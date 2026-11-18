begin;

-- Branch-to-branch stock transfers
create table if not exists inventory.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  transfer_no varchar(50) not null,
  location_from uuid not null references inventory.locations(id) on delete restrict,
  location_to uuid not null references inventory.locations(id) on delete restrict,
  transfer_date date not null default current_date,
  note text,
  created_by uuid not null references identity.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stock_transfers_no_unique unique (store_id, transfer_no),
  constraint stock_transfers_locations_check check (location_from <> location_to)
);

create table if not exists inventory.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references inventory.stock_transfers(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete restrict,
  product_name_snapshot varchar(250) not null,
  sku_code_snapshot varchar(100) not null,
  qty numeric(14,3) not null check (qty > 0)
);

create index if not exists stock_transfers_store_idx on inventory.stock_transfers (store_id, created_at desc);

-- A return can restock at a different outlet than the original sale.
alter table sales.sale_returns
  add column if not exists location_id uuid references inventory.locations(id) on delete set null;

-- Staff can cover multiple outlets.
create table if not exists access.store_memberships_locations (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references access.store_memberships(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete cascade,
  constraint memberships_locations_unique unique (membership_id, location_id)
);

-- Dead table: never referenced by any API.
drop table if exists inventory.stock_initializations;

commit;
