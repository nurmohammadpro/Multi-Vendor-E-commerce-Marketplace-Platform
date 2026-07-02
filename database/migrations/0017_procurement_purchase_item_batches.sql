begin;

alter table procurement.purchase_items
  add column if not exists batch_no varchar(120),
  add column if not exists expiry_date date;

create index if not exists procurement_purchase_items_batch_idx
  on procurement.purchase_items (batch_no);

commit;
