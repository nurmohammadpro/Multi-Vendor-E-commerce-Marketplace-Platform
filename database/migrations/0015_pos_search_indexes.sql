-- Speed up POS catalog search (ILIKE '%term%' on SKU fields)
-- and the store_id + status filter that every POS query starts with.

create index if not exists skus_store_status_idx
  on catalog.skus (store_id, status);

create index if not exists skus_sku_code_trgm_idx
  on catalog.skus using gin (sku_code gin_trgm_ops);

create index if not exists skus_barcode_trgm_idx
  on catalog.skus using gin (barcode gin_trgm_ops);

create index if not exists skus_variant_label_trgm_idx
  on catalog.skus using gin (variant_label gin_trgm_ops);
