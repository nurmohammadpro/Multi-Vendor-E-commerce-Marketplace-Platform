# Auth Strategy

## Short Answer

Use **one global identity system** for all users, but **separate login experiences and access pipelines by role context**.

That means:

- one shared `users` table
- one shared authentication engine
- one shared session/token model
- one shared password reset and MFA foundation

But:

- separate admin login UI
- separate store login UI
- separate customer login UI later
- separate post-login routing and permission checks

This is the best balance of simplicity, security, and future flexibility.

---

## Recommendation

### Use One Identity Core

All human users should live in the same identity system.

Examples:

- platform owner
- regular admin
- operations admin
- finance admin
- support admin
- store owner
- store manager
- store salesman
- customer

Why this is better:

- one account can hold multiple roles later
- easier password reset and MFA management
- easier audit logging
- easier invitation handling
- easier future cross-role workflows

Example future scenario:

- a person can be a `store_owner`
- and also a `regular_admin`
- and later maybe a `customer`

If you split identity systems completely, that becomes painful very quickly.

---

## What Should Be Separate

### 1. Login Entry Points

Use different login pages:

- `admin.yourdomain.com/login`
- `app.yourdomain.com/login`
- later customer login on marketplace domain

Why:

- clearer UX
- better security messaging
- lower confusion
- role-specific flows

### 2. Access Pipelines

After login, determine the user context.

Examples:

- admin login checks `admin_memberships`
- store login checks `store_memberships`
- customer login later checks customer account status

So the identity is shared, but authorization is context-aware.

### 3. Session Guards

Even if the same person exists in one `users` table, sessions should still be enforced by app boundary.

Example:

- admin app session should only open if the user has active admin access
- store app session should only open if the user has active store membership

---

## Recommended Model

### Identity Layer

- shared `identity.users`
- shared `identity.user_sessions`
- shared `identity.user_mfa_methods`

### Authorization Layer

- `access.store_memberships`
- `access.admin_memberships`
- `access.admin_bundle_assignments`
- later customer profile/account tables

### App Context Layer

At login success, the backend returns available contexts, for example:

```json
{
  "userId": "uuid",
  "contexts": [
    {
      "type": "admin",
      "roles": ["regular_admin", "finance_admin"]
    },
    {
      "type": "store",
      "storeId": "uuid",
      "roles": ["store_owner"]
    }
  ]
}
```

Then the frontend routes the user into the correct application context.

---

## Why Not Fully Separate Login Systems

Do **not** create fully isolated auth databases or auth engines for:

- admins
- store users
- customers

unless you have a very strong regulatory or enterprise reason.

Why not:

- duplicate auth logic
- duplicate password reset flows
- duplicate session management
- harder auditing
- messy multi-role users
- harder future migrations

For this project, that would create unnecessary complexity.

---

## Recommended Flow by User Type

### Admin Flow

```text
admin enters admin login
-> identity auth succeeds
-> backend checks active admin_membership
-> backend loads base role + admin bundles
-> admin session created
-> user routed to admin console
```

### Store User Flow

```text
store user enters store login
-> identity auth succeeds
-> backend checks active store membership
-> backend loads store role and store context
-> store session created
-> user routed to store console
```

### Customer Flow Later

```text
customer signs in on marketplace
-> identity auth succeeds
-> backend checks customer profile/account state
-> customer session created
-> user routed to customer app
```

---

## Security Recommendation

### Strongest Option

Use one auth engine with **context-aware session claims**.

Example claims:

- `user_id`
- `tenant_id`
- `active_app_context`
- `store_ids`
- `admin_roles`

Do not trust frontend role selection alone.
The backend must validate active context on every protected request.

### MFA

Require stronger auth for:

- platform owner
- regular admins
- finance admins
- store owners later if needed

Salesmen can start with password login, but the model should remain MFA-ready.

---

## Product UX Recommendation

### Best UX

Use separate branded login pages, but keep the backend identity shared.

This avoids confusing users.

Examples:

- admin sees admin login
- store user sees store login
- customer later sees customer login

Even if technically one account can hold multiple roles, the UI does not need to expose everything at once.

If a person has multiple contexts, the app can show:

- `Continue as Admin`
- `Continue as Store Owner`

after authentication.

---

## Build Order Recommendation

Yes, you should prioritize:

1. database
2. auth and RBAC
3. backend core modules
4. then frontend application work

Why:

- frontend depends on stable permissions
- POS, inventory, and billing screens depend on backend rules
- auth mistakes are expensive to change later
- stock approval and role rules must be enforced server-side first

### Better Practical Order

Not pure backend-only for months.
Do it in vertical slices:

1. database foundation
2. auth foundation
3. backend for one module
4. frontend for that module
5. repeat

Best sequence:

1. DB schemas and migrations
2. auth + RBAC
3. store and staff management
4. inventory
5. POS sales
6. billing
7. shipping
8. support/notifications
9. admin dashboards

This is better than finishing every backend feature before touching the UI.

---

## Final Recommendation

Use:

- one global identity system
- separate app-specific login screens
- separate authorization pipelines by context
- shared session foundation
- backend-enforced role checks

And build in this order:

- database and auth first
- then backend and frontend in vertical feature slices

That gives you the cleanest and safest foundation.
