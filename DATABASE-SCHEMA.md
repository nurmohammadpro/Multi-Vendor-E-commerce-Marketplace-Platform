# Database Schema — Phase 1

## Purpose

This document defines the Phase 1 database design for the store operating system.

It is designed for:

- `PostgreSQL` as the primary database
- `NestJS + Fastify` backend services
- `Next.js` store and admin web apps
- future compatibility with self-hosted `Supabase`
- shared stock and sales logic so Phase 2 online marketplace can reuse the same core

This schema is intentionally optimized for:

- strong auditability
- safe stock operations
- role-based access control
- POS transactions
- future marketplace expansion

---

## Database Recommendation

### Recommended Direction

Use **PostgreSQL as the actual database engine**, and treat **Supabase as an optional platform layer** around PostgreSQL.

That means:

- the real source of truth is PostgreSQL
- Supabase can later provide auth, storage, realtime, and admin tooling if needed
- the schema should remain clean PostgreSQL first, not tightly coupled to Supabase-specific shortcuts

### Important Clarification

If you self-host Supabase, you are not “choosing a different database.”
You are still choosing PostgreSQL plus a larger service stack around it.

For this project, the safest Phase 1 path is:

- design for plain PostgreSQL first
- stay compatible with self-hosted Supabase
- only enable the Supabase services you truly need

### Phase 1 Hosting Recommendation

For your `Hostinger VPS + Easypanel` setup:

- app services can be managed comfortably with Easypanel
- Docker-based deployment is a good fit
- `docker compose` is still the best source-of-truth deployment format
- if you self-host Supabase, do it carefully because it adds operational overhead beyond just Postgres

---

## Schema Strategy

### Recommendation

Do **not** put all application tables in a single `public` schema.

Use separate PostgreSQL schemas by domain.

Recommended schemas:

- `identity`
- `access`
- `platform`
- `store`
- `catalog`
- `inventory`
- `sales`
- `shipping`
- `billing`
- `support`
- `comms`
- `reporting`
- `audit`
- `integration`

### Why This Structure

- easier permissions and maintenance
- clearer ownership by domain
- safer migration planning
- avoids accidental mixing with Supabase internal schemas such as `auth`, `storage`, and other managed components

### Naming Rules

- table names use `snake_case`
- primary keys use `id`
- foreign keys use `<entity>_id`
- timestamps use `created_at`, `updated_at`
- soft-state fields use `status`
- actor tracking uses `created_by`, `updated_by`, `actor_id` where relevant

---

## Extensions

Recommended PostgreSQL extensions:

- `pgcrypto` for UUID generation if needed
- `citext` for case-insensitive email/login fields
- `btree_gin` if needed for mixed indexing strategies
- `pg_trgm` for fast text search in Phase 1

Optional later:

- `postgis` if advanced geo-delivery routing becomes necessary

---

## ID Strategy

### Primary Choice

Use `uuid` primary keys for most business tables.

Why:

- safer in distributed systems
- easier future service extraction
- easier client-safe references
- avoids predictable sequential IDs

### Human-Facing Numbers

Use separate formatted public numbers where needed:

- `store_code`
- `product_code`
- `sale_no`
- `invoice_no`
- `shipment_no`
- `ticket_no`

These should not replace internal primary keys.

---

## Shared Base Columns

Most transactional tables should include:

- `id uuid primary key`
- `tenant_id uuid not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid null`
- `updated_by uuid null`

Where store-scoped:

- `store_id uuid not null`

Where soft-state is needed:

- `status text not null`

---

## Schema by Domain

## 1. `identity`

Purpose:

- human users
- login identities
- profile basics
- sessions and devices

### `identity.users`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | primary key |
| tenant_id | uuid | platform tenant |
| phone | varchar(30) | unique when present |
| email | citext | unique when present |
| password_hash | text | nullable if external auth later |
| status | text | `active`, `invited`, `suspended`, `disabled` |
| preferred_locale | varchar(10) | `en`, `bn` |
| last_login_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Indexes:

- unique partial index on `email`
- unique partial index on `phone`
- index on `status`

### `identity.user_profiles`

