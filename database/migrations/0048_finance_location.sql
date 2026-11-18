begin;

-- Expenses are paid at a specific outlet; nullable so old rows stay
-- store-wide.
alter table finance.daily_expenses
  add column if not exists location_id uuid references inventory.locations(id) on delete set null;

-- Payroll for outlet staff: which outlet the payroll belongs to.
alter table hr.payroll_runs
  add column if not exists location_id uuid references inventory.locations(id) on delete set null;

commit;
