begin;

alter table sales.sales drop constraint if exists sales_status_check;

alter table sales.sales add constraint sales_status_check check (
  status in ('completed', 'payment_pending', 'cancelled', 'refunded')
);

select platform.touch_updated_at('sales', 'sales');

commit;
