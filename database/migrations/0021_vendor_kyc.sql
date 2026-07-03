begin;

create table if not exists store.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  applicant_user_id uuid references identity.users(id) on delete set null,
  application_no varchar(50) not null,
  status text not null default 'draft',
  current_step text not null default 'business_info',
  business_name varchar(200),
  business_type text,
  trade_license_no varchar(100),
  trade_license_file_path text,
  contact_name varchar(200),
  contact_phone varchar(30),
  contact_email citext,
  business_address text,
  district varchar(100),
  bank_name varchar(150),
  account_holder_name varchar(200),
  account_number varchar(80),
  bank_branch varchar(150),
  routing_number varchar(20),
  tin_no varchar(50),
  vat_registration_no varchar(50),
  tax_certificate_file_path text,
  store_name varchar(200),
  store_slug varchar(100),
  store_description text,
  store_logo_file_path text,
  product_categories jsonb,
  terms_accepted boolean default false,
  terms_accepted_at timestamptz,
  reviewed_by uuid references identity.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_applications_no_unique unique (tenant_id, application_no),
  constraint vendor_applications_status_check check (status in ('draft','submitted','under_review','approved','rejected','kiv')),
  constraint vendor_applications_step_check check (current_step in ('business_info','contact_info','bank_details','tax_info','store_profile','agreement'))
);

create table if not exists store.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references store.vendor_applications(id) on delete cascade,
  document_type text not null,
  file_path text not null,
  is_verified boolean default false,
  verified_by uuid references identity.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vendor_documents_type_check check (document_type in ('trade_license','tax_certificate','national_id','bank_statement','other'))
);

create index if not exists vendor_applications_status_idx on store.vendor_applications (status, created_at desc);
create index if not exists vendor_applications_user_idx on store.vendor_applications (applicant_user_id);

select platform.touch_updated_at('store', 'vendor_applications');
select platform.touch_updated_at('store', 'vendor_documents');

commit;
