begin;

create table if not exists shipping.courier_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  code varchar(50) not null,
  name varchar(150) not null,
  status text not null default 'active',
  config_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courier_providers_status_check check (status in ('active', 'inactive')),
  constraint courier_providers_code_unique unique (tenant_id, code)
);

create table if not exists shipping.shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sale_id uuid references sales.sales(id) on delete set null,
  courier_provider_id uuid references shipping.courier_providers(id) on delete set null,
  shipment_no varchar(50) not null,
  customer_name varchar(200) not null,
  customer_phone varchar(30) not null,
  delivery_address text not null,
  district varchar(100),
  area varchar(100),
  delivery_fee numeric(14,2) not null default 0,
  tracking_no varchar(100),
  status text not null default 'pending',
  created_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_status_check check (status in ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')),
  constraint shipments_number_unique unique (store_id, shipment_no),
  constraint shipments_delivery_fee_check check (delivery_fee >= 0)
);

create index if not exists shipments_store_status_idx
  on shipping.shipments (store_id, status, created_at desc);

create table if not exists shipping.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipping.shipments(id) on delete cascade,
  event_type text not null,
  event_payload jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists shipment_events_shipment_idx
  on shipping.shipment_events (shipment_id, created_at desc);

create table if not exists billing.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  code varchar(50) not null,
  name varchar(100) not null,
  price_amount numeric(14,2) not null,
  billing_cycle text not null default 'monthly',
  features_json jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_plans_code_unique unique (tenant_id, code),
  constraint billing_plans_cycle_check check (billing_cycle in ('monthly', 'yearly')),
  constraint billing_plans_status_check check (status in ('active', 'inactive')),
  constraint billing_plans_price_check check (price_amount >= 0)
);

create table if not exists billing.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  plan_id uuid not null references billing.plans(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz,
  renewal_at timestamptz,
  status text not null default 'active',
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  constraint subscriptions_range_check check (end_at is null or end_at >= start_at)
);

create index if not exists subscriptions_store_status_idx
  on billing.subscriptions (store_id, status, renewal_at);

create table if not exists billing.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  subscription_id uuid references billing.subscriptions(id) on delete set null,
  invoice_no varchar(50) not null,
  invoice_type text not null,
  subtotal_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null,
  status text not null default 'draft',
  due_at timestamptz,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_no_unique unique (tenant_id, invoice_no),
  constraint invoices_type_check check (invoice_type in ('subscription', 'adjustment', 'manual')),
  constraint invoices_status_check check (status in ('draft', 'issued', 'paid', 'overdue', 'void')),
  constraint invoices_amounts_check check (
    subtotal_amount >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    total_amount >= 0
  )
);

create index if not exists invoices_store_status_idx
  on billing.invoices (store_id, status, created_at desc);

create table if not exists billing.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references billing.invoices(id) on delete cascade,
  payment_method text not null,
  gateway_provider text,
  amount numeric(14,2) not null,
  reference_no varchar(100),
  status text not null default 'paid',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoice_payments_status_check check (status in ('pending', 'paid', 'failed', 'refunded')),
  constraint invoice_payments_amount_check check (amount >= 0)
);

create table if not exists support.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid references store.stores(id) on delete set null,
  ticket_no varchar(50) not null,
  opened_by uuid not null references identity.users(id) on delete restrict,
  assigned_to uuid references identity.users(id) on delete set null,
  ticket_type text not null,
  subject varchar(250) not null,
  status text not null default 'open',
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_no_unique unique (tenant_id, ticket_no),
  constraint tickets_type_check check (ticket_type in ('support', 'dispute', 'billing', 'technical')),
  constraint tickets_status_check check (status in ('open', 'in_progress', 'resolved', 'closed')),
  constraint tickets_priority_check check (priority in ('low', 'medium', 'high', 'urgent'))
);

create index if not exists tickets_store_status_idx
  on support.tickets (store_id, status, created_at desc);

create table if not exists support.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support.tickets(id) on delete cascade,
  sender_user_id uuid not null references identity.users(id) on delete restrict,
  message_body text not null,
  attachment_path text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx
  on support.ticket_messages (ticket_id, created_at asc);

create table if not exists comms.notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  code varchar(100) not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_unique unique (tenant_id, code),
  constraint notification_templates_channel_check check (channel in ('in_app', 'email', 'sms'))
);

create table if not exists comms.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  recipient_user_id uuid not null references identity.users(id) on delete cascade,
  channel text not null,
  template_code varchar(100),
  title varchar(200),
  body text not null,
  status text not null default 'queued',
  reference_type text,
  reference_id uuid,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_channel_check check (channel in ('in_app', 'email', 'sms')),
  constraint notifications_status_check check (status in ('queued', 'sent', 'failed', 'read'))
);

create index if not exists notifications_recipient_idx
  on comms.notifications (recipient_user_id, status, created_at desc);