| Column | Type | Notes |
|---|---|---|
| user_id | uuid pk fk -> identity.users.id | one-to-one |
| full_name | varchar(200) | |
| avatar_url | text | nullable |
| gender | text | nullable |
| date_of_birth | date | nullable |
| emergency_contact | varchar(50) | nullable |
| address_text | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `identity.user_sessions`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | |
| refresh_token_hash | text | |
| device_label | varchar(120) | nullable |
| ip_address | inet | nullable |
| user_agent | text | nullable |
| expires_at | timestamptz | |
| revoked_at | timestamptz | nullable |
| created_at | timestamptz | |

### `identity.user_mfa_methods`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | |
| method_type | text | `totp`, `sms`, `email` |
| secret_ref | text | encrypted reference or external secret |
| is_primary | boolean | |
| verified_at | timestamptz | nullable |
| created_at | timestamptz | |

---

## 2. `access`

Purpose:

- RBAC
- store role assignment
- admin role assignment
- permission bundles

### `access.roles`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| scope_type | text | `store`, `platform`, `admin_bundle` |
| code | varchar(100) | unique |
| name | varchar(150) | |
| description | text | nullable |
| created_at | timestamptz | |

Seed roles:

- `store_owner`
- `store_manager`
- `store_salesman`
- `platform_owner`
- `regular_admin`
- `operations_admin`
- `finance_admin`
- `support_admin`
- `marketing_admin`

### `access.permissions`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| code | varchar(150) unique | |
| resource | varchar(100) | |
| action | varchar(100) | |
| description | text | nullable |

Example permissions:

- `inventory.adjust.direct`
- `inventory.adjust.request`
- `inventory.adjust.approve`
- `sales.pos.create`
- `billing.subscription.manage`
- `platform.admin.manage`
- `platform.broadcast.send`

### `access.role_permissions`

| Column | Type | Notes |
|---|---|---|
| role_id | uuid fk | composite key |
| permission_id | uuid fk | composite key |
| created_at | timestamptz | |

Primary key:

- `(role_id, permission_id)`

### `access.store_memberships`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| user_id | uuid | |
| role_id | uuid | store-scoped role |
| status | text | `active`, `invited`, `suspended`, `removed` |
| joined_at | timestamptz | nullable |
| created_at | timestamptz | |

Constraints:

- unique `(store_id, user_id)` active membership rule

### `access.admin_memberships`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| user_id | uuid | |
| base_role_id | uuid | `platform_owner` or `regular_admin` |
| status | text | |
| created_at | timestamptz | |

### `access.admin_bundle_assignments`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| admin_membership_id | uuid fk | |
| role_id | uuid fk | bundle role |
| created_at | timestamptz | |

---

## 3. `platform`

Purpose:

- top-level platform structures
- global settings
- platform operational metadata

### `platform.tenants`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | single tenant now, multi-tenant ready |
| code | varchar(100) unique | |
| name | varchar(200) | |
| status | text | |
| created_at | timestamptz | |

### `platform.settings`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| key | varchar(150) | |
| value_json | jsonb | |
| updated_by | uuid | |
| updated_at | timestamptz | |

Constraints:

- unique `(tenant_id, key)`

---

## 4. `store`

Purpose:

- stores
- store settings
- staff invitations

### `store.stores`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| owner_user_id | uuid fk -> identity.users.id | primary business owner |
| store_code | varchar(50) unique | |
| name | varchar(200) | |
| name_bn | varchar(200) | nullable |
| slug | varchar(200) | unique |
| phone | varchar(30) | |
| email | citext | nullable |
| status | text | `pending`, `active`, `suspended`, `inactive` |
| subscription_status | text | cached convenience field |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `store.store_settings`

| Column | Type | Notes |
|---|---|---|
| store_id | uuid pk fk | |
| timezone | varchar(100) | |
| currency_code | varchar(10) | default `BDT` |
| locale | varchar(10) | |
| receipt_footer | text | nullable |
| invoice_prefix | varchar(20) | nullable |
| allow_negative_stock | boolean | default false |
| low_stock_threshold_default | integer | nullable |
| updated_at | timestamptz | |

### `store.store_invitations`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| invited_email | citext | nullable |
| invited_phone | varchar(30) | nullable |
| role_id | uuid | |
| token_hash | text | |
| expires_at | timestamptz | |
| accepted_at | timestamptz | nullable |
| created_by | uuid | |
| created_at | timestamptz | |

---

## 5. `catalog`

Purpose:

- products
- skus
- pricing
- categories
- media

