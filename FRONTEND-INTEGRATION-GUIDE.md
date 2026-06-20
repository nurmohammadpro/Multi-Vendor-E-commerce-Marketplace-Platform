# Frontend Integration Guide

## Recommendation

Do **not** wait until the entire backend is 100% finished before starting frontend work.

Do this instead:

- finish database and auth foundations first
- define API contracts for each module
- build frontend and backend in vertical slices

This is the safest delivery model for this project.

---

## Best Build Order

### Phase 1 Foundation First

Build these before serious frontend feature work:

- database migrations
- auth model
- RBAC model
- store/admin membership model
- shared API conventions

### Then Build by Feature Slice

Recommended order:

1. auth and session flow
2. store and staff management
3. product and SKU management
4. inventory and stock approval
5. POS sale flow
6. receipt and label print integration
7. billing and subscriptions
8. shipping
9. support and notifications
10. reports and dashboards

Each slice should include:

- DB tables
- backend endpoints
- backend validation and authorization
- frontend screens
- frontend API client
- success and error states

---

## Why This Is Better

If you try to finish all backend first:

- UI assumptions drift
- API shapes change late
- feedback comes too late
- role-based UX problems stay hidden

If you build vertical slices:

- you test real workflows earlier
- POS flows become usable sooner
- hardware integration can be tested sooner
- store owner, manager, and salesman permissions can be validated in real screens

---

## Frontend Contract Layer

Before large UI work, define shared client contracts for:

- auth
- memberships and active context
- inventory
- stock approvals
- POS sales
- print agent
- billing

### Suggested Client Utilities

- `lib/api-client.ts`
- `lib/auth-client.ts`
- `lib/print-agent.ts`
- `lib/permissions.ts`

---

## Print Agent Integration Order

For POS, frontend should implement:

1. health check
2. receipt print
3. fallback to browser print
4. label print
5. device status badge

This should happen after:

- sale commit API exists
- receipt data contract is stable

It does not need to wait for every billing, shipping, and admin feature.

---

## Final Recommendation

The right sequence is:

- database first
- auth and RBAC second
- then backend and frontend together by module

That gives you speed without losing architectural discipline.
