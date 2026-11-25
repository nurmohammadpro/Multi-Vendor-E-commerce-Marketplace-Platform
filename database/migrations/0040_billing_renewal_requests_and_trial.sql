begin;

-- ── Per-plan trial length ───────────────────────────────────────────────
-- Every new subscription starts on a free trial of `trial_days` days; the
-- trial end doubles as the subscription's first renewal date.
alter table billing.plans
  add column if not exists trial_days int not null default 15;

do $$
begin
  alter table billing.plans drop constraint if exists plans_trial_days_check;
  alter table billing.plans add constraint plans_trial_days_check
    check (trial_days between 0 and 365);
exception
  when duplicate_object then null;
end $$;

-- ── Manual renewal requests (BanglaQR) ───────────────────────────────────
-- A tenant pays the platform manually by scanning the Bank Asia BanglaQR
-- merchant code, then submits the sender number so the admin can match the
-- transaction on their statement.
create table if not exists billing.renewal_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  subscription_id uuid references billing.subscriptions(id) on delete set null,
  plan_id uuid references billing.plans(id) on delete set null,
  plan_code varchar(50) not null,
  billing_cycle text not null default 'monthly',
  amount numeric(14,2) not null,
  payment_method text not null default 'banglaqr',
  sender_number varchar(32) not null,
  transaction_id varchar(100),
  note text,
  status text not null default 'pending',
  decided_by uuid references identity.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint renewal_requests_payment_method_check check (payment_method in ('banglaqr', 'bkash', 'bank_transfer', 'cash', 'other')),
  constraint renewal_requests_cycle_check check (billing_cycle in ('monthly', 'yearly')),
  constraint renewal_requests_sender_number_check check (length(btrim(sender_number)) >= 4)
);

create index if not exists renewal_requests_store_status_idx
  on billing.renewal_requests (store_id, status, created_at desc);

create index if not exists renewal_requests_tenant_status_idx
  on billing.renewal_requests (tenant_id, status, created_at desc);

-- Only one request may be awaiting review per store at a time.
create unique index if not exists renewal_requests_one_pending_per_store
  on billing.renewal_requests (store_id)
  where status = 'pending';

commit;