### `catalog.categories`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| parent_id | uuid nullable fk -> catalog.categories.id | |
| code | varchar(50) | |
| name | varchar(150) | |
| name_bn | varchar(150) | nullable |
| status | text | |
| sort_order | integer | |
| created_at | timestamptz | |

### `catalog.brands`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| name | varchar(150) | |
| name_bn | varchar(150) | nullable |
| status | text | |
| created_at | timestamptz | |

### `catalog.products`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| category_id | uuid fk | nullable |
| brand_id | uuid fk | nullable |
| product_code | varchar(50) | unique per store |
| name | varchar(250) | |
| name_bn | varchar(250) | nullable |
| description | text | nullable |
| status | text | `active`, `inactive`, `archived`, `out_of_stock` |
| is_trackable | boolean | default true |
| created_by | uuid | |
| updated_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraints:

- unique `(store_id, product_code)`

### `catalog.product_media`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| product_id | uuid | |
| media_type | text | `image`, `document` |
| storage_path | text | |
| is_primary | boolean | |
| sort_order | integer | |
| created_at | timestamptz | |

### `catalog.skus`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| product_id | uuid | |
| sku_code | varchar(80) | unique per store |
| barcode | varchar(80) | nullable |
| variant_json | jsonb | nullable |
| unit_name | varchar(50) | nullable |
| weight_value | numeric(12,3) | nullable |
| weight_unit | varchar(20) | nullable |
| status | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraints:

- unique `(store_id, sku_code)`

### `catalog.prices`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| sku_id | uuid | |
| cost_price | numeric(14,2) | nullable |
| sale_price | numeric(14,2) | not null |
| compare_at_price | numeric(14,2) | nullable |
| effective_from | timestamptz | |
| effective_to | timestamptz | nullable |
| created_at | timestamptz | |
| created_by | uuid | |

Rule:

- never overwrite price history; insert a new row for changes

---

## 6. `inventory`

Purpose:

- stock locations
- balances
- immutable ledger
- approval requests

### `inventory.locations`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| code | varchar(50) | |
| name | varchar(150) | |
| location_type | text | `storefront`, `warehouse`, `backroom` |
| status | text | |
| created_at | timestamptz | |

Constraints:

- unique `(store_id, code)`

### `inventory.balances`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| sku_id | uuid | |
| on_hand_qty | numeric(14,3) | default 0 |
| reserved_qty | numeric(14,3) | default 0 |
| available_qty | numeric(14,3) | stored or generated |
| damaged_qty | numeric(14,3) | default 0 |
| returned_qty | numeric(14,3) | default 0 |
| updated_at | timestamptz | |

Constraints:

- unique `(location_id, sku_id)`

### `inventory.ledger`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| sku_id | uuid | |
| movement_type | text | `initial`, `sale`, `return`, `manual_adjustment`, `approval_adjustment`, `damage`, `transfer` |
| qty_delta | numeric(14,3) | positive or negative |
| reference_type | text | source entity |
| reference_id | uuid | nullable |
| note | text | nullable |
| actor_id | uuid | |
| created_at | timestamptz | |

Rule:

- this table is append-only

### `inventory.stock_adjustment_requests`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| sku_id | uuid | |
| requested_by | uuid | manager user |
| current_qty | numeric(14,3) | |
| requested_qty | numeric(14,3) | |
| qty_delta | numeric(14,3) | |
| reason | text | |
| status | text | `pending`, `approved`, `rejected`, `cancelled` |
| decided_by | uuid | nullable |
| decided_at | timestamptz | nullable |
| decision_note | text | nullable |
| created_at | timestamptz | |

Indexes:

- index on `(store_id, status, created_at desc)`

### `inventory.stock_initializations`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| sku_id | uuid | |
| initialized_by | uuid | |
| initialized_at | timestamptz | |

Purpose:

- marks that initial stock entry already happened for a SKU/location
- allows the manager approval rule to be enforced safely

---

## 7. `sales`

Purpose:

- POS transactions
- sale items
- payments
- returns
- cashier shifts

### `sales.registers`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| code | varchar(50) | |
| name | varchar(100) | |
| status | text | |
| created_at | timestamptz | |

### `sales.register_shifts`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| register_id | uuid | |
| opened_by | uuid | |
| closed_by | uuid | nullable |
| opening_cash | numeric(14,2) | default 0 |
| closing_cash | numeric(14,2) | nullable |
| opened_at | timestamptz | |
| closed_at | timestamptz | nullable |
| status | text | `open`, `closed` |

