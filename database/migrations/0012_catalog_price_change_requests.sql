begin;

create table if not exists catalog.price_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  current_price_id uuid references catalog.prices(id) on delete set null,
  requested_by uuid not null references identity.users(id) on delete restrict,
  current_cost_price numeric(14,2),
  current_sale_price numeric(14,2) not null,
  current_compare_at_price numeric(14,2),
  requested_cost_price numeric(14,2),
  requested_sale_price numeric(14,2) not null,
  requested_compare_at_price numeric(14,2),
  requested_effective_from timestamptz not null default now(),
  requested_effective_to timestamptz,
  reason text not null,
  status text not null default 'pending',
  decided_by uuid references identity.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  approved_price_id uuid references catalog.prices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_change_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint price_change_requests_amounts_check check (
    current_sale_price >= 0 and
    requested_sale_price >= 0 and
    (current_cost_price is null or current_cost_price >= 0) and
    (current_compare_at_price is null or current_compare_at_price >= 0) and
    (requested_cost_price is null or requested_cost_price >= 0) and
    (requested_compare_at_price is null or requested_compare_at_price >= 0)
  ),
  constraint price_change_requests_range_check check (
    requested_effective_to is null or requested_effective_to > requested_effective_from
  )
);

create index if not exists price_change_requests_store_status_idx
  on catalog.price_change_requests (store_id, status, created_at desc);

select platform.touch_updated_at('catalog', 'price_change_requests');

commit;
