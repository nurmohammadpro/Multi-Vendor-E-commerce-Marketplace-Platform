begin;

alter table sales.sales
  add column if not exists client_request_id uuid;

create unique index if not exists sales_store_client_request_unique
  on sales.sales (store_id, client_request_id)
  where client_request_id is not null;

create index if not exists audit_logs_store_created_idx
  on audit.logs (store_id, created_at desc);

commit;