### `sales.sales`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| register_id | uuid | nullable |
| shift_id | uuid | nullable |
| sale_no | varchar(50) | unique per store |
| sold_by | uuid | salesman, manager, or owner |
| customer_name | varchar(200) | nullable |
| customer_phone | varchar(30) | nullable |
| subtotal_amount | numeric(14,2) | |
| discount_amount | numeric(14,2) | default 0 |
| tax_amount | numeric(14,2) | default 0 |
| shipping_amount | numeric(14,2) | default 0 |
| total_amount | numeric(14,2) | |
| payment_status | text | `pending`, `paid`, `partial`, `refunded` |
| fulfillment_status | text | `completed`, `delivery_pending`, `returned` |
| status | text | `completed`, `voided`, `returned_partially`, `returned_fully` |
| note | text | nullable |
| created_at | timestamptz | |

### `sales.sale_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| sale_id | uuid | |
| sku_id | uuid | |
| product_name_snapshot | varchar(250) | |
| sku_code_snapshot | varchar(80) | |
| qty | numeric(14,3) | |
| unit_price | numeric(14,2) | |
| discount_amount | numeric(14,2) | default 0 |
| tax_amount | numeric(14,2) | default 0 |
| line_total | numeric(14,2) | |

### `sales.sale_payments`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| sale_id | uuid | |
| payment_method | text | `cash`, `card`, `mfs`, `bank_transfer`, `split` |
| gateway_provider | text | nullable |
| amount | numeric(14,2) | |
| reference_no | varchar(100) | nullable |
| status | text | |
| paid_at | timestamptz | nullable |
| created_at | timestamptz | |

### `sales.sale_returns`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| sale_id | uuid | |
| processed_by | uuid | |
| reason | text | |
| refund_amount | numeric(14,2) | |
| status | text | `processed`, `rejected` |
| created_at | timestamptz | |

### `sales.sale_return_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| sale_return_id | uuid | |
| sale_item_id | uuid | |
| qty | numeric(14,3) | |
| restock_to_inventory | boolean | default true |
| line_refund_amount | numeric(14,2) | |

---

## 8. `shipping`

Purpose:

- delivery jobs
- courier records
- shipment status tracking

### `shipping.courier_providers`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| code | varchar(50) unique | |
| name | varchar(150) | |
| status | text | |
| config_json | jsonb | nullable |

