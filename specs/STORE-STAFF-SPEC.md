# Store and Staff Spec

## Scope

- create store
- update store settings
- invite staff
- assign roles
- activate/suspend staff

## Core Tables

- `store.stores`
- `store.store_settings`
- `store.store_invitations`
- `access.store_memberships`

## Endpoints

- `POST /v1/stores`
- `GET /v1/stores/:id`
- `PATCH /v1/stores/:id`
- `GET /v1/stores/:id/settings`
- `PATCH /v1/stores/:id/settings`
- `POST /v1/stores/:id/invitations`
- `POST /v1/staff/invitations/:token/accept`
- `GET /v1/stores/:id/staff`
- `PATCH /v1/stores/:id/staff/:membershipId`

## Rules

- only store owner can manage billing and gateway settings
- store owner and manager can invite staff
- invited role must be valid store role
- one active membership per user per store

## UI Screens

- store profile
- store settings
- staff list
- invite staff modal
- membership detail / suspend action
