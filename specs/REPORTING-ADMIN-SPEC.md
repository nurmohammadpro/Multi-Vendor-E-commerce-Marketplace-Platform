# Reporting and Admin Spec

## Scope

- store reporting
- platform reporting
- admin dashboards
- audit views
- export jobs

## Core Tables

- `reporting.daily_store_sales`
- `reporting.daily_inventory_snapshots`
- `reporting.export_jobs`
- `audit.logs`

## Endpoints

- `GET /v1/reports/store/sales`
- `GET /v1/reports/store/inventory`
- `GET /v1/reports/platform/overview`
- `GET /v1/reports/platform/payments`
- `GET /v1/audit/logs`
- `POST /v1/reports/exports`

## Rules

- reports are read models, not raw transactional joins
- admin dashboard access is permission-based
- audit logs are immutable
- exports run asynchronously

## UI Screens

- store dashboard
- admin dashboard
- sales report
- inventory report
- audit log viewer
- export jobs panel