### `shipping.shipments`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| sale_id | uuid | nullable |
| courier_provider_id | uuid | nullable |
| shipment_no | varchar(50) | unique per store |
| customer_name | varchar(200) | |
| customer_phone | varchar(30) | |
| delivery_address | text | |
| district | varchar(100) | nullable |
| area | varchar(100) | nullable |
| delivery_fee | numeric(14,2) | default 0 |
| tracking_no | varchar(100) | nullable |
| status | text | `pending`, `assigned`, `picked_up`, `in_transit`, `delivered`, `failed`, `returned` |
| created_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `shipping.shipment_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| shipment_id | uuid | |
| event_type | text | |
| event_payload | jsonb | nullable |
| note | text | nullable |
| created_at | timestamptz | |

---

## 9. `billing`

Purpose:

- subscriptions
- plans
- invoices
- payment records for subscription billing

### `billing.plans`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| code | varchar(50) unique | `basic`, `standard`, `pro` |
| name | varchar(100) | |
| price_amount | numeric(14,2) | |
| billing_cycle | text | `monthly`, `yearly` |
| features_json | jsonb | |
| status | text | |
| created_at | timestamptz | |

### `billing.subscriptions`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| plan_id | uuid | |
| start_at | timestamptz | |
| end_at | timestamptz | nullable |
| renewal_at | timestamptz | nullable |
| status | text | `trial`, `active`, `past_due`, `suspended`, `cancelled`, `expired` |
| auto_renew | boolean | |
| created_at | timestamptz | |

### `billing.invoices`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| subscription_id | uuid | nullable |
| invoice_no | varchar(50) | unique per tenant |
| invoice_type | text | `subscription`, `adjustment`, `manual` |
| subtotal_amount | numeric(14,2) | |
| discount_amount | numeric(14,2) | default 0 |
| tax_amount | numeric(14,2) | default 0 |
| total_amount | numeric(14,2) | |
| status | text | `draft`, `issued`, `paid`, `overdue`, `void` |
| due_at | timestamptz | nullable |
| issued_at | timestamptz | nullable |
| paid_at | timestamptz | nullable |
| created_at | timestamptz | |

### `billing.invoice_payments`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| invoice_id | uuid | |
| payment_method | text | |
| gateway_provider | text | nullable |
| amount | numeric(14,2) | |
| reference_no | varchar(100) | nullable |
| status | text | |
| paid_at | timestamptz | nullable |
| created_at | timestamptz | |

---

## 10. `support`

Purpose:

- internal store-admin support
- disputes
- ticket workflows

### `support.tickets`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | nullable |
| ticket_no | varchar(50) | unique per tenant |
| opened_by | uuid | |
| assigned_to | uuid | nullable |
| ticket_type | text | `support`, `dispute`, `billing`, `technical` |
| subject | varchar(250) | |
| status | text | `open`, `in_progress`, `resolved`, `closed` |
| priority | text | `low`, `medium`, `high`, `urgent` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `support.ticket_messages`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| ticket_id | uuid | |
| sender_user_id | uuid | |
| message_body | text | |
| attachment_path | text | nullable |
| created_at | timestamptz | |

---

## 11. `comms`

Purpose:

- notifications
- broadcast messages
- templates

### `comms.notifications`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| recipient_user_id | uuid | |
| channel | text | `in_app`, `email`, `sms` |
| template_code | varchar(100) | nullable |
| title | varchar(200) | nullable |
| body | text | |
| status | text | `queued`, `sent`, `failed`, `read` |
| reference_type | text | nullable |
| reference_id | uuid | nullable |
| sent_at | timestamptz | nullable |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

### `comms.notification_templates`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| code | varchar(100) | unique per tenant |
| channel | text | |
| subject_template | text | nullable |
| body_template | text | |
| is_active | boolean | |
| created_at | timestamptz | |

### `comms.broadcasts`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| created_by | uuid | |
| audience_type | text | `all_stores`, `selected_stores`, `admins` |
| channel | text | `in_app`, `email`, `sms` |
| title | varchar(200) | nullable |
| body | text | |
| status | text | `draft`, `scheduled`, `sent`, `cancelled` |
| scheduled_at | timestamptz | nullable |
| created_at | timestamptz | |

---

## 12. `reporting`

Purpose:

- read-optimized aggregates
- snapshots and exports

### `reporting.daily_store_sales`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| business_date | date | |
| total_sales_amount | numeric(14,2) | |
| total_orders_count | integer | |
| total_items_qty | numeric(14,3) | |
| total_discount_amount | numeric(14,2) | |
| total_returns_amount | numeric(14,2) | |
| generated_at | timestamptz | |

Constraints:

- unique `(store_id, business_date)`

### `reporting.daily_inventory_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| location_id | uuid | |
| sku_id | uuid | |
| snapshot_date | date | |
| on_hand_qty | numeric(14,3) | |
| available_qty | numeric(14,3) | |
| generated_at | timestamptz | |

### `reporting.export_jobs`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| requested_by | uuid | |
| export_type | text | `sales`, `inventory`, `billing`, `support` |
| filter_json | jsonb | |
| file_path | text | nullable |
| status | text | `queued`, `processing`, `completed`, `failed` |
| created_at | timestamptz | |
| completed_at | timestamptz | nullable |

---

## 13. `audit`

Purpose:

- compliance
- traceability
- security forensics

### `audit.logs`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| actor_user_id | uuid | nullable |
| actor_type | text | `user`, `system`, `job` |
| store_id | uuid | nullable |
| action_code | varchar(150) | |
| resource_type | varchar(100) | |
| resource_id | uuid | nullable |
| before_json | jsonb | nullable |
| after_json | jsonb | nullable |
| ip_address | inet | nullable |
| user_agent | text | nullable |
| created_at | timestamptz | |

Indexes:

- index on `(tenant_id, created_at desc)`
- index on `(resource_type, resource_id)`
- index on `(actor_user_id, created_at desc)`

---

## 14. `integration`

Purpose:

- external gateway, courier, and webhook data

### `integration.payment_gateways`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| store_id | uuid | |
| provider_code | varchar(50) | |
| display_name | varchar(100) | |
| credentials_ref | text | encrypted external secret reference |
| status | text | |
| created_at | timestamptz | |

