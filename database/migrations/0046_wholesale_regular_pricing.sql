begin;

-- Launch promo ended: Wholesale is now the regular ৳1,000/month.
update billing.plans set
  price_amount = 1000.00,
  regular_price = null
where code = 'wholesale';

commit;
