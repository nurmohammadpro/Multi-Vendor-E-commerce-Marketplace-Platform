alter table sales.sales
  add column if not exists customer_shop_name varchar(200),
  add column if not exists customer_address text;

alter table sales.sales
  drop constraint if exists sales_payment_status_check;

alter table sales.sales
  add constraint sales_payment_status_check
  check (payment_status in ('pending', 'due', 'paid', 'partial', 'refunded'));
