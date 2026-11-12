begin;

-- Cash-on-delivery as a payable-later payment method (collected via due-collection flow)
alter table sales.sale_payments drop constraint if exists sale_payments_method_check;
alter table sales.sale_payments add constraint sale_payments_method_check check (
  payment_method in ('cash', 'card', 'mfs', 'bank_transfer', 'split', 'cod')
);

-- Invoice numbers are per-store sequences assigned lazily on first A4 invoice render
create unique index if not exists sales_invoice_no_store_uq
  on sales.sales (store_id, invoice_no)
  where invoice_no is not null;

-- Wholesale plan: single user, single location, custom white-label invoice system.
-- Promotional pricing (500 BDT/mo, no signup fee). Feature keys use the console
-- feature vocabulary consumed by store-web gating and the admin plan editor.
insert into billing.plans (
  tenant_id, code, name, price_amount, billing_cycle, features_json, status,
  max_users, max_locations, signup_fee, is_custom
)
select distinct tenant_id, 'wholesale', 'Wholesale', 500.00, 'monthly',
  '["dashboard","catalog","inventory","pos","returns","purchases","receivables","customers","reports","shipping","support","billing","settings","hardware","session","invoices"]'::jsonb,
  'active', 1, 1, 0.00, false
from billing.plans
where code = 'basic'
on conflict (tenant_id, code) do nothing;

commit;
