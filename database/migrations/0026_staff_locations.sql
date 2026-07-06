begin;

-- Add address, phone, email to inventory.locations
alter table inventory.locations
  add column if not exists address text,
  add column if not exists phone varchar(30),
  add column if not exists email citext;

-- Add location_id to access.store_memberships for staff-location assignment
alter table access.store_memberships
  add column if not exists location_id uuid references inventory.locations(id) on delete set null;

commit;
