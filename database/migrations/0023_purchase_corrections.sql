begin;

-- Remove stock_initializations — stock is now created through purchases only
drop table if exists inventory.stock_initializations cascade;

create table if not exists procurement.purchase_correction_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  purchase_id uuid not null references procurement.purchases(id) on delete cascade,
  request_no varchar(50) not null,
  status text not null default 'pending',
  changes jsonb not null default '{}'::jsonb,
  reason text,
  requested_by uuid references identity.users(id) on delete set null,
  decided_by uuid references identity.users(id) on delete set null,
  decided_at timestamptz,
  rejection_reason text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_correction_status_check check (status in ('pending','approved','rejected','applied')),
  constraint purchase_correction_no_unique unique (store_id, request_no)
);

create index if not exists purchase_correction_store_idx
  on procurement.purchase_correction_requests (store_id, status, created_at desc);

select platform.touch_updated_at('procurement', 'purchase_correction_requests');

commit;
