-- Phase 2: Warranty Management System
-- Adds: Warranty Policies, SKU Warranty Mappings, Sale Warranties, Warranty Claims

begin;

-- ============================================================================
-- 1. WARRANTY POLICIES (Multi-tier warranty definitions)
-- ============================================================================
create table if not exists catalog.warranty_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  code varchar(50) not null,
  name varchar(150) not null,
  warranty_type text not null,
  duration_months integer not null,
  coverage_scope text not null,
  applies_to_category_ids uuid[] default '{}',
  cost_price numeric(14,2),
  cost_to_store numeric(14,2),
  is_default boolean not null default false,
  terms_text text,
  exclusions_text text,
  claim_process_text text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warranty_policies_status_check check (status in ('active', 'inactive')),
  constraint warranty_policies_type_check check (warranty_type in ('manufacturer_standard', 'extended', 'international', 'accidental_damage', 'premium')),
  constraint warranty_policies_coverage_check check (coverage_scope in ('hardware_defect', 'manufacturing_defect', 'accidental_damage', 'includes_service')),
  constraint warranty_policies_duration_check check (duration_months > 0),
  constraint warranty_policies_cost_check check (
    (cost_price is null or cost_price >= 0) and
    (cost_to_store is null or cost_to_store >= 0)
  ),
  constraint warranty_policies_code_unique unique (store_id, code)
);

create index if not exists warranty_policies_store_status_idx
  on catalog.warranty_policies (store_id, status);

create index if not exists warranty_policies_is_default_idx
  on catalog.warranty_policies (store_id, is_default) where is_default = true;

-- ============================================================================
-- 2. SKU WARRANTY MAPPINGS (Link warranty policies to SKUs)
-- ============================================================================
create table if not exists catalog.sku_warranties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sku_id uuid not null references catalog.skus(id) on delete cascade,
  warranty_policy_id uuid not null references catalog.warranty_policies(id) on delete cascade,
  is_included_by_default boolean not null default false,
  is_optional_addon boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint sku_warranties_unique unique (sku_id, warranty_policy_id)
);

create index if not exists sku_warranties_sku_idx
  on catalog.sku_warranties (sku_id, sort_order);

-- ============================================================================
-- 3. SALE WARRANTIES (Warranty linked to device serial at point of sale)
-- ============================================================================
create table if not exists sales.sale_warranties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sale_id uuid not null references sales.sales(id) on delete cascade,
  sale_item_id uuid not null references sales.sale_items(id) on delete cascade,
  device_serial_id uuid not null references inventory.device_serials(id) on delete restrict,
  warranty_policy_id uuid not null references catalog.warranty_policies(id) on delete restrict,
  warranty_reference_number varchar(100) not null,
  warranty_start_date date not null,
  warranty_end_date date not null,
  warranty_purchased_price numeric(14,2),
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_warranties_status_check check (status in ('active', 'claimed', 'expired', 'voided', 'transferred')),
  constraint sale_warranties_date_check check (warranty_end_date > warranty_start_date),
  constraint sale_warranties_unique unique (device_serial_id, warranty_policy_id, sale_id),
  constraint sale_warranties_price_check check (warranty_purchased_price is null or warranty_purchased_price >= 0)
);

create index if not exists sale_warranties_device_serial_idx
  on sales.sale_warranties (device_serial_id, status);

create index if not exists sale_warranties_expiry_idx
  on sales.sale_warranties (warranty_end_date) where status = 'active';

create index if not exists sale_warranties_sale_idx
  on sales.sale_warranties (sale_id);

-- ============================================================================
-- 4. WARRANTY CLAIMS (Customer warranty claims and approval workflow)
-- ============================================================================
create table if not exists sales.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  store_id uuid not null references store.stores(id) on delete cascade,
  sale_warranty_id uuid not null references sales.sale_warranties(id) on delete cascade,
  device_serial_id uuid not null references inventory.device_serials(id) on delete restrict,
  claim_type text not null,
  issue_description text not null,
  issue_date date not null,
  claim_submitted_date date not null,
  claim_reference_number varchar(100) not null unique,
  status text not null default 'submitted',
  rejection_reason text,
  approval_notes text,
  approved_by_user_id uuid references identity.users(id) on delete set null,
  approved_at timestamptz,
  resolution_type text,
  replacement_serial_id uuid references inventory.device_serials(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warranty_claims_status_check check (status in ('submitted', 'under_review', 'approved', 'rejected', 'completed', 'cancelled')),
  constraint warranty_claims_type_check check (claim_type in ('device_not_working', 'partial_defect', 'replacement_unit', 'repair', 'refund')),
  constraint warranty_claims_resolution_check check (
    resolution_type is null or resolution_type in ('device_replacement', 'repair_return', 'refund', 'store_credit')
  )
);

create index if not exists warranty_claims_device_serial_idx
  on sales.warranty_claims (device_serial_id);

create index if not exists warranty_claims_status_idx
  on sales.warranty_claims (store_id, status);

create index if not exists warranty_claims_submitted_date_idx
  on sales.warranty_claims (claim_submitted_date desc);

create index if not exists warranty_claims_sale_warranty_idx
  on sales.warranty_claims (sale_warranty_id);

-- ============================================================================
-- 5. TRIGGER: Auto-link device_serial to sale_warranties
-- ============================================================================

-- Create function to sync device_serial warranty_linked flag
create or replace function sales.sync_device_warranty_link()
returns trigger as $$
begin
  -- When a warranty is created, mark device_serial.warranty_linked = true
  if tg_op = 'INSERT' then
    update inventory.device_serials
    set warranty_linked = true, updated_at = now()
    where id = new.device_serial_id;
  end if;
  
  -- When a warranty is voided, check if there are other active warranties
  if tg_op = 'UPDATE' and new.status = 'voided' and old.status != 'voided' then
    if not exists (
      select 1 from sales.sale_warranties
      where device_serial_id = new.device_serial_id
      and status in ('active', 'claimed')
      and id != new.id
    ) then
      update inventory.device_serials
      set warranty_linked = false, updated_at = now()
      where id = new.device_serial_id;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

create trigger warranty_link_trigger
  after insert or update on sales.sale_warranties
  for each row
  execute function sales.sync_device_warranty_link();

-- ============================================================================
-- 6. AUDIT AND TOUCH UPDATES
-- ============================================================================

select platform.touch_updated_at('catalog', 'warranty_policies');
select platform.touch_updated_at('catalog', 'sku_warranties');
select platform.touch_updated_at('sales', 'sale_warranties');
select platform.touch_updated_at('sales', 'warranty_claims');

commit;
