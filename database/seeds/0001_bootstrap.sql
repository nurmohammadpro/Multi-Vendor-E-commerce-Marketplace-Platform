begin;

-- Tenant: insert if not exists, otherwise update
do $$
declare
  v_tenant_id uuid;
  v_code text := current_setting('app.bootstrap_tenant_code', true);
  v_name text := current_setting('app.bootstrap_tenant_name', true);
begin
  select id into v_tenant_id from platform.tenants where code = v_code;
  if v_tenant_id is null then
    insert into platform.tenants (id, code, name, status, created_at, updated_at)
    values (coalesce(nullif(current_setting('app.bootstrap_tenant_id', true), ''), gen_random_uuid()::text)::uuid,
            v_code, v_name, 'active', now(), now())
    returning id into v_tenant_id;
  else
    update platform.tenants set name = v_name, updated_at = now() where id = v_tenant_id;
  end if;
  perform set_config('seed.tenant_id', v_tenant_id::text, true);
end;
$$;

-- Platform Owner user
do $$
declare
  v_user_id uuid;
  v_email citext := nullif(current_setting('app.platform_owner_email', true), '')::citext;
  v_phone text := nullif(current_setting('app.platform_owner_phone', true), '');
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
begin
  select u.id into v_user_id from identity.users u where u.email = v_email and v_email is not null;
  if v_user_id is null and v_phone is not null then
    select u.id into v_user_id from identity.users u where u.phone = v_phone;
  end if;

  if v_user_id is null then
    insert into identity.users (id, tenant_id, email, phone, password_hash, status, preferred_locale, created_at, updated_at)
    values (coalesce(nullif(current_setting('app.platform_owner_user_id', true), ''), gen_random_uuid()::text)::uuid,
            v_tenant_id, v_email, v_phone,
            current_setting('app.platform_owner_password_hash', true),
            'active',
            coalesce(nullif(current_setting('app.platform_owner_locale', true), ''), 'en'),
            now(), now())
    returning id into v_user_id;
  else
    update identity.users set
      phone = coalesce(v_phone, users.phone),
      password_hash = current_setting('app.platform_owner_password_hash', true),
      status = 'active',
      updated_at = now()
    where id = v_user_id;
  end if;
  perform set_config('seed.platform_owner_id', v_user_id::text, true);
end;
$$;

-- Platform Owner profile
do $$
declare
  v_user_id uuid := current_setting('seed.platform_owner_id', true)::uuid;
  v_name text := current_setting('app.platform_owner_name', true);
begin
  if exists (select 1 from identity.user_profiles where user_id = v_user_id) then
    update identity.user_profiles set full_name = v_name, updated_at = now() where user_id = v_user_id;
  else
    insert into identity.user_profiles (user_id, full_name, created_at, updated_at)
    values (v_user_id, v_name, now(), now());
  end if;
end;
$$;

