# Phase 1 Architecture — Store Operating System

## Purpose

This document turns the Phase 1 plan into an implementation-ready architecture for the first release of the platform.

Phase 1 covers:

- Store web console
- Admin web console
- Store staff roles and permissions
- Product and inventory management
- POS and store sales
- Shipping operations
- Subscription billing
- Internal support and notifications

Phase 1 does **not** include:

- Public customer marketplace
- Customer checkout
- Customer mobile app
- Store mobile app

The architecture must still be designed so that Phase 2 can add online marketplace sales without rebuilding stock, payment, or reporting logic.

---

## Core Stack

### Frontend

- `Next.js App Router`
- `TypeScript`
- `Tailwind CSS`
- `TanStack Query`
- `React Hook Form`
- `Zod`
- `WebSocket` or `Server-Sent Events` for live operational updates

### Backend

- `NestJS`
- `Fastify`
- `TypeScript`
- modular monolith with domain-driven modules
- REST APIs for Phase 1 operations
- outbox/event pattern for async workflows

### Data and Infra

- `PostgreSQL` as system of record
- `Redis/Valkey` for caching, rate limiting, sessions, and short-lived state
- object storage for media, invoices, exports, and attachments
- background jobs for notifications, exports, and reconciliation
- Docker-based local and deployment workflow
- GitHub Actions CI/CD
- OpenTelemetry for tracing and metrics

---

## High-Level System

```text
Store Web Console ───────┐
                         │
Admin Web Console ───────┼──> Next.js Web Layer
                         │
                         └──> NestJS API Gateway / BFF (Fastify)
                                      │
                                      ├── Auth and Identity
                                      ├── RBAC and Permissions
                                      ├── Store Management
                                      ├── Catalog
                                      ├── Inventory
                                      ├── POS / Sales
                                      ├── Shipping
                                      ├── Billing and Subscription
                                      ├── Notifications
                                      ├── Support
                                      ├── Reports
                                      └── Audit and Admin
                                               │
                           ┌───────────────────┼────────────────────┐
                           │                   │                    │
                     PostgreSQL          Redis/Valkey        Object Storage
                           │                   │                    │
                           └───────────── Outbox / Jobs / Events ──┘
```

---

## Architecture Style

### Recommended Pattern

Use a **modular monolith** with strong domain boundaries.

Why this fits Phase 1:

- small team can move faster
- easier deployment and debugging than microservices
- still supports future extraction of high-load modules
- simpler transaction handling for POS, stock, approvals, and billing

### Internal Layering

Each backend module should follow this shape:

- `controller` or route layer
- `application` services for use cases
- `domain` layer for rules and policies
- `infrastructure` layer for database, queues, storage, and external adapters

### Monorepo Direction

Recommended workspace groups:

- `apps/store-web`
- `apps/admin-web`
- `apps/api`
- `packages/ui`
- `packages/config`
- `packages/types`
- `packages/auth`
- `packages/rbac`
- `packages/database`
- `packages/events`

---

## Phase 1 Modules

### 1. Identity and Access

Responsibilities:

- login, session, logout
- password and MFA-ready auth flows
- user profile basics
- tenant, store, and admin scoping
- role and permission checks
- audit-safe actor identity

Core concepts:

- `User`
- `Session`
- `StoreMembership`
- `AdminMembership`
- `Role`
- `Permission`

This module must support:

- store roles: `owner`, `manager`, `salesman`
- platform roles: `platform_owner`, `regular_admin`
- admin bundles: `operations_admin`, `finance_admin`, `support_admin`, `marketing_admin`

### 2. Store Management

Responsibilities:

- store creation and lifecycle
- store settings
- store staff invite and assignment
- store status changes
- receipt and branding settings

Core concepts:

- `Store`
- `StoreSetting`
- `StoreStaff`
- `StoreInvitation`

### 3. Catalog

Responsibilities:

- product creation and editing
- SKU and barcode management
- categories and brands
- pricing
- active/inactive product control
- media upload

Core rules:

- products are never hard-deleted
- products may be inactive, archived, or out of stock
- changes are store-scoped

Core concepts:

- `Category`
- `Brand`
- `Product`
- `SKU`
- `Price`
- `ProductMedia`

### 4. Inventory

Responsibilities:

- stock balances
- stock movement ledger
- stock adjustments
- approval requests
- low-stock alerts
- location-aware stock

Core rules:

- owner and manager can enter initial stock
- manager cannot freely change stock after initial entry
- manager changes after initial entry become `stock adjustment requests`
- owner must approve or reject those requests
- every stock change is ledger-backed

Core concepts:

