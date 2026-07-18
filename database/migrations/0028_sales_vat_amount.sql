-- Add vat_amount to sales for receipt VAT/Tax split
alter table sales.sales
  add column if not exists vat_amount numeric(14,2) not null default 0;