-- Platform Owner admin membership
do $$
declare
  v_user_id uuid := current_setting('seed.platform_owner_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_role_id uuid;
begin
  select id into v_role_id from access.roles where code = 'platform_owner';
  if not exists (select 1 from access.admin_memberships where tenant_id = v_tenant_id and user_id = v_user_id and status = 'active') then
    insert into access.admin_memberships (id, tenant_id, user_id, base_role_id, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_user_id, v_role_id, 'active', now(), now());
  end if;
end;
$$;

-- Platform Admin user
do $$
declare
  v_user_id uuid;
  v_email citext := nullif(current_setting('app.platform_admin_email', true), '')::citext;
  v_phone text := nullif(current_setting('app.platform_admin_phone', true), '');
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
begin
  select u.id into v_user_id from identity.users u where u.email = v_email and v_email is not null;
  if v_user_id is null and v_phone is not null then
    select u.id into v_user_id from identity.users u where u.phone = v_phone;
  end if;

  if v_user_id is null then
    insert into identity.users (id, tenant_id, email, phone, password_hash, status, preferred_locale, created_at, updated_at)
    values (coalesce(nullif(current_setting('app.platform_admin_user_id', true), ''), gen_random_uuid()::text)::uuid,
            v_tenant_id, v_email, v_phone,
            current_setting('app.platform_admin_password_hash', true),
            'active',
            coalesce(nullif(current_setting('app.platform_admin_locale', true), ''), 'en'),
            now(), now())
    returning id into v_user_id;
  else
    update identity.users set
      phone = coalesce(v_phone, users.phone),
      password_hash = current_setting('app.platform_admin_password_hash', true),
      status = 'active',
      updated_at = now()
    where id = v_user_id;
  end if;
  perform set_config('seed.platform_admin_id', v_user_id::text, true);
end;
$$;

-- Platform Admin profile
do $$
declare
  v_user_id uuid := current_setting('seed.platform_admin_id', true)::uuid;
  v_name text := current_setting('app.platform_admin_name', true);
begin
  if exists (select 1 from identity.user_profiles where user_id = v_user_id) then
    update identity.user_profiles set full_name = v_name, updated_at = now() where user_id = v_user_id;
  else
    insert into identity.user_profiles (user_id, full_name, created_at, updated_at)
    values (v_user_id, v_name, now(), now());
  end if;
end;
$$;

-- Platform Admin membership (also platform_owner per project requirements)
do $$
declare
  v_user_id uuid := current_setting('seed.platform_admin_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_role_id uuid;
begin
  select id into v_role_id from access.roles where code = 'platform_owner';
  if not exists (select 1 from access.admin_memberships where tenant_id = v_tenant_id and user_id = v_user_id and status = 'active') then
    insert into access.admin_memberships (id, tenant_id, user_id, base_role_id, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_user_id, v_role_id, 'active', now(), now());
  end if;
end;
$$;

-- Store Owner user
do $$
declare
  v_user_id uuid;
  v_email citext := nullif(current_setting('app.store_owner_email', true), '')::citext;
  v_phone text := nullif(current_setting('app.store_owner_phone', true), '');
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
begin
  select u.id into v_user_id from identity.users u where u.email = v_email and v_email is not null;
  if v_user_id is null and v_phone is not null then
    select u.id into v_user_id from identity.users u where u.phone = v_phone;
  end if;

  if v_user_id is null then
    insert into identity.users (id, tenant_id, email, phone, password_hash, status, preferred_locale, created_at, updated_at)
    values (coalesce(nullif(current_setting('app.store_owner_user_id', true), ''), gen_random_uuid()::text)::uuid,
            v_tenant_id, v_email, v_phone,
            current_setting('app.store_owner_password_hash', true),
            'active',
            coalesce(nullif(current_setting('app.store_owner_locale', true), ''), 'en'),
            now(), now())
    returning id into v_user_id;
  else
    update identity.users set
      phone = coalesce(v_phone, users.phone),
      password_hash = current_setting('app.store_owner_password_hash', true),
      status = 'active',
      updated_at = now()
    where id = v_user_id;
  end if;
  perform set_config('seed.store_owner_id', v_user_id::text, true);
end;
$$;

-- Store Owner profile
do $$
declare
  v_user_id uuid := current_setting('seed.store_owner_id', true)::uuid;
  v_name text := current_setting('app.store_owner_name', true);
begin
  if exists (select 1 from identity.user_profiles where user_id = v_user_id) then
    update identity.user_profiles set full_name = v_name, updated_at = now() where user_id = v_user_id;
  else
    insert into identity.user_profiles (user_id, full_name, created_at, updated_at)
    values (v_user_id, v_name, now(), now());
  end if;
end;
$$;

-- Store
do $$
declare
  v_store_id uuid;
  v_owner_id uuid := current_setting('seed.store_owner_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_slug text := current_setting('app.store_slug', true);
begin
  select id into v_store_id from store.stores where slug = v_slug;

  if v_store_id is null then
    insert into store.stores (id, tenant_id, owner_user_id, store_code, name, name_bn, slug, phone, email, status, subscription_status, created_at, updated_at)
    values (coalesce(nullif(current_setting('app.store_id', true), ''), gen_random_uuid()::text)::uuid,
            v_tenant_id, v_owner_id,
            current_setting('app.store_code', true),
            current_setting('app.store_name', true),
            nullif(current_setting('app.store_name_bn', true), ''),
            v_slug,
            current_setting('app.store_phone', true),
            nullif(current_setting('app.store_email', true), '')::citext,
            'active', 'active', now(), now())
    returning id into v_store_id;
  else
    update store.stores set
      name = current_setting('app.store_name', true),
      name_bn = nullif(current_setting('app.store_name_bn', true), ''),
      phone = current_setting('app.store_phone', true),
      email = nullif(current_setting('app.store_email', true), '')::citext,
      owner_user_id = v_owner_id,
      updated_at = now()
    where id = v_store_id;
  end if;
  perform set_config('seed.store_id', v_store_id::text, true);
end;
$$;

-- Store settings
do $$
declare
  v_store_id uuid := current_setting('seed.store_id', true)::uuid;
begin
  if exists (select 1 from store.store_settings where store_id = v_store_id) then
    update store.store_settings set
      timezone = coalesce(nullif(current_setting('app.store_timezone', true), ''), 'Asia/Dhaka'),
      locale = coalesce(nullif(current_setting('app.store_locale', true), ''), 'en'),
      updated_at = now()
    where store_id = v_store_id;
  else
    insert into store.store_settings (store_id, timezone, currency_code, locale, allow_negative_stock, created_at, updated_at)
    values (v_store_id,
            coalesce(nullif(current_setting('app.store_timezone', true), ''), 'Asia/Dhaka'),
            'BDT',
            coalesce(nullif(current_setting('app.store_locale', true), ''), 'en'),
            false, now(), now());
  end if;
end;
$$;

-- Default inventory location
do $$
declare
  v_store_id uuid := current_setting('seed.store_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_location_id uuid;
begin
  select id into v_location_id from inventory.locations where store_id = v_store_id and code = 'MAIN';

  if v_location_id is null then
    insert into inventory.locations (id, tenant_id, store_id, code, name, location_type, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, 'MAIN', 'Main Stock', 'storefront', 'active', now(), now())
    returning id into v_location_id;
  else
    update inventory.locations set name = 'Main Stock', location_type = 'storefront', status = 'active', updated_at = now()
    where id = v_location_id;
  end if;
  perform set_config('seed.default_location_id', v_location_id::text, true);
end;
$$;

-- Default POS register
do $$
declare
  v_store_id uuid := current_setting('seed.store_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_register_id uuid;
begin
  select id into v_register_id from sales.registers where store_id = v_store_id and code = 'REG-01';

  if v_register_id is null then
    insert into sales.registers (id, tenant_id, store_id, code, name, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, 'REG-01', 'Main POS Register', 'active', now(), now())
    returning id into v_register_id;
  else
    update sales.registers set name = 'Main POS Register', status = 'active', updated_at = now()
    where id = v_register_id;
  end if;
end;
$$;

-- Default courier providers (Pathao, Steadfast, REDX)
do $$
declare
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
begin
  if not exists (select 1 from shipping.courier_providers where tenant_id = v_tenant_id and code = 'pathao') then
    insert into shipping.courier_providers (id, tenant_id, code, name, status, config_json, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'pathao', 'Pathao Courier', 'active', '{}'::jsonb, now(), now());
  end if;
  if not exists (select 1 from shipping.courier_providers where tenant_id = v_tenant_id and code = 'steadfast') then
    insert into shipping.courier_providers (id, tenant_id, code, name, status, config_json, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'steadfast', 'Steadfast', 'active', '{}'::jsonb, now(), now());
  end if;
  if not exists (select 1 from shipping.courier_providers where tenant_id = v_tenant_id and code = 'redx') then
    insert into shipping.courier_providers (id, tenant_id, code, name, status, config_json, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'redx', 'REDX', 'active', '{}'::jsonb, now(), now());
  end if;
end;
$$;

-- Default billing plans
do $$
declare
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
begin
  if not exists (select 1 from billing.plans where tenant_id = v_tenant_id and code = 'basic') then
    insert into billing.plans (id, tenant_id, code, name, price_amount, billing_cycle, features_json, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'basic', 'Basic', 0::numeric(14,2), 'monthly',
            '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings"]'::jsonb,
            'active', now(), now());
  end if;
  if not exists (select 1 from billing.plans where tenant_id = v_tenant_id and code = 'standard') then
    insert into billing.plans (id, tenant_id, code, name, price_amount, billing_cycle, features_json, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'standard', 'Standard', 0::numeric(14,2), 'monthly',
            '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings","daily_expenses","hr_payroll"]'::jsonb,
            'active', now(), now());
  end if;
  if not exists (select 1 from billing.plans where tenant_id = v_tenant_id and code = 'pro') then
    insert into billing.plans (id, tenant_id, code, name, price_amount, billing_cycle, features_json, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, 'pro', 'Pro', 0::numeric(14,2), 'monthly',
            '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings","daily_expenses","hr_payroll","banking","full_accounting"]'::jsonb,
            'active', now(), now());
  end if;
end;
$$;

-- Store Owner store membership
do $$
declare
  v_store_id uuid := current_setting('seed.store_id', true)::uuid;
  v_tenant_id uuid := current_setting('seed.tenant_id', true)::uuid;
  v_user_id uuid := current_setting('seed.store_owner_id', true)::uuid;
  v_role_id uuid;
begin
  select id into v_role_id from access.roles where code = 'store_owner';
  if not exists (select 1 from access.store_memberships where store_id = v_store_id and user_id = v_user_id and status = 'active') then
    insert into access.store_memberships (id, tenant_id, store_id, user_id, role_id, status, joined_at, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_user_id, v_role_id, 'active', now(), now(), now());
  end if;
end;
$$;

select
  current_setting('seed.tenant_id', true)::uuid as tenant_id,
  current_setting('seed.platform_owner_id', true)::uuid as platform_owner_user_id,
  current_setting('seed.platform_admin_id', true)::uuid as platform_admin_user_id,
  current_setting('seed.store_owner_id', true)::uuid as store_owner_user_id,
  current_setting('seed.store_id', true)::uuid as store_id,
  (select id from inventory.locations where store_id = current_setting('seed.store_id', true)::uuid and code = 'MAIN' limit 1) as default_location_id,
  (select id from sales.registers where store_id = current_setting('seed.store_id', true)::uuid and code = 'REG-01' limit 1) as default_register_id;

commit;
