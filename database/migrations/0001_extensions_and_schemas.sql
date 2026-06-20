begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

create schema if not exists identity;
create schema if not exists access;
create schema if not exists platform;
create schema if not exists store;
create schema if not exists catalog;
create schema if not exists inventory;
create schema if not exists sales;
create schema if not exists shipping;
create schema if not exists billing;
create schema if not exists support;
create schema if not exists comms;
create schema if not exists reporting;
create schema if not exists audit;
create schema if not exists integration;

create table if not exists platform.tenants (
  id uuid primary key default gen_random_uuid(),
  code varchar(100) not null unique,
  name varchar(200) not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_status_check check (status in ('active', 'inactive'))
);

create table if not exists platform.settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  key varchar(150) not null,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_settings_key_unique unique (tenant_id, key)
);

create or replace function platform.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function platform.touch_updated_at(schema_name text, table_name text)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop trigger if exists %I on %I.%I',
    table_name || '_set_updated_at',
    schema_name,
    table_name
  );

  execute format(
    'create trigger %I before update on %I.%I for each row execute function platform.set_updated_at()',
    table_name || '_set_updated_at',
    schema_name,
    table_name
  );
end;
$$;

select platform.touch_updated_at('platform', 'tenants');
select platform.touch_updated_at('platform', 'settings');

commit;
