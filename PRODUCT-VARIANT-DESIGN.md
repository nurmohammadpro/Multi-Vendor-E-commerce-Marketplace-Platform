# Product Variant Design

## Decision

We should **not** rely only on `catalog.skus.variant_json` for long-term variant handling.

That field is useful as a cached snapshot, but the real variant system should be **normalized**.

## Corrected Idea

Your idea is good, and the right principle is:

- variants must be **manual and store-driven**
- the platform must **not force fixed variant types**
- a store owner or manager should define variant groups per product
- each sellable combination becomes a separate SKU

That means:

- a clothing store can create `Color` + `Size`
- a tire shop can create `Position` + `Size`
- a hardware store can create `Weight` + `Size` + `Grade`
- another store can use only one group, like `Capacity`

So the product system must support:

1. **simple product**
2. **single-variant product**
3. **multi-variant product**

## Recommended Model

### 1. Product

`catalog.products`

Keep the base product as the parent item:

- product name
- brand
- category
- description
- status

Add later if needed:

- `has_variants boolean not null default false`
- `variant_mode text not null default 'none'`

Suggested `variant_mode`:

- `none`
- `single`
- `multi`

### 2. Variant Groups

Create a table like:

`catalog.product_variant_groups`

Suggested columns:

- `id`
- `tenant_id`
- `store_id`
- `product_id`
- `code`
- `name`
- `input_type`
- `sort_order`
- `is_required`
- `status`

Examples:

- `color`
- `size`
- `position`
- `weight`
- `material`

`input_type` can help the UI:

- `text`
- `color`
- `number`

This is important because:

- clothing may want color swatches
- hardware may want plain text
- tires may want structured labels

### 3. Variant Options

Create a table like:

`catalog.product_variant_options`

Suggested columns:

- `id`
- `tenant_id`
- `store_id`
- `product_id`
- `variant_group_id`
- `code`
- `label`
- `value_text`
- `value_number`
- `color_hex`
- `sort_order`
- `status`

Examples:

- group `Color` → `Red`, `Blue`, `Black`
- group `Size` → `S`, `M`, `L`, `XL`
- group `Position` → `Front`, `Rear`
- group `Weight` → `1kg`, `5kg`, `20kg`

## 4. SKU = Sellable Combination

Keep `catalog.skus`, but treat each SKU as one exact combination.

Examples:

- T-Shirt / Red / XL
- Tire / Front / 90-90-12
- Drill Bit / 8mm / Heavy Duty

Each SKU should keep:

- `sku_code`
- `barcode`
- `unit_name`
- `weight`
- `status`

And also a cached human-readable snapshot:

- `variant_json`

That snapshot is useful for:

- POS speed
- invoice display
- label printing
- search

But it should be derived from normalized relations.

## 5. SKU Variant Mapping

Create a join table:

`catalog.sku_variant_options`

Suggested columns:

- `sku_id`
- `variant_group_id`
- `variant_option_id`
- `sort_order`

This table is the core of the system.

It lets us:

- validate combinations
- block duplicates
- build SKU matrixes
- support any industry without schema changes

## Why This Is Better

If we only save:

- `variant_json = {"color":"red","size":"xl"}`

then later we cannot reliably:

- filter by one option
- prevent duplicate combinations
- sort options consistently
- generate variant matrixes cleanly
- support reporting by variant

Normalized tables solve that cleanly.

## Example Workflows

### Clothing Store

Product: `Premium Polo Shirt`

Variant groups:

- `Color`
- `Size`

Options:

- Color → `Black`, `Navy`, `White`
- Size → `M`, `L`, `XL`

SKUs:

- Polo / Black / M
- Polo / Black / L
- Polo / Navy / M

### Tire Shop

Product: `MRF Motorcycle Tire`

Variant groups:

- `Position`
- `Size`

Options:

- Position → `Front`, `Rear`
- Size → `80/100-18`, `90/90-18`

SKUs:

- MRF Tire / Front / 80/100-18
- MRF Tire / Rear / 90/90-18

### Hardware Store

Product: `Industrial Bolt`

Variant groups:

- `Size`
- `Weight`
- `Grade`

Options:

- Size → `8mm`, `10mm`
- Weight → `1kg`, `5kg`
- Grade → `304`, `316`

SKUs:

- Bolt / 8mm / 1kg / 304
- Bolt / 10mm / 5kg / 316

## API Direction

We should extend the catalog API like this:

- `POST /v1/catalog/products`
- `PATCH /v1/catalog/products/:id`
- `GET /v1/catalog/products/:id/variants`
- `POST /v1/catalog/products/:id/variant-groups`
- `PATCH /v1/catalog/variant-groups/:id`
- `POST /v1/catalog/products/:id/variant-options`
- `PATCH /v1/catalog/variant-options/:id`
- `POST /v1/catalog/skus`
- `PATCH /v1/catalog/skus/:id`

## Recommended SKU Creation Modes

Support two modes in the UI:

### 1. Manual Combination Mode

Best for:

- tires
- hardware
- irregular catalogs

The user manually selects options and creates one SKU at a time.

### 2. Matrix Generate Mode

Best for:

- fashion
- shoes
- cosmetics

The user defines groups and options, and the UI generates all combinations.

Important:

- generation should be optional
- final SKU list must still be editable manually

## Rules

- products are never deleted
- variant groups are store/product scoped
- variant options are product scoped
- SKU combinations must be unique per product
- inactive options cannot be used for new SKUs
- old SKUs remain valid even if an option later becomes inactive
- barcode stays on SKU, never on product
- stock stays on SKU, never on product
- price stays on SKU, never on product
- POS always sells SKU, not parent product

## POS Impact

This matters for POS because:

- barcode scanner should resolve directly to a SKU
- receipt should show variant labels
- label printer should print product + variant combination
- stock deduction must happen per SKU combination

Example receipt line:

- `Premium Polo Shirt - Black / XL`

## Search and Filtering

For fast POS and admin search:

- keep normalized variant tables
- also keep `variant_json` snapshot on `catalog.skus`
- optionally add `variant_label` later, such as `Black / XL`

That gives:

- reliable filtering
- fast display
- clean reporting

## Migration Strategy From Current Design

Right now we already have:

- `catalog.products`
- `catalog.skus.variant_json`

So the clean next step is:

1. keep `variant_json`
2. add normalized variant tables
3. treat `variant_json` as denormalized snapshot
4. update SKU create/update logic to write both

## Implementation Order

### Phase 1

Add:

- `catalog.product_variant_groups`
- `catalog.product_variant_options`
- `catalog.sku_variant_options`

### Phase 2

Update backend validation:

- validate product ownership
- validate option belongs to product
- validate one option per group per SKU
- validate no duplicate combination

### Phase 3

Update catalog APIs:

- create group
- create options
- create SKU with option list
- return resolved variant labels

### Phase 4

Update store frontend:

- product variant builder
- SKU combination builder
- matrix generator

### Phase 5

Update POS:

- barcode-to-SKU lookup
- variant display in cart
- receipt and label printing format

## Final Recommendation

The best product model for this platform is:

- **Product = parent**
- **Variant groups = manual definitions**
- **Variant options = manual values**
- **SKU = one exact sellable combination**

That is the correct design for multi-industry stores and will scale much better than a JSON-only variant system.
