begin;

-- Per-tenant print document selection: thermal POS receipt, A5 or A4 paper
alter table store.store_settings
  add column if not exists receipt_type text not null default 'pos';

do $$
begin
  -- Replace (or create) the check constraint safely on re-run
  alter table store.store_settings drop constraint if exists store_settings_receipt_type_check;
  alter table store.store_settings add constraint store_settings_receipt_type_check
    check (receipt_type in ('pos', 'a5', 'a4'));
exception
  when duplicate_object then null;
end $$;

commit;
