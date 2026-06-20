# Inventory Spec

## Scope

- locations
- balances
- ledger
- stock adjustments
- owner approval flow

## Core Tables

- `inventory.locations`
- `inventory.balances`
- `inventory.ledger`
- `inventory.stock_adjustment_requests`
- `inventory.stock_initializations`

## Endpoints

- `GET /v1/inventory/locations`
- `POST /v1/inventory/locations`
- `GET /v1/inventory/balances`
- `POST /v1/inventory/initialize`
- `POST /v1/inventory/adjustments/request`
- `GET /v1/inventory/adjustments`
- `POST /v1/inventory/adjustments/:id/approve`
- `POST /v1/inventory/adjustments/:id/reject`
- `GET /v1/inventory/ledger`

## Rules

- first stock entry allowed for owner and manager
- after first initialization, manager must request changes
- owner can directly adjust and approve
- every stock change writes to ledger
- sale commit deducts from inventory in one transaction

## UI Screens

- stock overview
- location manager
- stock initialization form
- stock adjustment request form
- owner approval queue
- stock history / ledger view
