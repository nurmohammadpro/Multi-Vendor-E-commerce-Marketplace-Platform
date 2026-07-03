begin;

create table if not exists integration.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  gateway_id uuid not null references integration.payment_gateways(id) on delete restrict,
  provider_code varchar(50) not null,
  transaction_ref varchar(150) not null,
  provider_transaction_id varchar(150),
  amount numeric(14,2) not null,
  currency varchar(3) not null default 'BDT',
  order_reference varchar(100),
  status text not null default 'initiated',
  provider_raw_response jsonb,
  customer_name varchar(200),
  customer_phone varchar(30),
  customer_email citext,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at timestamptz,
  refund_amount numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_status_check check (
    status in ('initiated', 'pending', 'completed', 'failed', 'refunded', 'cancelled')
  ),
  constraint payment_transactions_amount_check check (amount > 0),
  constraint payment_transactions_ref_unique unique (store_id, transaction_ref)
);

create index if not exists payment_transactions_store_idx
  on integration.payment_transactions (store_id, created_at desc);

create index if not exists payment_transactions_provider_idx
  on integration.payment_transactions (provider_code, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists payment_transactions_order_ref_idx
  on integration.payment_transactions (order_reference)
  where order_reference is not null;

select platform.touch_updated_at('integration', 'payment_transactions');

commit;