create table if not exists comms.broadcasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  created_by uuid not null references identity.users(id) on delete restrict,
  audience_type text not null,
  channel text not null,
  title varchar(200),
  body text not null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcasts_audience_type_check check (audience_type in ('all_stores', 'selected_stores', 'admins')),
  constraint broadcasts_channel_check check (channel in ('in_app', 'email', 'sms')),
  constraint broadcasts_status_check check (status in ('draft', 'scheduled', 'sent', 'cancelled'))
);

create table if not exists reporting.daily_store_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  business_date date not null,
  total_sales_amount numeric(14,2) not null default 0,
  total_orders_count integer not null default 0,
  total_items_qty numeric(14,3) not null default 0,
  total_discount_amount numeric(14,2) not null default 0,
  total_returns_amount numeric(14,2) not null default 0,
  generated_at timestamptz not null default now(),
  constraint daily_store_sales_unique unique (store_id, business_date)
);

create table if not exists reporting.daily_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  location_id uuid not null references inventory.locations(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  snapshot_date date not null,
  on_hand_qty numeric(14,3) not null default 0,
  available_qty numeric(14,3) not null default 0,
  generated_at timestamptz not null default now(),
  constraint daily_inventory_snapshots_unique unique (location_id, sku_id, snapshot_date)
);

create table if not exists reporting.export_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  requested_by uuid not null references identity.users(id) on delete restrict,
  export_type text not null,
  filter_json jsonb not null default '{}'::jsonb,
  file_path text,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint export_jobs_type_check check (export_type in ('sales', 'inventory', 'billing', 'support')),
  constraint export_jobs_status_check check (status in ('queued', 'processing', 'completed', 'failed'))
);

create table if not exists audit.logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  actor_user_id uuid references identity.users(id) on delete set null,
  actor_type text not null,
  store_id uuid references store.stores(id) on delete set null,
  action_code varchar(150) not null,
  resource_type varchar(100) not null,
  resource_id uuid,
  before_json jsonb,
  after_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_type_check check (actor_type in ('user', 'system', 'job'))
);

create index if not exists audit_logs_tenant_created_idx
  on audit.logs (tenant_id, created_at desc);

create index if not exists audit_logs_resource_idx
  on audit.logs (resource_type, resource_id);

create table if not exists integration.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  provider_code varchar(50) not null,
  display_name varchar(100) not null,
  credentials_ref text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateways_status_check check (status in ('active', 'inactive')),
  constraint payment_gateways_unique unique (store_id, provider_code)
);

create table if not exists integration.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  provider_type text not null,
  provider_code varchar(50) not null,
  external_event_id varchar(150),
  payload_json jsonb not null,
  processing_status text not null default 'pending',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webhook_events_provider_type_check check (provider_type in ('payment', 'courier')),
  constraint webhook_events_processing_status_check check (processing_status in ('pending', 'processed', 'failed', 'ignored'))
);

create index if not exists webhook_events_provider_idx
  on integration.webhook_events (provider_type, provider_code, created_at desc);

create table if not exists integration.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  aggregate_type varchar(100) not null,
  aggregate_id uuid not null,
  event_type varchar(150) not null,
  event_payload jsonb not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outbox_events_status_check check (status in ('pending', 'published', 'failed'))
);

create index if not exists outbox_events_status_available_idx
  on integration.outbox_events (status, available_at, created_at);

insert into billing.plans (tenant_id, code, name, price_amount, billing_cycle, features_json, status)
select
  t.id,
  p.code,
  p.name,
  p.price_amount,
  p.billing_cycle,
  p.features_json,
  'active'
from platform.tenants t
cross join (
  values
    (
      'basic',
      'Basic',
      0.00::numeric(14,2),
      'monthly',
      '["stock","pos","shipping","reports","billing","own_payment_gateway","dispute","internal_support_chat","settings"]'::jsonb
    ),
    (
      'standard',
      'Standard',
      0.00::numeric(14,2),
      'monthly',
      '["stock","pos","shipping","reports","billing","own_payment_gateway","dispute","internal_support_chat","settings","daily_expenses","hr","payroll"]'::jsonb
    ),
    (
      'pro',
      'Pro',
      0.00::numeric(14,2),
      'monthly',
      '["stock","pos","shipping","reports","billing","own_payment_gateway","dispute","internal_support_chat","settings","daily_expenses","hr","payroll","banking","full_accounting","income_tracking","liability_tracking","loan_tracking","asset_tracking","expanded_financial_reports"]'::jsonb
    )
) as p(code, name, price_amount, billing_cycle, features_json)
on conflict (tenant_id, code) do nothing;

select platform.touch_updated_at('shipping', 'courier_providers');
select platform.touch_updated_at('shipping', 'shipments');
select platform.touch_updated_at('billing', 'plans');
select platform.touch_updated_at('billing', 'subscriptions');
select platform.touch_updated_at('billing', 'invoices');
select platform.touch_updated_at('support', 'tickets');
select platform.touch_updated_at('comms', 'notification_templates');
select platform.touch_updated_at('comms', 'notifications');
select platform.touch_updated_at('comms', 'broadcasts');
select platform.touch_updated_at('integration', 'payment_gateways');

commit;
