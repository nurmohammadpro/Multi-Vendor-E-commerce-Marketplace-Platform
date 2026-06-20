# Support and Notifications Spec

## Scope

- internal support tickets
- dispute handling
- notification templates
- user notifications
- platform broadcasts

## Core Tables

- `support.tickets`
- `support.ticket_messages`
- `comms.notification_templates`
- `comms.notifications`
- `comms.broadcasts`

## Endpoints

- `GET /v1/support/tickets`
- `POST /v1/support/tickets`
- `GET /v1/support/tickets/:id`
- `POST /v1/support/tickets/:id/messages`
- `GET /v1/notifications`
- `POST /v1/admin/broadcasts`

## Rules

- support admins manage ticket workflows
- platform owner and regular admins may access support by permission
- broadcasts require explicit permission
- notification delivery is asynchronous

## UI Screens

- support inbox
- ticket detail
- notification center
- broadcast compose screen
