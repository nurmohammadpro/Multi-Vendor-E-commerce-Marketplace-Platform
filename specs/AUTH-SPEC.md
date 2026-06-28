# Auth Spec

## Goal

Provide one shared authentication system for admin, store, and later customer users.

## Identity Model

- source table: `identity.users`
- session table: `identity.user_sessions`
- optional MFA table: `identity.user_mfa_methods`

## Login Entry Points

- `admin.yourdomain.com/login`
- `app.yourdomain.com/login`
- customer login later

## Backend Endpoints

- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `POST /v1/auth/refresh`
- `POST /v1/auth/forgot-password`
- `POST /v1/auth/reset-password`
- `POST /v1/auth/mfa/verify`
- `GET /v1/auth/me`
- `GET /v1/auth/contexts`
- `POST /v1/auth/select-context`

## Login Response

Return:

- user identity
- available contexts
- session metadata

Example:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Jane Doe"
  },
  "contexts": [
    { "type": "admin", "roles": ["regular_admin"] },
    { "type": "store", "storeId": "uuid", "roles": ["store_owner"] }
  ]
}
```

## Session Rules

- rotate refresh tokens
- revoke session on logout
- track `ip_address`, `user_agent`, `device_label`
- support multiple active sessions
- password reset tokens expire and are single-use
- MFA verification should be challenge-based, not frontend-only

## MFA Policy

Required for:

- `platform_owner`
- `regular_admin`
- `finance_admin`

Optional first release:

- store owner
- store manager

## Password Policy

- minimum 10 characters
- bcrypt or argon2 hashing
- reset tokens expire
- login throttling via Redis

## Guards

- login only checks identity
- app entry checks membership context
- every protected route revalidates context server-side
