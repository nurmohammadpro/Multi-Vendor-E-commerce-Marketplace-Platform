begin;

-- Dealership products are measured: bag, ton, kg, cft, suta, litre, box, sqft...
alter table catalog.products
  add column if not exists unit varchar(20) not null default 'pcs';

-- Snapshot the unit on sale/purchase lines so printed documents do not drift
-- when a product's unit is later edited.
alter table sales.sale_items
  add column if not exists unit varchar(20);
alter table procurement.purchase_items
  add column if not exists unit varchar(20);

-- Dealers run on daily expenses, banking, and payroll for labor —
-- wholesale stores get these features too.
update billing.plans set
  features_json = (
    features_json || '["expenses","banking","payroll","staff"]'::jsonb
  )
where code = 'wholesale'
  and not (features_json @> '["expenses"]'::jsonb);

-- Deposit-first company orders: a dealer places an order, deposits money to
-- the company, the company confirms and ships (possibly in parts), stock is
-- received through the existing flow.
update procurement.purchases
set status = 'received'
where status not in ('draft', 'confirmed', 'shipped', 'partially_received', 'fully_received', 'cancelled');

alter table procurement.purchases
  add column if not exists confirmed_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists truck_no varchar(60),
  add column if not exists challan_no varchar(100);

alter table procurement.purchases drop constraint if exists procurement_purchases_status_check;
alter table procurement.purchases add constraint procurement_purchases_status_check check (
  status in ('draft', 'confirmed', 'shipped', 'partially_received', 'fully_received', 'received', 'cancelled')
);

commit;
