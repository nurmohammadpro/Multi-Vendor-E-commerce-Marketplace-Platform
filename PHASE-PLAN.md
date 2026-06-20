# Multi-Vendor Ecommerce Platform — Phase Plan

## Overview

Bangladesh-first commerce platform with a phased rollout:

- **Phase 1:** store operating system for vendors and platform admins
- **Phase 2:** customer marketplace, online ordering, and customer mobile app
- **Core principle:** one shared commerce core so POS sales now and online sales later deduct from the same stock
- **Architecture:** modular monolith with event-driven boundaries and real-time sync where operationally needed

### Recommended Stack

- **Web app:** Next.js App Router, TypeScript, Tailwind CSS, TanStack Query, WebSocket/SSE for live updates
- **Backend:** NestJS with Fastify, domain services, PostgreSQL, Redis/Valkey, object storage, queue/outbox
- **Mobile app:** Flutter for the **customer app only** in Phase 2
- **Search:** PostgreSQL search first for Phase 1 if budget is tight; OpenSearch when marketplace discovery grows
- **Infra:** Docker, GitHub Actions, AWS or a similar cloud, CDN, WAF, OpenTelemetry

### Delivery Direction

- **Phase 1 now:** web-first for stores and admin
- **Phase 2 later:** customer web marketplace + customer mobile app
- **Not in current scope:** store mobile app

---

## Phase 1 — Store Operating System (NOW)

This phase is for store owners, store staff, and platform admins. No customer marketplace yet.

### Platform Foundation

- Monorepo with clear domain modules
- Multi-tenant design using `tenant_id`, `store_id`, and role scoping
- Authentication with MFA-ready sessions and audit logs
- NestJS API layer running on Fastify for high-performance request handling
- RBAC with store-level and admin-level permissions
- API versioning, validation, rate limiting, error standards
- Event/outbox pattern for stock, sales, payments, notifications, and reports
- CI/CD, backups, observability, and security baseline
- Bangla + English support

### Store Roles and Permissions

Each store has three user types:

- **Owner:** full access to store operations, staff, approvals, billing, payment settings, and reports
- **Manager:** broad operational access, but restricted for approval-gated actions
- **Salesman:** can view stock, create sales, and view assigned reports only

#### Permission Model

| Capability | Owner | Manager | Salesman |
|---|:---:|:---:|:---:|
| Store settings | Yes | Limited | No |
| Staff management | Yes | Limited | No |
| Product create/edit | Yes | Yes | No |
| Product deactivate/reactivate | Yes | Yes | No |
| Product delete | No | No | No |
| Initial stock entry | Yes | Yes | No |
| Direct stock adjustment | Yes | Conditional | No |
| Stock adjustment approval | Yes | No | No |
| POS sales | Yes | Yes | Yes |
| Sales reports | Yes | Yes | Limited |
| Billing/subscription | Yes | No | No |
| Payment gateway config | Yes | No | No |

### Platform Admin Levels

The platform should have two admin levels:

- **Platform Owner:** highest authority across the whole platform, with full control over platform settings, admin users, billing rules, support policy, and strategic approvals
- **Regular Admin:** operational admin with controlled access to daily platform management features

Regular admins can also be assigned narrower functional roles so access stays safe as the team grows.

#### Admin Permission Model

| Capability | Platform Owner | Regular Admin |
|---|:---:|:---:|
| Platform settings | Yes | Limited |
| Admin user management | Yes | No |
| Store approval/suspension | Yes | Yes |
| Subscription plan management | Yes | Limited |
| Payment monitoring | Yes | Yes |
| Refund/dispute supervision | Yes | Yes |
| Reports and dashboards | Yes | Yes |
| Notification management | Yes | Yes |
| Email/SMS management | Yes | Yes |
| Support operations | Yes | Yes |
| Audit log access | Yes | Yes |
| Permanent platform-level policy changes | Yes | No |

### Functional Admin Roles

Under the `Regular Admin` level, the platform can define functional admin roles. These are permission bundles, not separate ownership tiers.

