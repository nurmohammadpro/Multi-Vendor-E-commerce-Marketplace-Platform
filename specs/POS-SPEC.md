# POS Spec

## Scope

- cart build
- barcode search
- checkout
- receipt
- returns
- register shifts
- local print integration

## Core Tables

- `sales.registers`
- `sales.register_shifts`
- `sales.sales`
- `sales.sale_items`
- `sales.sale_payments`
- `sales.sale_returns`
- `sales.sale_return_items`

## Endpoints

- `GET /v1/pos/registers`
- `GET /v1/pos/catalog/search`
- `POST /v1/pos/shifts/open`
- `POST /v1/pos/shifts/:id/close`
- `POST /v1/pos/sales`
- `GET /v1/pos/sales/:id`
- `POST /v1/pos/sales/:id/reprint`
- `POST /v1/pos/sales/:id/returns`

## Transaction Rules

sale commit must atomically:

- create sale header
- create sale items
- create payment rows
- write inventory ledger rows
- update inventory balances
- create outbox event

## UI Screens

- POS terminal
- cashier shift open/close
- sale success modal
- receipt reprint
- returns form

## Hardware Rules

- scanner uses `USB HID`
- receipt printer uses localhost print agent
- label printer uses localhost print agent
- print failure must not block completed sale
- barcode lookup should be exact-match first, then fallback to text search
- reprint should return structured receipt data for the local print agent
