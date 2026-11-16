begin;

-- The purchase_items_set_updated_at trigger expects this column; without it
-- every UPDATE (e.g. receiving a company-order delivery) fails with
-- 'record "new" has no field "updated_at"'.
alter table procurement.purchase_items
  add column if not exists updated_at timestamptz not null default now();

commit;
