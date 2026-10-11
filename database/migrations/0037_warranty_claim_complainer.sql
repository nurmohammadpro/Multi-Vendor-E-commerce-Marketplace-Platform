-- Warranty claim complainer tracking (customer who reported the issue)
alter table sales.warranty_claims
  add column if not exists complainer_name text,
  add column if not exists complainer_phone text,
  add column if not exists complainer_relation text not null default 'customer';
