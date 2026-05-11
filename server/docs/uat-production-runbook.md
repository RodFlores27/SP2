# UAT Production Runbook

This runbook is for executing the UAT seeding workflow directly on the hosted production environment.

## 1) Pre-Flight Checklist

Before running any UAT seed command:

1. Create a production database backup/snapshot.
2. Confirm production environment variables are correct:
   - `AUTH_PROVIDER=supabase`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Confirm `student@uplb.edu.ph` exists and is reserved for UAT seeding behavior.
4. Confirm respondent CSV is final and contains only UAT participant emails:
   - `server/docs/uat-respondents.csv`
5. Confirm UAT window and support channel are announced.

## 2) Seed Execution Order

From `PTCF Project/server`:

```bash
npm run seed:uat:accounts
npm run seed:uat:refresh
```

Expected generated artifacts:

- `server/docs/uat-account-passwords.csv`
- `server/docs/uat-contention-manifest.csv`

## 3) Post-Seed Smoke Validation

Run a quick role-based check before inviting participants:

1. Student/requester account:
   - can see contestable target bookings
   - has predefined defender scenario
   - has predefined approved firm sample
2. Staff account:
   - `Pending Approvals` has at least 2 entries (approve + deny path)
   - `Resubmissions` has at least 1 entry
   - `Active conflicts` has at least 1 contention pair
   - `Approved Bookings` includes equipment loan + room examples
3. Admin account:
   - can see shared analytics showcase coverage
   - can see broad audit-trail showcase entries
   - can access staff-level seeded flows

## 4) During UAT Window

1. Monitor seeded slot availability and run refresh as needed:

```bash
npm run seed:uat:refresh
```

2. Record each refresh timestamp in UAT notes.
3. Keep one operator account for verification (do not reuse participant accounts).

## 5) Post-UAT Cleanup

1. Export/archive all evidence first (forms, screenshots, logs).
2. Cancel/close active UAT bookings that should not remain active.
3. Remove/deactivate disposable UAT-only users as required.
4. Keep or purge showcase data based on reporting needs.
5. Run final production smoke checks:
   - login
   - booking creation
   - staff approve/deny
   - admin analytics/audit/users tabs

## 6) Rollback Procedure

If a seed run causes incorrect production state:

1. Pause participant testing immediately.
2. Restore the most recent production DB snapshot (or execute scoped cleanup scripts).
3. Re-run pre-flight checks.
4. Re-run seed commands only after validation.

## 7) Notes

- `seed:uat:refresh` is intended to be rerunnable and idempotent for seeded UAT datasets.
- Admin showcase audit/analytics rows are seeded using fixed event IDs to avoid duplicate inserts.
- Global challenge targets use internal purpose markers so refresh does not treat unrelated user bookings as seed targets.
