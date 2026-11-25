begin;

alter table sales.sales
  add column if not exists returned_amount numeric(14,2) not null default 0;

-- Also add missing columns that store-ops queries reference
alter table sales.sales
  add column if not exists paid_amount numeric(14,2) not null default 0,
  add column if not exists customer_shop_name varchar(200),
  add column if not exists customer_address text,
  add column if not exists invoice_no varchar(100),
  add column if not exists sale_date date;

-- Drop old constraint and re-add with 'refunded' as a valid status
alter table sales.sales drop constraint if exists sales_status_check;
alter table sales.sales add constraint sales_status_check check (
  status in ('completed', 'payment_pending', 'cancelled', 'refunded', 'returned_partially')
);

select platform.touch_updated_at('sales', 'sales');

commit;
