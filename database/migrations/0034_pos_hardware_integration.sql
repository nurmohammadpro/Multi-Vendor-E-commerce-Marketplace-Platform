-- Phase 4: POS Hardware Integration Layer
-- Adds: Hardware Device Registry, Print Queue, USB HID Device Configuration

begin;

-- ============================================================================
-- 1. POS HARDWARE DEVICES (USB Device Configuration Registry)
-- ============================================================================
create table if not exists pos.hardware_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  device_type text not null,
  vendor_id varchar(50),
  product_id varchar(50),
  device_name varchar(255) not null,
  protocol text not null,
  interface_type text not null,
  configuration_json jsonb not null default '{}',
  status text not null default 'active',
  last_status_check timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hardware_devices_type_check check (device_type in ('receipt_printer', 'label_printer', 'barcode_scanner', 'cash_drawer')),
  constraint hardware_devices_protocol_check check (protocol in ('TSPL', 'ESC_POS', 'HID', 'ECS_POS')),
  constraint hardware_devices_interface_check check (interface_type in ('USB', 'SERIAL', 'NETWORK')),
  constraint hardware_devices_status_check check (status in ('active', 'inactive', 'error', 'disconnected'))
);

create index if not exists hardware_devices_store_type_idx
  on pos.hardware_devices (store_id, device_type);

create index if not exists hardware_devices_status_idx
  on pos.hardware_devices (store_id, status);

create index if not exists hardware_devices_vendor_product_idx
  on pos.hardware_devices (vendor_id, product_id) where vendor_id is not null and product_id is not null;

-- ============================================================================
-- 2. PRINT QUEUE (Job Queue for Printers)
-- ============================================================================
create table if not exists pos.print_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  hardware_device_id uuid not null references pos.hardware_devices(id) on delete restrict,
  job_type text not null,
  reference_id varchar(100),
  content_json jsonb not null,
  tspl_command text,
  esc_pos_command text,
  status text not null default 'queued',
  error_message text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  created_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint print_jobs_type_check check (job_type in ('receipt', 'label', 'warranty_card', 'shipping_label')),
  constraint print_jobs_status_check check (status in ('queued', 'printing', 'completed', 'failed', 'cancelled')),
  constraint print_jobs_retry_check check (retry_count >= 0 and max_retries > 0)
);

create index if not exists print_jobs_status_idx
  on pos.print_jobs (store_id, status);

create index if not exists print_jobs_device_idx
  on pos.print_jobs (hardware_device_id, status);

create index if not exists print_jobs_created_idx
  on pos.print_jobs (created_at desc);

create index if not exists print_jobs_reference_idx
  on pos.print_jobs (reference_id) where reference_id is not null;

-- ============================================================================
-- 3. BARCODE SCANNER INPUT LOG (Real-time Scanner Events)
-- ============================================================================
create table if not exists pos.barcode_scans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  hardware_device_id uuid not null references pos.hardware_devices(id) on delete restrict,
  barcode_value varchar(500) not null,
  scan_type text,
  device_serial_id uuid references inventory.device_serials(id) on delete set null,
  scanned_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint barcode_scans_type_check check (scan_type in ('product_sku', 'device_serial', 'imei', 'batch_code', 'other'))
);

create index if not exists barcode_scans_device_idx
  on pos.barcode_scans (hardware_device_id, created_at desc);

create index if not exists barcode_scans_serial_idx
  on pos.barcode_scans (device_serial_id) where device_serial_id is not null;

create index if not exists barcode_scans_barcode_idx
  on pos.barcode_scans (barcode_value);

-- ============================================================================
-- 4. HARDWARE STATUS LOG (Device Health Monitoring)
-- ============================================================================
create table if not exists pos.hardware_status_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  hardware_device_id uuid not null references pos.hardware_devices(id) on delete cascade,
  status_type text not null,
  status_value text not null,
  message text,
  created_at timestamptz not null default now(),
  constraint hardware_status_log_type_check check (status_type in ('connected', 'disconnected', 'error', 'offline', 'online'))
);

create index if not exists hardware_status_log_device_idx
  on pos.hardware_status_log (hardware_device_id, created_at desc);

-- ============================================================================
-- 5. RECEIPT TEMPLATES (TSPL/ESC-POS Receipt Format Configuration)
-- ============================================================================
create table if not exists pos.receipt_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  name varchar(150) not null,
  template_type text not null,
  protocol text not null,
  content_template text not null,
  paper_width_mm integer,
  paper_height_mm integer,
  is_default boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_templates_type_check check (template_type in ('sale_receipt', 'warranty_card', 'return_receipt', 'refund_receipt')),
  constraint receipt_templates_protocol_check check (protocol in ('TSPL', 'ESC_POS')),
  constraint receipt_templates_status_check check (status in ('active', 'inactive'))
);

create index if not exists receipt_templates_store_idx
  on pos.receipt_templates (store_id, template_type);

-- ============================================================================
-- 6. LABEL TEMPLATES (Shipping & Serial Labels in TSPL Format)
-- ============================================================================
create table if not exists pos.label_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  name varchar(150) not null,
  label_type text not null,
  protocol text not null default 'TSPL',
  label_width_mm numeric(8,2) not null,
  label_height_mm numeric(8,2) not null,
  content_template text not null,
  is_default boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint label_templates_type_check check (label_type in ('shipping', 'serial_barcode', 'warranty', 'inventory_tag')),
  constraint label_templates_status_check check (status in ('active', 'inactive')),
  constraint label_templates_dimensions_check check (label_width_mm > 0 and label_height_mm > 0)
);

create index if not exists label_templates_store_type_idx
  on pos.label_templates (store_id, label_type);

-- ============================================================================
-- 7. AUDIT AND TOUCH UPDATES
-- ============================================================================

select platform.touch_updated_at('pos', 'hardware_devices');
select platform.touch_updated_at('pos', 'print_jobs');
select platform.touch_updated_at('pos', 'barcode_scans');
select platform.touch_updated_at('pos', 'hardware_status_log');
select platform.touch_updated_at('pos', 'receipt_templates');
select platform.touch_updated_at('pos', 'label_templates');

commit;