- `InventoryLocation`
- `InventoryBalance`
- `InventoryLedgerEntry`
- `StockAdjustmentRequest`
- `StockApprovalDecision`

### 5. POS and Sales

Responsibilities:

- in-store sale creation
- item scanning and search
- cart calculation
- checkout and receipt
- return and exchange operations
- cashier activity and shift tracking

Core rules:

- POS must deduct from the same inventory system that Phase 2 online orders will use
- receipts must be reproducible
- all sales must be auditable

Core concepts:

- `Sale`
- `SaleItem`
- `SalePayment`
- `SaleReturn`
- `RegisterShift`
- `Receipt`

### 6. Shipping

Responsibilities:

- create delivery jobs
- track shipment states
- store delivery charges
- attach courier details
- support local courier integrations later

Core concepts:

- `Shipment`
- `ShipmentEvent`
- `CourierProvider`
- `DeliveryCharge`

### 7. Billing and Subscription

Responsibilities:

- store subscription tier assignment
- invoice generation
- renewal tracking
- subscription state changes
- billing status visibility for store owners and finance admins

Supported plans:

- `Basic`
- `Standard`
- `Pro`

Core concepts:

- `Subscription`
- `Plan`
- `Invoice`
- `BillingEvent`

### 8. Notifications and Communications

Responsibilities:

- in-app notifications
- email notifications
- SMS hooks
- admin announcement support
- approval and billing alerts

Core concepts:

- `Notification`
- `NotificationTemplate`
- `NotificationPreference`
- `OutboundMessage`

### 9. Support and Disputes

Responsibilities:

- internal support messaging
- dispute tickets
- store-admin communication
- support workflow tracking

Core concepts:

- `SupportTicket`
- `TicketMessage`
- `DisputeCase`
- `Attachment`

### 10. Reports and Analytics

Responsibilities:

- sales dashboards
- stock reports
- cashier reports
- billing reports
- export generation

Core rule:

- reports are generated from operational read models and aggregates, not from uncontrolled heavy joins in the UI path

Core concepts:

- `SalesSummary`
- `InventorySnapshot`
- `BillingSummary`
- `ExportJob`

### 11. Admin and Audit

Responsibilities:

- admin user control
- permission bundle assignment
- audit logs
- store approval workflows
- platform-level settings

Core concepts:

- `AdminUser`
- `AdminRoleBinding`
- `AuditLog`
- `PlatformSetting`

---

## Frontend Architecture

### Web Applications

Phase 1 uses two Next.js apps or two isolated route groups within one controlled workspace:

- `store-web`
- `admin-web`

### Frontend Module Layout

Suggested feature structure:

- `app/`
- `features/auth`
- `features/dashboard`
- `features/stores`
- `features/staff`
- `features/catalog`
- `features/inventory`
- `features/pos`
- `features/shipping`
- `features/billing`
- `features/reports`
- `features/support`
- `features/notifications`

### UI Principles

- workflow-first dashboard design
- keyboard-friendly POS interactions
- optimistic UI only where rollback is safe
- explicit loading and offline failure states
- Bangla and English text support from the start

### State Strategy

- server state with `TanStack Query`
- form state with `React Hook Form`
- local UI state with React state or lightweight client store
- no large client-side business logic duplication

---

## Backend API Design

### API Style

Use REST for Phase 1.

Why:

- predictable for business operations
- easier role-guard enforcement
- easier validation and audit logging
- better fit for POS, inventory, billing, and admin workflows

### API Versioning

Use `/v1` prefix from the start.

Example route groups:

- `/v1/auth`
- `/v1/stores`
- `/v1/store-staff`
- `/v1/catalog`
- `/v1/inventory`
- `/v1/stock-adjustments`
- `/v1/pos`
- `/v1/shipments`
- `/v1/subscriptions`
- `/v1/invoices`
- `/v1/support`
- `/v1/notifications`
- `/v1/reports`
- `/v1/admin`

### Realtime Channel

Use WebSocket or SSE for:

- stock changes
- stock approval status
- POS completion events
- notification counter refresh
- support ticket updates

Do not use realtime channels for everything. Keep reports and exports asynchronous.

---

## Data Domains

### Primary Shared Tables

Recommended Phase 1 core entities:

- `users`
- `user_sessions`
- `roles`
- `permissions`
- `role_permissions`
- `store_memberships`
- `admin_memberships`
- `stores`
- `store_settings`
- `products`
- `product_media`
- `skus`
- `prices`
- `inventory_locations`
- `inventory_balances`
- `inventory_ledger`
- `stock_adjustment_requests`
- `sales`
- `sale_items`
- `sale_payments`
- `sale_returns`
- `register_shifts`
- `shipments`
- `subscriptions`
- `invoices`
- `notifications`
- `support_tickets`
- `ticket_messages`
- `audit_logs`
- `outbox_events`

