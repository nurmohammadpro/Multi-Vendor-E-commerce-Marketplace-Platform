begin;

alter table comms.notifications
  add column if not exists context_json jsonb default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists provider_message_id varchar(150);

create table if not exists comms.email_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  provider_code varchar(50) not null,
  display_name varchar(100) not null,
  is_default boolean not null default false,
  config_json jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_providers_status_check check (status in ('active', 'inactive')),
  constraint email_providers_one_default unique (tenant_id, is_default) deferrable initially deferred
);

create table if not exists comms.sms_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  provider_code varchar(50) not null,
  display_name varchar(100) not null,
  is_default boolean not null default false,
  config_json jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_providers_status_check check (status in ('active', 'inactive'))
);

select platform.touch_updated_at('comms', 'notifications');
select platform.touch_updated_at('comms', 'email_providers');
select platform.touch_updated_at('comms', 'sms_providers');

commit;
