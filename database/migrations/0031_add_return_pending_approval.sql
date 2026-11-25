-- Add 'pending_approval' status option to sale_returns status check
alter table sales.sale_returns
  drop constraint if exists sale_returns_status_check,
  add constraint sale_returns_status_check
    check (status in ('pending_approval', 'processed', 'rejected'));
