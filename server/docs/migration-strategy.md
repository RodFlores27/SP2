# Migration Strategy (Sequelize CLI)

This project uses `sequelize-cli` with migration history stored in the `SequelizeMeta` table.

## Goal

Keep production/staging safe while moving toward a cleaner migration workflow.

## Current Rule

- Do **not** delete or rename existing files in `server/migrations` that may already be recorded in `SequelizeMeta`.
- Add all new schema changes as forward-only migration files.

## Why

Deleting/renaming historical migration files can break:

- New environment bootstrap
- CI/CD migration runs
- Rollbacks and auditability
- Consistency between repo and `SequelizeMeta`

## Safe Consolidation Plan

Use this when you want a fresh "single baseline" for new installs.

1. Freeze schema changes briefly.
2. Provision a clean database and run all current migrations to completion.
3. Create a new baseline migration that represents the current schema state.
4. Validate baseline on a blank DB (baseline + latest migrations after baseline).
5. Keep legacy migrations in repo (recommended) or archive them only after all active environments are beyond the baseline point.
6. Continue adding incremental migrations after the baseline.

## Important: Duplicate Timestamp Prefixes

These two files currently share the same timestamp prefix:

- `20260417120000-add-rebook-source-status-and-auth-doc-hash.js`
- `20260417120000-booking-contention-and-displaced.js`

Avoid creating new files with duplicate prefixes. If you want to fix existing duplicates, do it with a coordinated DB plan because applied entries in `SequelizeMeta` must stay consistent.

## Operational Commands

Run from `server/`:

```bash
npx sequelize-cli db:migrate:status --env development
npx sequelize-cli db:migrate --env development
```

Production should only run forward migrations:

```bash
npx sequelize-cli db:migrate --env production
```

## Team Policy (Recommended)

- One migration per schema change.
- Never edit an applied migration in place.
- Prefer additive changes and backfills over destructive changes.
- Make migrations idempotent where practical for partial-failure safety.