- **Operations Admin:** manages store onboarding, approvals, suspensions, catalog governance, and operational workflows
- **Finance Admin:** manages subscriptions, payment monitoring, billing issues, payout visibility, and financial reports
- **Support Admin:** manages support tickets, internal chat, dispute handling, and communication workflows
- **Marketing/Admin Communications:** manages notifications, email/SMS campaigns, and platform-wide announcements

#### Functional Admin Scope

| Capability | Operations Admin | Finance Admin | Support Admin | Marketing/Admin Communications |
|---|:---:|:---:|:---:|:---:|
| Store approvals | Yes | No | No | No |
| Store suspension review | Yes | No | Yes | No |
| Catalog moderation | Yes | No | No | No |
| Subscription plans usage view | Yes | Yes | No | No |
| Subscription billing actions | No | Yes | No | No |
| Payment monitoring | No | Yes | No | No |
| Refund/dispute handling | Limited | Yes | Yes | No |
| Reports access | Operational | Financial | Support | Campaign |
| Notification sending | No | No | Yes | Yes |
| Email/SMS campaign tools | No | No | Limited | Yes |
| Support inbox/chat | Limited | No | Yes | Limited |
| Global settings changes | No | No | No | No |

#### RBAC Recommendation

- Keep `Platform Owner` as the only unrestricted platform role
- Keep `Regular Admin` as the base admin identity level
- Assign one or more functional permission bundles to each regular admin
- Use explicit permission flags for sensitive actions such as suspension, billing overrides, refunds, and message broadcast
- Log every admin action in the audit trail

### Store and Staff Management

- Store creation, activation, suspension, and lifecycle controls
- Staff invite, role assignment, permission templates, activity log
- Multi-store owner support for future growth
- Store settings: timezone, invoices, receipt branding, policies, notification preferences

### Catalog and Product Rules

- Products can be created once and updated, but **cannot be permanently deleted**
- Products may become `inactive`, `archived`, or `out_of_stock`
- Product lifecycle supports review and moderation if needed
- SKU, barcode, price, unit, weight, variant, and image support
- Bulk import and controlled updates

### Inventory and Stock Governance

- Unified stock ledger per store and location
- Inventory balances: `on_hand`, `reserved`, `available`, `damaged`, `returned`
- Owner and manager can perform the **initial stock entry**
- After the first stock entry, a manager cannot freely overwrite stock
- Any subsequent manager stock correction must create a **stock adjustment request**
- Owner approves or rejects the stock adjustment request
- Every stock movement stays in an immutable inventory ledger
- Salesman can view stock and sell, but cannot adjust stock directly
- Low-stock alerts and stock history by SKU/location

### POS and Store Sales

POS must be part of Phase 1.

- In-store POS checkout
- Barcode search/manual search/customer-less quick sale
- Cash, COD-like local collection, bank transfer, and gateway-backed payment support
- Receipt generation and reprint
- Shift opening/closing and cashier activity log
- Day-end sales report and drawer summary
- Returns/exchanges flow for store sales
- POS sales deduct from the same stock ledger used by future online sales

### Orders and Sales Architecture

Phase 1 uses one sales core even before the public marketplace exists.

- `sales` domain handles POS transactions now
- `orders` domain can be introduced in a marketplace-ready way
- Shared stock reservation and deduction engine
- Shared payment event model
- Shared reporting model

This prevents rebuilding stock and reporting logic in Phase 2.

### Payments and Billing

- Store subscription billing
- Store-owned payment gateway configuration
- Payment collection records for POS and future online sales
- Invoicing, renewal tracking, overdue handling
- Admin payment monitoring

### Shipping

Shipping is included in Phase 1 because stores may need fulfillment operations even before the public marketplace.

- Delivery order creation
- Courier assignment
- Shipment status tracking
- Delivery fee capture
- Delivery reporting

### Reports and Analytics

- Daily sales, weekly sales, monthly sales
- Product-wise and category-wise performance
- Stock movement and stock aging
- Cashier/salesman performance reports
- Expense-ready reporting hooks for later accounting modules
- Export to CSV/PDF

### Internal Communication and Support

- Internal support/chat between store and admin/support team
- Notifications for stock approvals, subscription events, payment events, and operational alerts
- Email and SMS hooks where applicable

