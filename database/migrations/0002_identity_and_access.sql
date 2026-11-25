begin;

create table if not exists identity.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  phone varchar(30),
  email citext,
  password_hash text,
  status text not null default 'invited',
  preferred_locale varchar(10) not null default 'en',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'invited', 'suspended', 'disabled')),
  constraint users_preferred_locale_check check (preferred_locale in ('en', 'bn')),
  constraint users_phone_or_email_check check (phone is not null or email is not null)
);

create unique index if not exists users_email_unique_idx
  on identity.users (email)
  where email is not null;

create unique index if not exists users_phone_unique_idx
  on identity.users (phone)
  where phone is not null;

create index if not exists users_tenant_status_idx
  on identity.users (tenant_id, status);

create table if not exists identity.user_profiles (
  user_id uuid primary key references identity.users(id) on delete cascade,
  full_name varchar(200) not null,
  avatar_url text,
  gender text,
  date_of_birth date,
  emergency_contact varchar(50),
  address_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_gender_check check (gender is null or gender in ('male', 'female', 'other'))
);

create table if not exists identity.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  refresh_token_hash text not null,
  device_label varchar(120),
  ip_address inet,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_idx
  on identity.user_sessions (user_id, created_at desc);

create table if not exists identity.user_mfa_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  method_type text not null,
  secret_ref text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_mfa_methods_type_check check (method_type in ('totp', 'sms', 'email'))
);

create index if not exists user_mfa_methods_user_idx
  on identity.user_mfa_methods (user_id);

create table if not exists access.roles (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  code varchar(100) not null unique,
  name varchar(150) not null,
  description text,
  created_at timestamptz not null default now(),
  constraint roles_scope_type_check check (scope_type in ('store', 'platform', 'admin_bundle'))
);

create table if not exists access.permissions (
  id uuid primary key default gen_random_uuid(),
  code varchar(150) not null unique,
  resource varchar(100) not null,
  action varchar(100) not null,
  description text
);

create table if not exists access.role_permissions (
  role_id uuid not null references access.roles(id) on delete cascade,
  permission_id uuid not null references access.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists access.store_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null,
  user_id uuid not null references identity.users(id) on delete restrict,
  role_id uuid not null references access.roles(id) on delete restrict,
  status text not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_memberships_status_check check (status in ('active', 'invited', 'suspended', 'removed'))
);

create unique index if not exists store_memberships_active_unique_idx
  on access.store_memberships (store_id, user_id)
  where status in ('active', 'invited', 'suspended');

create index if not exists store_memberships_store_idx
  on access.store_memberships (store_id, status);

create index if not exists store_memberships_user_idx
  on access.store_memberships (user_id, status);

create table if not exists access.admin_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  user_id uuid not null references identity.users(id) on delete restrict,
  base_role_id uuid not null references access.roles(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_memberships_status_check check (status in ('active', 'suspended', 'removed'))
);

create unique index if not exists admin_memberships_active_unique_idx
  on access.admin_memberships (tenant_id, user_id)
  where status in ('active', 'suspended');

create table if not exists access.admin_bundle_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_membership_id uuid not null references access.admin_memberships(id) on delete cascade,
  role_id uuid not null references access.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_bundle_assignments_unique unique (admin_membership_id, role_id)
);

insert into access.roles (scope_type, code, name, description)
values
  ('store', 'store_owner', 'Store Owner', 'Full store access'),
  ('store', 'store_manager', 'Store Manager', 'Broad store access with approval limits'),
  ('store', 'store_salesman', 'Store Salesman', 'Can sell, view stock, and view reports'),
  ('platform', 'platform_owner', 'Platform Owner', 'Full platform access'),
  ('platform', 'regular_admin', 'Regular Admin', 'Operational admin base role'),
  ('admin_bundle', 'operations_admin', 'Operations Admin', 'Store approvals and operational workflows'),
  ('admin_bundle', 'finance_admin', 'Finance Admin', 'Billing, subscriptions, and finance operations'),
  ('admin_bundle', 'support_admin', 'Support Admin', 'Support and dispute handling'),
  ('admin_bundle', 'marketing_admin', 'Marketing Admin', 'Notifications and platform communications')
on conflict (code) do nothing;

