-- Add default discount support to catalog prices
-- Allows setting a fixed or percentage discount per price record
-- so products like medicine and spare parts can carry a regulated discount.

begin;

alter table catalog.prices
  add column discount_type varchar check (discount_type in ('fixed', 'percentage')),
  add column discount_value numeric(14,2) check (discount_value >= 0);

comment on column catalog.prices.discount_type is 'fixed = flat amount off, percentage = percent off sale_price';
comment on column catalog.prices.discount_value is 'The discount amount or percentage, depending on discount_type';

commit;
