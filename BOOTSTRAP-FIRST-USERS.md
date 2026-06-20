# Bootstrap First Users

## Purpose

This document explains how to create the first:

- tenant
- platform owner
- store owner
- store

using the bootstrap seed script.

## Files

- seed SQL: [database/seeds/0001_bootstrap.sql](/Users/nur/Documents/Multi-Vendor Platform/database/seeds/0001_bootstrap.sql:1)
- seed runner: [packages/database/src/seed.mjs](/Users/nur/Documents/Multi-Vendor Platform/packages/database/src/seed.mjs:1)

## Required Environment Variables

```bash
DATABASE_URL=postgresql://multivendor:password@localhost:5432/multivendor

BOOTSTRAP_TENANT_CODE=main
BOOTSTRAP_TENANT_NAME="Multi Vendor Platform"

BOOTSTRAP_PLATFORM_OWNER_NAME="Platform Owner"
BOOTSTRAP_PLATFORM_OWNER_EMAIL="owner@example.com"
BOOTSTRAP_PLATFORM_OWNER_PHONE="01700000000"
BOOTSTRAP_PLATFORM_OWNER_PASSWORD="ChangeThisOwnerPassword123"

BOOTSTRAP_STORE_OWNER_NAME="Store Owner"
BOOTSTRAP_STORE_OWNER_EMAIL="store@example.com"
BOOTSTRAP_STORE_OWNER_PHONE="01800000000"
BOOTSTRAP_STORE_OWNER_PASSWORD="ChangeThisStorePassword123"

BOOTSTRAP_STORE_CODE=STORE-001
BOOTSTRAP_STORE_NAME="Demo Store"
BOOTSTRAP_STORE_NAME_BN="ডেমো স্টোর"
BOOTSTRAP_STORE_SLUG=demo-store
BOOTSTRAP_STORE_PHONE="01800000000"
BOOTSTRAP_STORE_EMAIL="store@example.com"
BOOTSTRAP_STORE_TIMEZONE=Asia/Dhaka
BOOTSTRAP_STORE_LOCALE=en
```

## Run Order

1. run migrations
2. run bootstrap seed

```bash
npm run db:migrate
npm run db:seed:bootstrap
```

## What It Creates

- one tenant in `platform.tenants`
- one platform owner in `identity.users`
- one platform owner profile
- one admin membership with `platform_owner`
- one store owner in `identity.users`
- one store owner profile
- one store in `store.stores`
- one store settings row
- one active store membership with `store_owner`
- one default inventory location: `MAIN`
- one default POS register: `REG-01`
- three default courier providers: `pathao`, `steadfast`, `redx`
- three default billing plans: `basic`, `standard`, `pro`

## Idempotency

The script is designed to be safe for repeat runs when using the same bootstrap values.

Expected behavior:

- tenant updates by `code`
- platform owner updates by `email`
- store owner updates by `email`
- store updates by `slug`

## Recommended Next Steps

After bootstrap:

1. verify platform owner login
2. verify store owner login
3. verify `/v1/auth/contexts`
4. create the first manager and salesman through staff flows later
