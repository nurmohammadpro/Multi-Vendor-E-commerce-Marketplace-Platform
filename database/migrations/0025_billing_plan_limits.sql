begin;

-- Add plan limit and pricing columns
alter table billing.plans
  add column if not exists max_users int not null default 1,
  add column if not exists max_locations int not null default 1,
  add column if not exists signup_fee numeric(14,2) not null default 0,
  add column if not exists is_custom boolean not null default false;

-- Update built-in plans with BDT pricing, limits, and feature sets
update billing.plans set
  price_amount = 1000.00,
  signup_fee = 500.00,
  max_users = 1,
  max_locations = 1,
  features_json = '["stock","pos","purchases","shipping","reports","billing","customers","support","settings"]'::jsonb
where code = 'basic';

update billing.plans set
  price_amount = 2000.00,
  signup_fee = 10000.00,
  max_users = 3,
  max_locations = 1,
  features_json = '["stock","pos","purchases","shipping","reports","billing","customers","support","settings","daily_expenses","staff"]'::jsonb
where code = 'standard';

update billing.plans set
  price_amount = 3000.00,
  signup_fee = 20000.00,
  max_users = 5,
  max_locations = 2,
  features_json = '["stock","pos","purchases","shipping","reports","billing","customers","support","settings","daily_expenses","staff","hr","payroll","banking"]'::jsonb
where code = 'pro';

commit;
