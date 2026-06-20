# Deployment Stack — Phase 1

## Recommended Stack

For Phase 1, the best production setup is:

- `Hostinger VPS`
- `Easypanel` for server and service management
- `docker compose` as the canonical deployment definition
- `PostgreSQL 17` as the main database
- `Redis` for caching, sessions, and fast state
- `MinIO` or S3-compatible object storage for uploads and exports
- `pgAdmin` for admin access
- scheduled PostgreSQL backups

The compose file is available at [deploy/docker-compose.phase1.yml](/Users/nur/Documents/Multi-Vendor%20Platform/deploy/docker-compose.phase1.yml:1) and the environment template is at [deploy/.env.phase1.example](/Users/nur/Documents/Multi-Vendor%20Platform/deploy/.env.phase1.example:1).

---

## Important Architecture Rule

The VPS hosts:

- API
- store web app
- admin web app
- database
- cache
- object storage
- backups

The VPS does **not** directly control production POS printers or barcode scanners.

Professional POS hardware support depends on a **local workstation layer** in the store.

That means:

- receipt printing happens from the cashier or manager PC
- label printing happens from the local workstation
- barcode scanning happens on the local workstation
- silent printing depends on a local print agent, not on the VPS

---

## POS Hardware Model

Based on the AxiomPos hardware docs, the safe support model should be:

- `ESC/POS-compatible` 80mm receipt printers
- desktop label printers installed in the operating system
- `USB HID` barcode scanners with `Enter` suffix
- local print agent for silent printing

### Certified Direction

Receipt printers:

- `Xprinter XP-Q80A`
- `Xprinter XP-E200L`

Label printers:

- `Xprinter XP-420B`
- `TSC TE244`

Barcode scanners:

- `Zebra DS2208`

### Important Support Boundary

Do not promise plug-and-play support for:

- Bluetooth-only barcode scanners
- serial-only scanners
- non-ESC/POS receipt printers
- random Android POS peripherals
- mobile mini receipt printers

---

## How Hardware Actually Integrates

### Barcode Scanners

Barcode scanners should work in `USB HID keyboard mode`.

That means:

- they behave like keyboards
- they type into the focused POS input
- no backend integration is required
- no browser extension is required

### Receipt Printers

Receipt printers should print through a **local print agent** on the cashier PC.

Expected flow:

```text
Store Web POS -> http://127.0.0.1:17658 -> local print agent -> installed ESC/POS receipt printer
```

Why:

- browsers and PWAs cannot silently print reliably by themselves
- ESC/POS raw bytes are needed for feed, cut, and drawer commands
- the print agent gives professional receipt behavior

### Label Printers

Label printers should also use the local workstation path.

Expected flow:

```text
Store Web barcode/label action -> local print agent or local print path -> installed label printer
```

This is especially important for:

- barcode labels
- shelf labels
- product labels

### Cash Drawer

If used, the drawer-open signal should be treated as part of the receipt printer integration.

That means:

- the ESC/POS printer profile must be compatible
- drawer open should be part of the hardware certification checklist

---

## Store Workstation Recommendation

For a professional store counter setup, recommend:

- Windows workstation for cashier/manager station
- one certified `80mm ESC/POS` receipt printer
- one certified `USB HID` barcode scanner
- one supported label printer where barcode labels are needed
- local `Node.js` print agent installed to start automatically on login

Recommended default bundle:

- `Xprinter XP-Q80A`
- `Xprinter XP-420B`
- `Zebra DS2208`

This matches the lowest-risk setup from the AxiomPos hardware matrix.

---

## VPS Deployment Layout

### Core Services

The production compose stack currently includes:

- `postgres`
- `redis`
- `pgadmin`
- `minio`
- `postgres_backup`
- `api`
- `store_web`
- `admin_web`

### Service Notes

`postgres`

- main transactional database
- stores all application data
- should use persistent volume

`redis`

- sessions
- caching
- rate limiting
- short-lived workflow state

`minio`

- product images
- exports
- attachments
- generated artifacts

`postgres_backup`

- scheduled database backups
- should be extended later to remote S3-compatible backup retention

`api`

- `NestJS + Fastify`
- business rules, auth, inventory, POS, billing, hardware job coordination endpoints

`store_web`

- Next.js app for store owners, managers, and salesmen

`admin_web`

- Next.js app for platform owner and regular admins

---

## Easypanel Usage Recommendation

Use `Easypanel` as the VPS control layer, but keep `docker compose` as the source of truth.

Best approach:

- store the compose file in git
- store the environment values in Easypanel secrets or protected env vars
- deploy app images or repo-based builds through Easypanel
- keep the database volumes persistent and backed up

This gives you:

- reproducible infrastructure
- easier rollback
- easier migration to another VPS later

---

## Networking Recommendation

Use a reverse proxy at the VPS edge.

Preferred public domains:

- `api.yourdomain.com`
- `app.yourdomain.com`
- `admin.yourdomain.com`

Do not expose these publicly unless needed:

- PostgreSQL
- Redis
- MinIO internal endpoint

Only expose:

- public app domains
- admin if needed
- pgAdmin only behind strict protection or VPN/IP allowlist

---

## Database Recommendation

For Phase 1, use:

- plain self-hosted `PostgreSQL 17`
- the migration set in [database/migrations](/Users/nur/Documents/Multi-Vendor%20Platform/database/migrations)

Do not start with full self-hosted Supabase unless you clearly need:

- Supabase Auth
- Supabase Storage API
- Supabase Realtime
- Supabase Studio

Because on one VPS, full self-hosted Supabase adds more services and more operational overhead than plain PostgreSQL.

The current plan should stay:

- PostgreSQL-first
- Supabase-compatible
- optional Supabase services later

---

## Operational Advice

### For Production

- use strong passwords and secret management
- enable automated backups
- test backup restore before launch
- protect pgAdmin
- monitor disk usage carefully
- keep receipt printing local, not server-side

### For POS Reliability

- certify hardware before promising support
- standardize a default printer/scanner bundle
- test barcode scanning in browser inputs
- test silent printing on Windows cashier PCs
- test receipt cut/feed behavior on certified devices
- test label alignment before rollout

---

## Final Recommendation

The correct system model is:

- server-side commerce platform on the VPS
- local hardware execution on store workstations

So the full professional POS stack becomes:

```text
Hostinger VPS + Easypanel + Docker Compose
for platform infrastructure

and

Windows cashier workstation + local print agent + certified ESC/POS printer + USB HID scanner
for store counter hardware
```

That is the safest way to make the POS genuinely production-ready.
