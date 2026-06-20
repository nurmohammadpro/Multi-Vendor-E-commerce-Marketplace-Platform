# Shipping Spec

## Scope

- shipment creation
- courier assignment
- shipment event tracking

## Core Tables

- `shipping.courier_providers`
- `shipping.shipments`
- `shipping.shipment_events`

## Endpoints

- `GET /v1/shipping/couriers`
- `POST /v1/shipping/shipments`
- `GET /v1/shipping/shipments`
- `GET /v1/shipping/shipments/:id`
- `POST /v1/shipping/shipments/:id/status`

## Rules

- shipment may attach to POS sale when delivery is needed
- delivery fee is stored on shipment
- status transitions are validated

## UI Screens

- shipment create form
- shipment list
- shipment detail timeline
