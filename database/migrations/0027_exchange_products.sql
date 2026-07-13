begin;

-- Tag exchange / trade-in products so they can be filtered in POS
alter table catalog.products
  add column if not exists product_type text not null default 'standard';

alter table catalog.products
  add constraint products_product_type_check
  check (product_type in ('standard', 'exchange'));

-- Track exchange item and value on sales
alter table sales.sales
  add column if not exists exchange_sku_id uuid references catalog.skus(id) on delete set null,
  add column if not exists exchange_amount numeric(14,2);

commit;
