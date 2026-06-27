# Easypanel Deployment Notes

This repo is designed to run in two modes:

- **Dev mode** on your workstation
- **Live mode** on the Hostinger KVM2 VPS through Easypanel

Keep the environments separate:

- `deploy/.env.dev.example` for local development
- `deploy/.env.prod.example` for production
- a different `COMPOSE_PROJECT_NAME` for each stack

## Local Dev

1. Copy `deploy/.env.dev.example` to the repo root as `.env`.
2. Start the apps with `npm run dev`.
3. Seed the database after Postgres is available:
   - `npm run db:migrate`
   - `npm run db:seed:bootstrap`

## Easypanel Live Stack

1. Create a new Easypanel project named something like `multi-vendor-prod`.
2. Choose **Docker Compose** as the app type.
3. Point Easypanel at the repository root and set the compose file path to `docker-compose.yml`.
4. Paste the production variables from `deploy/.env.prod.example` into the Easypanel environment panel.
5. Make sure the persistent volumes exist for:
   - `postgres`
   - `redis`
   - `minio`
   - `pgadmin` if you keep it enabled
6. Deploy the stack.
7. Attach your domains or reverse proxy rules to:
   - `api.yourdomain.com`
   - `admin.yourdomain.com`
   - `store.yourdomain.com`
   - `app.yourdomain.com`

### Exact Easypanel Import Shape

Use these values when Easypanel asks for the compose source:

- **Repository**: your Git repo for this project
- **Compose file**: `docker-compose.yml`
- **Working directory**: repository root
- **Project name**: `multi-vendor-prod`
- **Build context**: repository root

Then set the public env vars:

- `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `PGADMIN_DEFAULT_PASSWORD`
- `DATABASE_URL`
- `APP_URL`
- `API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_ADMIN_APP_URL`
- `NEXT_PUBLIC_STORE_APP_URL`
- `BOOTSTRAP_PLATFORM_ADMIN_EMAIL`
- `BOOTSTRAP_PLATFORM_ADMIN_PASSWORD`

## Suggested VPS Layout

- `prod` stack on the public domains
- optional `dev` stack on separate internal ports or a separate subdomain
- separate database volume and database name per stack
- separate admin passwords per stack

## Recommended Commands

Local:

```bash
docker compose --env-file .env up -d postgres redis minio
npm run db:migrate
npm run db:seed:bootstrap
```

Production:

```bash
docker compose --env-file .env.prod -p mvp-prod up -d
```

## Notes

- The API expects `DATABASE_URL`.
- The Next.js apps expect the `NEXT_PUBLIC_*` URLs.
- The bootstrap admin password is controlled by `BOOTSTRAP_PLATFORM_ADMIN_PASSWORD`.
- The single canonical Compose file is `docker-compose.yml` at the repository root.