### Important Data Rules

- every mutable business action records `actor_id`
- every business record is tenant-aware and store-aware where applicable
- inventory is updated through controlled use cases only
- stock is not overwritten silently
- products are soft-state managed, not deleted
- financial records and invoices are append-safe

---

## Real-Time and Sync Rules

### Strongly Consistent Flows

These operations must complete transactionally:

- POS sale confirmation
- stock deduction
- stock approval decision
- sale return posting
- invoice state updates

### Near-Real-Time Flows

These can be event-driven after commit:

- notification delivery
- report refresh
- dashboard counters
- email/SMS sending
- export generation

### Core Sync Principle

One transaction updates the operational truth.
Then an outbox event publishes the change for secondary systems.

This prevents:

- double-selling
- out-of-sync reports
- missed approval alerts
- race conditions between POS and inventory

---

## Key Business Flows

### 1. Manager Requests Stock Change

```text
Manager submits stock correction
-> API validates role and stock state
-> creates stock_adjustment_request
-> sends owner notification
-> owner approves or rejects
-> if approved, inventory ledger entry is posted
-> stock balance updates
-> audit log written
```

### 2. POS Sale

```text
Cashier builds cart
-> API validates SKU availability
-> totals are calculated
-> payment method recorded
-> sale transaction committed
-> inventory ledger updated
-> receipt generated
-> outbox event created
-> dashboards and notifications update asynchronously
```

### 3. Store Subscription Renewal

```text
billing job finds due subscription
-> invoice created
-> owner notified
-> payment confirmed
-> subscription status updated
-> finance admins see updated billing state
```

### 4. Store Approval or Suspension

```text
operations admin reviews store
-> action submitted with reason
-> permission guard validates scope
-> store status updated
-> audit log written
-> store owner notified
```

---

## Security and Access Control

### Auth Requirements

- secure session management
- refresh token rotation or equivalent session hardening
- optional MFA-ready design
- device and IP metadata on sensitive actions

### Permission Enforcement

Enforce permissions at:

- route guard level
- application service level for critical actions
- frontend navigation level only as a convenience, never as the security boundary

### Sensitive Actions

Require explicit permission flags for:

- stock approval
- store suspension
- billing override
- invoice void
- mass notification broadcast
- admin user management
- platform settings changes

### Audit Requirements

Audit log every:

- login and logout
- role or permission change
- stock change request
- stock approval or rejection
- sale return
- subscription change
- store status change
- admin-level settings update

---

## Performance Guidelines

### Why Fastify

`Fastify` is the right HTTP engine for this project because:

- it performs well under high concurrency
- it is suitable for POS-style rapid request traffic
- it keeps JSON handling efficient
- it works cleanly with NestJS

### Performance Priorities for Phase 1

- fast POS search and checkout
- safe stock update concurrency
- responsive dashboard summaries
- low-latency permission checks
- controlled heavy-report generation

### Practical Performance Rules

- index all store-scoped lookup fields
- cache permission and session lookups carefully
- use background jobs for exports and bulk tasks
- avoid large live joins in dashboard endpoints
- paginate every administrative list

---

## Phase 2 Readiness

Phase 1 must be built so these Phase 2 additions fit naturally:

- public product pages
- customer cart
- online checkout
- customer orders
- marketplace reporting
- customer mobile app

That means the following must already be future-safe in Phase 1:

- shared stock ledger
- reusable pricing model
- reusable payment record model
- reusable reporting dimensions
- stable role and tenancy model

---

## Recommended Build Sequence

### Sprint Order

1. Identity, auth, RBAC, and audit
2. Store management and staff roles
3. Catalog and SKU model
4. Inventory ledger and stock approval flow
5. POS and receipt flow
6. Billing and subscriptions
7. Shipping
8. Reports and exports
9. Support and notifications
10. Admin hardening and pilot readiness

### Build Principle

Do not start with reports or advanced settings.
Start with the operational truth:

- users
- stores
- products
- stock
- sales
- billing

Everything else should attach to that core.

---

## Final Recommendation

For Phase 1, the best technical shape is:

- `Next.js` for store and admin web apps
- `NestJS + Fastify` for the backend
- `PostgreSQL` for transactional truth
- `Redis/Valkey` for speed and ephemeral state
- outbox/events for safe synchronization
- modular monolith for speed now and clean expansion later

This gives the team a fast implementation path without painting the platform into a corner before Phase 2.
