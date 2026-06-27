begin;

with tenant_row as (
  insert into platform.tenants (
    id,
    code,
    name,
    status,
    created_at,
    updated_at
  )
  values (
    coalesce(nullif(current_setting('app.bootstrap_tenant_id', true), ''), gen_random_uuid()::text)::uuid,
    current_setting('app.bootstrap_tenant_code', true),
    current_setting('app.bootstrap_tenant_name', true),
    'active',
    now(),
    now()
  )
  on conflict (code)
  do update set
    name = excluded.name,
    updated_at = now()
  returning id
),
platform_owner_user as (
  insert into identity.users (
    id,
    tenant_id,
    email,
    phone,
    password_hash,
    status,
    preferred_locale,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(current_setting('app.platform_owner_user_id', true), ''), gen_random_uuid()::text)::uuid,
    tenant_row.id,
    nullif(current_setting('app.platform_owner_email', true), '')::citext,
    nullif(current_setting('app.platform_owner_phone', true), ''),
    current_setting('app.platform_owner_password_hash', true),
    'active',
    coalesce(nullif(current_setting('app.platform_owner_locale', true), ''), 'en'),
    now(),
    now()
  from tenant_row
  on conflict (email)
  do update set
    phone = excluded.phone,
    password_hash = excluded.password_hash,
    status = 'active',
    updated_at = now()
  returning id, tenant_id
),
platform_owner_profile as (
  insert into identity.user_profiles (
    user_id,
    full_name,
    created_at,
    updated_at
  )
  select
    platform_owner_user.id,
    current_setting('app.platform_owner_name', true),
    now(),
    now()
  from platform_owner_user
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    updated_at = now()
  returning user_id
),
platform_owner_membership as (
  insert into access.admin_memberships (
    id,
    tenant_id,
    user_id,
    base_role_id,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    platform_owner_user.tenant_id,
    platform_owner_user.id,
    roles.id,
    'active',
    now(),
    now()
  from platform_owner_user
  join access.roles roles on roles.code = 'platform_owner'
  on conflict do nothing
  returning user_id
),
platform_admin_user as (
  insert into identity.users (
    id,
    tenant_id,
    email,
    phone,
    password_hash,
    status,
    preferred_locale,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(current_setting('app.platform_admin_user_id', true), ''), gen_random_uuid()::text)::uuid,
    tenant_row.id,
    nullif(current_setting('app.platform_admin_email', true), '')::citext,
    nullif(current_setting('app.platform_admin_phone', true), ''),
    current_setting('app.platform_admin_password_hash', true),
    'active',
    coalesce(nullif(current_setting('app.platform_admin_locale', true), ''), 'en'),
    now(),
    now()
  from tenant_row
  on conflict (email)
  do update set
    phone = excluded.phone,
    password_hash = excluded.password_hash,
    status = 'active',
    updated_at = now()
  returning id, tenant_id
),
platform_admin_profile as (
  insert into identity.user_profiles (
    user_id,
    full_name,
    created_at,
    updated_at
  )
  select
    platform_admin_user.id,
    current_setting('app.platform_admin_name', true),
    now(),
    now()
  from platform_admin_user
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    updated_at = now()
  returning user_id
),
platform_admin_membership as (
  insert into access.admin_memberships (
    id,
    tenant_id,
    user_id,
    base_role_id,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    platform_admin_user.tenant_id,
    platform_admin_user.id,
    roles.id,
    'active',
    now(),
    now()
  from platform_admin_user
  join access.roles roles on roles.code = 'regular_admin'
  on conflict do nothing
  returning user_id
),
store_owner_user as (
  insert into identity.users (
    id,
    tenant_id,
    email,
    phone,
    password_hash,
    status,
    preferred_locale,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(current_setting('app.store_owner_user_id', true), ''), gen_random_uuid()::text)::uuid,
    tenant_row.id,
    nullif(current_setting('app.store_owner_email', true), '')::citext,
    nullif(current_setting('app.store_owner_phone', true), ''),
    current_setting('app.store_owner_password_hash', true),
    'active',
    coalesce(nullif(current_setting('app.store_owner_locale', true), ''), 'en'),
    now(),
    now()
  from tenant_row
  on conflict (email)
  do update set
    phone = excluded.phone,
    password_hash = excluded.password_hash,
    status = 'active',
    updated_at = now()
  returning id, tenant_id
),
store_owner_profile as (
  insert into identity.user_profiles (
    user_id,
    full_name,
    created_at,
    updated_at
  )
  select
    store_owner_user.id,
    current_setting('app.store_owner_name', true),
    now(),
    now()
  from store_owner_user
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    updated_at = now()
  returning user_id
),
store_row as (
  insert into store.stores (
    id,
    tenant_id,
    owner_user_id,
    store_code,
    name,
    name_bn,
    slug,
    phone,
    email,
    status,
    subscription_status,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(current_setting('app.store_id', true), ''), gen_random_uuid()::text)::uuid,
    store_owner_user.tenant_id,
    store_owner_user.id,
    current_setting('app.store_code', true),
    current_setting('app.store_name', true),
    nullif(current_setting('app.store_name_bn', true), ''),
    current_setting('app.store_slug', true),
    current_setting('app.store_phone', true),
    nullif(current_setting('app.store_email', true), '')::citext,
    'active',
    'active',
    now(),
    now()
  from store_owner_user
  on conflict (slug)
  do update set
    name = excluded.name,
    name_bn = excluded.name_bn,
    phone = excluded.phone,
    email = excluded.email,
    owner_user_id = excluded.owner_user_id,
    updated_at = now()
  returning id, tenant_id, owner_user_id
),
store_settings_row as (
  insert into store.store_settings (
    store_id,
    timezone,
    currency_code,
    locale,
    allow_negative_stock,
    created_at,
    updated_at
  )
  select
    store_row.id,
    coalesce(nullif(current_setting('app.store_timezone', true), ''), 'Asia/Dhaka'),
    'BDT',
    coalesce(nullif(current_setting('app.store_locale', true), ''), 'en'),
    false,
    now(),
    now()
  from store_row
  on conflict (store_id)
  do update set
    timezone = excluded.timezone,
    locale = excluded.locale,
    updated_at = now()
  returning store_id
),
default_location_row as (
  insert into inventory.locations (
    id,
    tenant_id,
    store_id,
    code,
    name,
    location_type,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    store_row.tenant_id,
    store_row.id,
    'MAIN',
    'Main Stock',
    'storefront',
    'active',
    now(),
    now()
  from store_row
  on conflict (store_id, code)
  do update set
    name = excluded.name,
    location_type = excluded.location_type,
    status = excluded.status,
    updated_at = now()
  returning id, store_id
),
default_register_row as (
  insert into sales.registers (
    id,
    tenant_id,
    store_id,
    code,
    name,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    store_row.tenant_id,
    store_row.id,
    'REG-01',
    'Main POS Register',
    'active',
    now(),
    now()
  from store_row
  on conflict (store_id, code)
  do update set
    name = excluded.name,
    status = excluded.status,
    updated_at = now()
  returning id, store_id
),
default_courier_rows as (
  insert into shipping.courier_providers (
    id,
    tenant_id,
    code,
    name,
    status,
    config_json,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    tenant_row.id,
    courier.code,
    courier.name,
    'active',
    '{}'::jsonb,
    now(),
    now()
  from tenant_row
  cross join (
    values
      ('pathao', 'Pathao Courier'),
      ('steadfast', 'Steadfast'),
      ('redx', 'REDX')
  ) as courier(code, name)
  on conflict (tenant_id, code)
  do update set
    name = excluded.name,
    status = excluded.status,
    updated_at = now()
  returning id
),
default_plan_rows as (
  insert into billing.plans (
    id,
    tenant_id,
    code,
    name,
    price_amount,
    billing_cycle,
    features_json,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    tenant_row.id,
    plan.code,
    plan.name,
    plan.price_amount,
    'monthly',
    plan.features_json,
    'active',
    now(),
    now()
  from tenant_row
  cross join (
    values
      (
        'basic',
        'Basic',
        0::numeric(14,2),
        '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings"]'::jsonb
      ),
      (
        'standard',
        'Standard',
        0::numeric(14,2),
        '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings","daily_expenses","hr_payroll"]'::jsonb
      ),
      (
        'pro',
        'Pro',
        0::numeric(14,2),
        '["stock","pos","shipping","report_analytics","billing","own_payment_gateway","dispute","support_chat","settings","daily_expenses","hr_payroll","banking","full_accounting"]'::jsonb
      )
  ) as plan(code, name, price_amount, features_json)
  on conflict (tenant_id, code)
  do update set
    name = excluded.name,
    price_amount = excluded.price_amount,
    billing_cycle = excluded.billing_cycle,
    features_json = excluded.features_json,
    status = excluded.status,
    updated_at = now()
  returning id
),
store_owner_membership as (
  insert into access.store_memberships (
    id,
    tenant_id,
    store_id,
    user_id,
    role_id,
    status,
    joined_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    store_row.tenant_id,
    store_row.id,
    store_row.owner_user_id,
    roles.id,
    'active',
    now(),
    now(),
    now()
  from store_row
  join access.roles roles on roles.code = 'store_owner'
  on conflict do nothing
  returning user_id
)
select
  tenant_row.id as tenant_id,
  (select id from platform_owner_user) as platform_owner_user_id,
  (select id from platform_admin_user) as platform_admin_user_id,
  (select id from store_owner_user) as store_owner_user_id,
  (select id from store_row) as store_id,
  (select id from default_location_row limit 1) as default_location_id,
  (select id from default_register_row limit 1) as default_register_id
from tenant_row;

commit;
