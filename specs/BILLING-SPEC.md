# Billing Spec

## Scope

- plans
- store subscriptions
- invoices
- invoice payments

## Core Tables

- `billing.plans`
- `billing.subscriptions`
- `billing.invoices`
- `billing.invoice_payments`

## Endpoints

- `GET /v1/billing/plans`
- `GET /v1/billing/subscription`
- `POST /v1/billing/subscription/change`
- `GET /v1/billing/invoices`
- `GET /v1/billing/invoices/:id`
- `POST /v1/billing/invoices/:id/payments`

## Rules

- plans: `basic`, `standard`, `pro`
- feature gating is backend-enforced
- invoices are append-safe
- finance admins can monitor all subscription payments
- store owner manages own subscription context

## UI Screens

- plan compare page
- current subscription
- invoice list
- invoice detail
- payment status