### Admin Console Features

The admin panel in Phase 1 should explicitly include:

- Dashboard
- Store Management
- Payments
- Reports
- Notifications
- Emails or SMS management
- Support
- Settings

Admin access inside this panel must be permission-scoped so regular admins operate daily workflows while the platform owner keeps full strategic and configuration control.

Recommended admin navigation groups:

- Dashboard
- Store Operations
- Payments and Billing
- Reports
- Notifications
- Email/SMS
- Support and Disputes
- Settings

### Phase 1 Applications

- **Store Web Console:** dashboard, catalog, inventory, POS, shipping, reports, billing, staff, settings
- **Admin Web Console:** dashboard, store approvals, subscriptions, payments, reports, notifications, support, settings
- **No store mobile app in Phase 1**

---

## Subscription Model for Stores

### Basic

- Stock
- POS
- Shipping
- Reports and analytics
- Billing
- Own payment gateway
- Dispute management
- Internal support and chat
- Settings

### Standard

Everything in Basic, plus:

- Daily expenses
- HR
- Payroll

### Pro

Everything in Standard, plus:

- Banking
- Full accounting
- Income tracking
- Liability tracking
- Loan tracking
- Asset tracking
- Expanded financial reports

### Subscription Notes

- Start Phase 1 with **Basic, Standard, and Pro**
- Keep enterprise customization as a later commercial layer, not as a launch dependency
- Feature gating should happen at module level, not only page level

---

## Phase 2 — Customer Marketplace (LATER)

Phase 2 adds the buyer side of the platform on top of the same store, stock, payment, and reporting core.

### Customer Experience

- Public storefronts
- Product discovery and search
- Cart and checkout
- Customer accounts and addresses
- Reviews, wishlist, chat, and order tracking
- Marketplace campaigns and promotions

### Customer Applications

- **Customer Web App / PWA** for acquisition and checkout
- **Customer Mobile App** for retention, repeat purchase, notifications, and engagement

### Shared Core Rule

When Phase 2 is implemented:

- POS sales and online marketplace sales both deduct from the same stock
- Reporting combines offline and online sales
- Payment records remain normalized in one finance layer
- Product activation state stays shared across store and marketplace

---

## Corrected Scope Summary

| Area | Phase 1 (Now) | Phase 2 (Later) |
|---|:---:|:---:|
| Store roles and permissions | Full | Shared |
| Product and stock management | Full | Shared |
| POS and in-store sales | Full | Shared |
| Shared stock deduction engine | Full | Shared |
| Store subscription billing | Full | Shared |
| Admin operations | Full | Shared |
| Shipping operations | Full | Shared |
| Customer marketplace | No | Full |
| Customer checkout | No | Full |
| Customer mobile app | No | Full |
| Store mobile app | No | No |

---

## Recommended Build Order for Phase 1

| Stage | Duration | Key Outputs |
|---|---|---|
| Foundation | Weeks 1-5 | Auth, tenancy, roles, audit, core app shell |
| Store Core | Weeks 6-10 | Store management, staff roles, product catalog |
| Inventory Core | Weeks 11-15 | Stock ledger, stock approvals, low-stock alerts |
| POS and Payments | Weeks 16-21 | POS flows, receipts, cashier logs, billing basics |
| Shipping and Reports | Weeks 22-26 | Shipment workflows, dashboards, exports |
| Admin and Subscription | Weeks 27-31 | Admin panel, store subscriptions, notifications, support |
| QA and Pilot | Weeks 32-36 | UAT, security hardening, pilot launch |

---

## Architecture Notes for Real-Time Sync

- Operational actions such as stock deduction, POS completion, approval decisions, and payment status should update immediately
- Reports, dashboards, and analytics can be near-real-time rather than truly synchronous everywhere
- Use transactional writes plus events/outbox to keep the system consistent without making the whole platform slow
- Treat inventory, payments, and approvals as strongly consistent workflows
- Treat notifications, exports, and analytics as asynchronous workflows

This gives a fast interface without forcing every subsystem into expensive hard real-time behavior.