insert into access.permissions (code, resource, action, description)
values
  ('inventory.adjust.direct', 'inventory', 'adjust_direct', 'Direct inventory adjustment'),
  ('inventory.adjust.request', 'inventory', 'adjust_request', 'Request inventory adjustment'),
  ('inventory.adjust.approve', 'inventory', 'adjust_approve', 'Approve inventory adjustment'),
  ('inventory.view', 'inventory', 'view', 'View inventory and stock'),
  ('catalog.manage', 'catalog', 'manage', 'Create and edit products and SKUs'),
  ('sales.pos.create', 'sales', 'create_pos', 'Create POS sales'),
  ('sales.report.view', 'sales', 'view_reports', 'View sales reports'),
  ('sales.returns.manage', 'sales', 'manage_returns', 'Process returns and refunds'),
  ('store.settings.manage', 'store', 'manage_settings', 'Manage store settings'),
  ('store.staff.manage', 'store', 'manage_staff', 'Manage store staff'),
  ('billing.subscription.manage', 'billing', 'manage_subscription', 'Manage store subscriptions'),
  ('payment.gateway.manage', 'payments', 'manage_gateway', 'Manage payment gateway settings'),
  ('platform.store.review', 'platform', 'review_store', 'Review and suspend stores'),
  ('platform.payment.monitor', 'platform', 'monitor_payments', 'Monitor payments'),
  ('platform.support.manage', 'platform', 'manage_support', 'Manage support operations'),
  ('platform.notification.manage', 'platform', 'manage_notifications', 'Manage notifications'),
  ('platform.broadcast.send', 'platform', 'send_broadcast', 'Send broadcasts'),
  ('platform.settings.manage', 'platform', 'manage_settings', 'Manage platform settings'),
  ('platform.admin.manage', 'platform', 'manage_admins', 'Manage platform admins'),
  ('platform.report.view', 'platform', 'view_reports', 'View platform reports')
on conflict (code) do nothing;

with role_map as (
  select code, id from access.roles
),
permission_map as (
  select code, id from access.permissions
),
assignments(role_code, permission_code) as (
  values
    ('store_owner', 'inventory.adjust.request'),
    ('store_owner', 'inventory.adjust.approve'),
    ('store_owner', 'inventory.view'),
    ('store_owner', 'catalog.manage'),
    ('store_owner', 'sales.pos.create'),
    ('store_owner', 'sales.report.view'),
    ('store_owner', 'sales.returns.manage'),
    ('store_owner', 'store.settings.manage'),
    ('store_owner', 'store.staff.manage'),
    ('store_owner', 'billing.subscription.manage'),
    ('store_owner', 'payment.gateway.manage'),
    ('store_manager', 'inventory.adjust.request'),
    ('store_manager', 'inventory.view'),
    ('store_manager', 'catalog.manage'),
    ('store_manager', 'sales.pos.create'),
    ('store_manager', 'sales.report.view'),
    ('store_manager', 'sales.returns.manage'),
    ('store_manager', 'store.staff.manage'),
    ('store_salesman', 'inventory.view'),
    ('store_salesman', 'sales.pos.create'),
    ('store_salesman', 'sales.report.view'),
    ('store_salesman', 'sales.returns.manage'),
    ('platform_owner', 'platform.store.review'),
    ('platform_owner', 'platform.payment.monitor'),
    ('platform_owner', 'platform.support.manage'),
    ('platform_owner', 'platform.notification.manage'),
    ('platform_owner', 'platform.broadcast.send'),
    ('platform_owner', 'platform.settings.manage'),
    ('platform_owner', 'platform.admin.manage'),
    ('platform_owner', 'platform.report.view'),
    ('regular_admin', 'platform.store.review'),
    ('regular_admin', 'platform.payment.monitor'),
    ('regular_admin', 'platform.support.manage'),
    ('regular_admin', 'platform.notification.manage'),
    ('regular_admin', 'platform.report.view'),
    ('operations_admin', 'platform.store.review'),
    ('finance_admin', 'platform.payment.monitor'),
    ('support_admin', 'platform.support.manage'),
    ('support_admin', 'platform.notification.manage'),
    ('marketing_admin', 'platform.notification.manage'),
    ('marketing_admin', 'platform.broadcast.send')
)
insert into access.role_permissions (role_id, permission_id)
select r.id, p.id
from assignments a
join role_map r on r.code = a.role_code
join permission_map p on p.code = a.permission_code
on conflict do nothing;

select platform.touch_updated_at('identity', 'users');
select platform.touch_updated_at('identity', 'user_profiles');
select platform.touch_updated_at('access', 'store_memberships');
select platform.touch_updated_at('access', 'admin_memberships');

commit;