### `integration.webhook_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| provider_type | text | `payment`, `courier` |
| provider_code | varchar(50) | |
| external_event_id | varchar(150) | nullable |
| payload_json | jsonb | |
| processing_status | text | `pending`, `processed`, `failed`, `ignored` |
| processed_at | timestamptz | nullable |
| created_at | timestamptz | |

### `integration.outbox_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| aggregate_type | varchar(100) | |
| aggregate_id | uuid | |
| event_type | varchar(150) | |
| event_payload | jsonb | |
| status | text | `pending`, `published`, `failed` |
| available_at | timestamptz | |
| published_at | timestamptz | nullable |
| created_at | timestamptz | |

---

## Referential Rules

### Important Rules

- `identity.users` is the root human-actor table
- `store.stores.owner_user_id` must point to a valid user
- all store operations require an active row in `access.store_memberships`
- all admin operations require an active row in `access.admin_memberships`
- product and SKU rows are store-owned
- inventory rows are store and location scoped
- sales rows must reference a valid store and stock location
- returns should create inventory ledger entries, not direct stock overwrites
- subscription and invoice data should remain append-safe

---

## Concurrency Rules

### Inventory

Inventory writes must use transactional locking on the balance row or an equivalent safe concurrency strategy.

Recommended approach:

- fetch balance row `FOR UPDATE`
- verify available quantity
- insert inventory ledger row
- update balance row
- commit

### POS Sales

POS sale commit must atomically:

- insert sale
- insert sale items
- insert sale payments
- insert inventory ledger rows
- update inventory balances
- insert outbox event

### Stock Approval

Stock approval commit must atomically:

- verify request still `pending`
- mark request `approved` or `rejected`
- if approved, insert inventory ledger row
- update inventory balance
- write audit log
- insert outbox event

---

## Soft Delete and Immutable Data Rules

### Never Hard Delete

Avoid hard deletion for:

- users
- stores
- products
- skus
- sales
- invoices
- support tickets

Instead:

- use `status`
- use archival flags if needed
- preserve history

### Append-Only Tables

These tables should be append-only or treated as immutable history:

- `inventory.ledger`
- `catalog.prices`
- `audit.logs`
- `integration.webhook_events`
- `integration.outbox_events`

---

## Supabase Compatibility Notes

If you self-host Supabase later:

- keep your app data in these custom schemas, not in `public`
- do not overload Supabase internal schemas such as `auth` and `storage`
- use Supabase Auth only if it fits your auth model cleanly
- keep the backend as the primary business-rule enforcement layer
- do not expose all tables directly to client-side access

For this project, even with Supabase, the safest model is:

- `Next.js` and `NestJS` talk to PostgreSQL through controlled backend services
- row-level security can be added later for selective use cases
- core POS, stock, and billing logic should stay server-side

---

## Deployment Recommendation

### Best Practical Setup

For your current hosting direction:

- `Hostinger VPS`
- `Easypanel`
- `docker compose` as the canonical deployment definition
- self-hosted `PostgreSQL` first
- optional self-hosted `Supabase` services only if needed

### Why This Is Better Than Starting Full Supabase Immediately

Starting with plain PostgreSQL is simpler because:

- fewer moving parts
- lower RAM and CPU overhead
- easier backups and recovery
- easier debugging on a single VPS

Add Supabase later if you specifically want:

- hosted-style auth workflows
- built-in storage API
- realtime channels
- Supabase Studio convenience

### My Recommendation

For Phase 1:

- run `PostgreSQL` directly on the VPS
- add `pgAdmin` or another admin tool if you want GUI access
- use automated backups to S3-compatible storage
- keep the schema Supabase-compatible

If later you decide you need Supabase Auth, Storage, or Studio, you can layer it on more safely.

---

## Build Order for Database Work

1. create schemas
2. create shared enums or status conventions
3. create identity and access tables
4. create store and catalog tables
5. create inventory tables
6. create sales tables
7. create billing and shipping tables
8. create support, comms, reporting, and audit tables
9. add indexes
10. add constraints
11. add triggers for `updated_at`
12. add seed data for roles, permissions, and plans

---

## Final Recommendation

The database foundation for this project should be:

- `PostgreSQL 17`
- domain-separated schemas
- UUID primary keys
- append-only ledgers for inventory and audit
- transactional stock and POS workflows
- Docker-based deployment
- self-hosted on your VPS with room to adopt Supabase services later

This is the safest and most scalable starting point for Phase 1.
