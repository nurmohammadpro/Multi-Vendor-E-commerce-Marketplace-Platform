-- Enhanced Purchase Status Workflow Migration
-- Supports: draft → confirmed → partially_received → fully_received → paid

begin;

-- Update the purchase status check constraint to support new workflow
alter table procurement.purchases drop constraint if exists procurement_purchases_status_check;

alter table procurement.purchases add constraint procurement_purchases_status_check check (
  status in (
    'draft',
    'confirmed',
    'partially_received',
    'fully_received',
    'cancelled',
    'received'
  )
);

-- Add column to track received quantity vs total quantity for status management
alter table procurement.purchases add column if not exists received_items_qty integer default 0;
alter table procurement.purchases add column if not exists total_items_qty integer default 0;

-- Create index for status-based queries
create index if not exists procurement_purchases_status_idx
  on procurement.purchases (store_id, status, created_at desc);

select platform.touch_updated_at('procurement', 'purchases');

comment on column procurement.purchases.status is
  'Purchase status: draft → confirmed → partially_received → fully_received → cancelled. Legacy "received" maps to fully_received.';

comment on column procurement.purchases.received_items_qty is
  'Count of items actually received (for tracking partial receives)';

comment on column procurement.purchases.total_items_qty is
  'Total count of items in the purchase';

commit;
