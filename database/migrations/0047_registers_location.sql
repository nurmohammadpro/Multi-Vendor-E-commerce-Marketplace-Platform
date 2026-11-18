begin;

-- Registers are tills — a till physically lives at an outlet.
alter table sales.registers
  add column if not exists location_id uuid references inventory.locations(id) on delete set null;

-- Owners can set which outlet the POS terminal defaults to on open.
alter table store.store_settings
  add column if not exists default_location_id uuid references inventory.locations(id) on delete set null;

commit;
