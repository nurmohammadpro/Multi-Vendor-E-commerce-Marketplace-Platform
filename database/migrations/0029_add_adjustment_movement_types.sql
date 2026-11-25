begin;

alter table inventory.ledger drop constraint if exists inventory_ledger_movement_type_check;

alter table inventory.ledger add constraint inventory_ledger_movement_type_check check (
  movement_type in ('initial', 'sale', 'return', 'manual_adjustment', 'approval_adjustment', 'damage', 'transfer', 'purchase_receive', 'adjustment_in', 'adjustment_out')
);

commit;
