begin;

alter table hr.employees
  add column if not exists employee_number varchar(50),
  add column if not exists address_text text,
  add column if not exists employment_type text,
  add column if not exists designation varchar(100),
  add column if not exists department varchar(100),
  add column if not exists emergency_contact_name varchar(200),
  add column if not exists emergency_contact_phone varchar(30),
  add column if not exists salary_payment_mode text,
  add column if not exists bank_name varchar(150),
  add column if not exists bank_account_name varchar(200),
  add column if not exists bank_account_number varchar(80),
  add column if not exists mobile_banking_type varchar(50),
  add column if not exists mobile_banking_number varchar(30),
  add column if not exists education_summary text,
  add column if not exists experience_summary text,
  add column if not exists training_summary text,
  add column if not exists skill_tags jsonb not null default '[]'::jsonb,
  add column if not exists allowance_breakdown jsonb not null default '{}'::jsonb;

update hr.employees
set
  employee_number = coalesce(employee_number, concat('EMP-', upper(left(replace(id::text, '-', ''), 8)))),
  employment_type = coalesce(employment_type, 'permanent')
where employee_number is null
   or employment_type is null;

create unique index if not exists employees_employee_number_unique_idx
  on hr.employees (store_id, employee_number)
  where employee_number is not null;

alter table hr.payroll_runs
  add column if not exists payroll_no varchar(50),
  add column if not exists total_employees integer not null default 0,
  add column if not exists total_bonus_amount numeric(14,2) not null default 0,
  add column if not exists total_deduction_amount numeric(14,2) not null default 0,
  add column if not exists paid_at timestamptz;

update hr.payroll_runs
set payroll_no = concat(
  'PR-',
  to_char(coalesce(period_start, created_at::date), 'YYYYMM'),
  '-',
  upper(left(replace(id::text, '-', ''), 4))
)
where payroll_no is null;

create unique index if not exists payroll_runs_store_number_unique_idx
  on hr.payroll_runs (store_id, payroll_no)
  where payroll_no is not null;

alter table store.store_settings
  add column if not exists hardware_profile jsonb not null default '{}'::jsonb;

commit;
