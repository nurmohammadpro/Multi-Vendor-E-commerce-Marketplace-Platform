begin;

-- Promo display price: when set (and higher than price_amount), the billing UI
-- shows the plan as a launch promo — e.g. ৳500 now, regular ৳1,000.
alter table billing.plans
  add column if not exists regular_price numeric(14,2);

-- Pricing restructure for the Bangladesh market (approved):
-- signup fees dropped; wholesale is the ৳500 launch promo (regular ৳1,000);
-- daily expenses moves to Basic, banking to Standard; Pro becomes ৳2,500.
update billing.plans set
  price_amount = 500.00,
  regular_price = 1000.00,
  signup_fee = 0
where code = 'wholesale';

update billing.plans set
  price_amount = 800.00,
  regular_price = null,
  signup_fee = 0
where code = 'basic';

update billing.plans set
  price_amount = 1500.00,
  regular_price = null,
  signup_fee = 0
where code = 'standard';

update billing.plans set
  price_amount = 2500.00,
  regular_price = null,
  signup_fee = 0
where code = 'pro';

commit;
