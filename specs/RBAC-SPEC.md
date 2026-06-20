# RBAC Spec

## Core Principle

Authentication proves who the user is.
Authorization proves what the user can do in a specific app context.

## Role Model

### Store Roles

- `store_owner`
- `store_manager`
- `store_salesman`

### Platform Roles

- `platform_owner`
- `regular_admin`

### Admin Bundles

- `operations_admin`
- `finance_admin`
- `support_admin`
- `marketing_admin`

## Permission Groups

- auth
- store
- catalog
- inventory
- sales
- billing
- shipping
- support
- notifications
- admin
- reporting

## High-Value Permissions

- `inventory.adjust.direct`
- `inventory.adjust.request`
- `inventory.adjust.approve`
- `sales.pos.create`
- `catalog.manage`
- `store.staff.manage`
- `billing.subscription.manage`
- `payment.gateway.manage`
- `platform.store.review`
- `platform.payment.monitor`
- `platform.broadcast.send`
- `platform.admin.manage`

## Store Permission Matrix

### Store Owner

- full store operations
- approve/reject stock changes
- manage staff
- manage billing
- manage payment gateway

### Store Manager

- manage products
- manage initial stock
- request stock changes after initialization
- create POS sales
- view reports
- no billing control
- no gateway control

### Store Salesman

- create POS sales
- view stock
- view assigned reports
- no stock adjustment
- no product management

## Admin Permission Matrix

### Platform Owner

- full platform settings
- admin user management
- all reports
- all support, finance, and store oversight

### Regular Admin

- operational admin access only
- no platform ownership changes
- no top-level admin provisioning without permission

## Guard Strategy

- route guard
- service guard
- UI navigation guard

## Claims

Recommended session claims:

- `user_id`
- `tenant_id`
- `active_context_type`
- `active_store_id`
- `role_codes`
- `permission_codes`

## Audit Events

- login
- context selection
- role assignment
- permission bundle assignment
- store suspension
- stock approval
- billing override
- broadcast send
