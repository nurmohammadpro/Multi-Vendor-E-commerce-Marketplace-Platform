-- Food & grocery product seed for a store
-- Run with config: set app.store_code = 'STORE002';
--   then: \i database/seeds/0002_food_products.sql

begin;

do $$
declare
  v_store_id uuid;
  v_tenant_id uuid;
  v_prod_id uuid;
  v_sku_id uuid;
begin
  select s.id, s.tenant_id into v_store_id, v_tenant_id
  from store.stores s
  where s.store_code = current_setting('app.store_code', true);
  if v_store_id is null then
    raise exception 'Store with code % not found', current_setting('app.store_code', true);
  end if;

  -- ============================================================
  -- Categories
  -- ============================================================
  perform from catalog.categories where store_id = v_store_id and code = 'RICE';
  if not found then
    insert into catalog.categories (id, tenant_id, store_id, code, name, name_bn, status, sort_order, created_at, updated_at) values
      (gen_random_uuid(), v_tenant_id, v_store_id, 'RICE', 'Rice', 'চাল', 'active', 1, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'OIL', 'Cooking Oil', 'রান্নার তেল', 'active', 2, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'DAL', 'Lentils & Pulses', 'ডাল', 'active', 3, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'SPICE', 'Spices', 'মসলা', 'active', 4, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'DAIRY', 'Dairy & Eggs', 'দুগ্ধ ও ডিম', 'active', 5, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'BEV', 'Beverages', 'পানীয়', 'active', 6, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'SNACK', 'Snacks & Biscuits', 'স্ন্যাকস ও বিস্কুট', 'active', 7, now(), now()),
      (gen_random_uuid(), v_tenant_id, v_store_id, 'FOOD', 'Food & Groceries', 'খাদ্য ও মুদি', 'active', 8, now(), now());
  end if;

  -- ============================================================
  -- Rice
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'RICE-MINI';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'RICE'), 'RICE-MINI', 'Miniket Rice (1 kg)', 'মিনিকেট চাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'RICE-MINI-1KG', 'RICE-MINI-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 52.00, 56.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'RICE-NAZIR';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'RICE'), 'RICE-NAZIR', 'Nazir Shail Rice (1 kg)', 'নাজির শাইল চাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'RICE-NAZIR-1KG', 'RICE-NAZIR-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 46.00, 50.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'RICE-PAJAM';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'RICE'), 'RICE-PAJAM', 'Pajam Rice (1 kg)', 'পাজাম চাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'RICE-PAJAM-1KG', 'RICE-PAJAM-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 42.00, 46.00, now());
  end if;

  -- ============================================================
  -- Cooking Oil
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'OIL-SOY-1L';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'OIL'), 'OIL-SOY-1L', 'Soybean Oil (1 L)', 'সয়াবিন তেল ১ লিটার', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'OIL-SOY-1L', 'OIL-SOY-1L', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 155.00, 165.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'OIL-PALM-1L';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'OIL'), 'OIL-PALM-1L', 'Palm Oil (1 L)', 'পাম তেল ১ লিটার', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'OIL-PALM-1L', 'OIL-PALM-1L', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 138.00, 148.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'OIL-MSTRD-1L';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'OIL'), 'OIL-MSTRD-1L', 'Mustard Oil (1 L)', 'সরিষার তেল ১ লিটার', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'OIL-MSTRD-1L', 'OIL-MSTRD-1L', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 180.00, 195.00, now());
  end if;

  -- ============================================================
  -- Lentils & Pulses
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'DAL-MSR-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'DAL'), 'DAL-MSR-1KG', 'Masur Dal (1 kg)', 'মসুর ডাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'DAL-MSR-1KG', 'DAL-MSR-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 95.00, 105.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'DAL-MUG-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'DAL'), 'DAL-MUG-1KG', 'Mug Dal (1 kg)', 'মুগ ডাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'DAL-MUG-1KG', 'DAL-MUG-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 112.00, 125.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'DAL-BTN-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'DAL'), 'DAL-BTN-1KG', 'Boot Dal (1 kg)', 'বুটের ডাল ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'DAL-BTN-1KG', 'DAL-BTN-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 80.00, 90.00, now());
  end if;

  -- ============================================================
  -- Spices
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'SPICE-SALT-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SPICE'), 'SPICE-SALT-1KG', 'Salt (1 kg)', 'লবণ ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SPICE-SALT-1KG', 'SPICE-SALT-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 28.00, 35.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'SPICE-SGAR-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SPICE'), 'SPICE-SGAR-1KG', 'Sugar (1 kg)', 'চিনি ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SPICE-SGAR-1KG', 'SPICE-SGAR-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 105.00, 115.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'SPICE-TRM-100G';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SPICE'), 'SPICE-TRM-100G', 'Turmeric Powder (100 g)', 'হলুদের গুঁড়া ১০০ গ্রাম', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SPICE-TRM-100G', 'SPICE-TRM-100G', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 32.00, 40.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'SPICE-CHIL-100G';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SPICE'), 'SPICE-CHIL-100G', 'Red Chili Powder (100 g)', 'মরিচের গুঁড়া ১০০ গ্রাম', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SPICE-CHIL-100G', 'SPICE-CHIL-100G', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 38.00, 45.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'SPICE-CUMN-100G';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SPICE'), 'SPICE-CUMN-100G', 'Cumin Seed (100 g)', 'জিরা ১০০ গ্রাম', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SPICE-CUMN-100G', 'SPICE-CUMN-100G', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 55.00, 65.00, now());
  end if;

  -- ============================================================
  -- Vegetables
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'VEG-ONION-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'FOOD'), 'VEG-ONION-1KG', 'Onion (1 kg)', 'পেঁয়াজ ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'VEG-ONION-1KG', 'VEG-ONION-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 55.00, 65.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'VEG-GARLIC-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'FOOD'), 'VEG-GARLIC-1KG', 'Garlic (1 kg)', 'রসুন ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'VEG-GARLIC-1KG', 'VEG-GARLIC-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 100.00, 120.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'VEG-GINGER-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'FOOD'), 'VEG-GINGER-1KG', 'Ginger (1 kg)', 'আদা ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'VEG-GINGER-1KG', 'VEG-GINGER-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 120.00, 140.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'VEG-POTATO-1KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'FOOD'), 'VEG-POTATO-1KG', 'Potato (1 kg)', 'আলু ১ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'VEG-POTATO-1KG', 'VEG-POTATO-1KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 25.00, 30.00, now());
  end if;

  -- ============================================================
  -- Dairy & Eggs
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'DAIRY-EGG-4PC';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'DAIRY'), 'DAIRY-EGG-4PC', 'Egg (4 pcs)', 'ডিম ৪ পিস', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'DAIRY-EGG-4PC', 'DAIRY-EGG-4PC', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 42.00, 48.00, now());
  end if;

  perform from catalog.products where store_id = v_store_id and product_code = 'DAIRY-MILK-1L';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'DAIRY'), 'DAIRY-MILK-1L', 'Milk (1 L)', 'দুধ ১ লিটার', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'DAIRY-MILK-1L', 'DAIRY-MILK-1L', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 85.00, 95.00, now());
  end if;

  -- ============================================================
  -- Beverages
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'BEV-WTR-2L';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'BEV'), 'BEV-WTR-2L', 'Drinking Water (2 L)', 'পানি ২ লিটার', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'BEV-WTR-2L', 'BEV-WTR-2L', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 22.00, 28.00, now());
  end if;

  -- ============================================================
  -- Snacks
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'SNCK-BSC-1PK';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'SNACK'), 'SNCK-BSC-1PK', 'Glucose Biscuit (1 pack)', 'গ্লুকোজ বিস্কুট ১ প্যাক', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'SNCK-BSC-1PK', 'SNCK-BSC-1PK', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 18.00, 25.00, now());
  end if;

  -- ============================================================
  -- Atta / Flour
  -- ============================================================
  perform from catalog.products where store_id = v_store_id and product_code = 'FOOD-ATTA-2KG';
  if not found then
    insert into catalog.products (id, tenant_id, store_id, category_id, product_code, name, name_bn, has_variants, variant_mode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, (select id from catalog.categories where store_id = v_store_id and code = 'FOOD'), 'FOOD-ATTA-2KG', 'Whole Wheat Atta (2 kg)', 'আটা ২ কেজি', false, 'single', 'active', now(), now())
    returning id into v_prod_id;
    insert into catalog.skus (id, tenant_id, store_id, product_id, sku_code, barcode, status, created_at, updated_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_prod_id, 'FOOD-ATTA-2KG', 'FOOD-ATTA-2KG', 'active', now(), now())
    returning id into v_sku_id;
    insert into catalog.prices (id, tenant_id, store_id, sku_id, cost_price, sale_price, created_at)
    values (gen_random_uuid(), v_tenant_id, v_store_id, v_sku_id, 68.00, 78.00, now());
  end if;

  raise notice 'Food products seeded for store %', current_setting('app.store_code', true);
end;
$$;

commit;
