begin;

create table if not exists sales.sale_print_jobs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales.sales(id) on delete cascade,
  store_id uuid not null references store.stores(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  error_message text,
  constraint sale_print_jobs_status_check check (status in ('pending','printed','failed'))
);

create unique index if not exists sale_print_jobs_sale_idx
  on sales.sale_print_jobs (sale_id);

create index if not exists sale_print_jobs_pending_idx
  on sales.sale_print_jobs (store_id, created_at asc)
  where status = 'pending';

select platform.touch_updated_at('sales', 'sale_print_jobs');
commit;
