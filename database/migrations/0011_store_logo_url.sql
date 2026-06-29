begin;

alter table store.stores
  add column if not exists logo_url text,
  add column if not exists address_text text;

commit;
