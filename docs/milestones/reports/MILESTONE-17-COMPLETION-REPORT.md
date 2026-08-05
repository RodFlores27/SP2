# Milestone 17 Completion Report

**Date:** April 27, 2026  
**Project:** PTCF Room and Equipment Reservation Management System  
**Milestone:** Audit Log Consumer  
**Status:** Complete

---

## Requirements Checklist

- [x] Add `AuditLogs` Sequelize model and migration.
- [x] Add Kafka consumer group `audit-log-consumer`.
- [x] Store every booking event as an immutable append-only audit row.
- [x] Include audit metadata needed for admin review.
- [x] Add an admin API endpoint to list recent audit entries.
- [x] Add verification coverage and docs updates.

---

## Implementation Summary

Milestone 17 adds a Kafka-backed audit log stream for booking events while keeping the existing modular monolith structure intact.

Core additions:

- `../../../server/migrations/20260427170000-create-audit-log.js`
  - creates the `AuditLogs` table
  - stores event metadata, booking references, actor references, and raw JSON payload
  - adds indexes for event type, actor, booking, and occurred time

- `../../../server/models/auditlog.js`
  - Sequelize model for audit rows
  - associations to `User` and `Booking`
  - immutability guards that prevent update and delete operations

- `../../../server/utils/kafka/audit-consumer.js`
  - subscribes to `booking-events`
  - uses `audit-log-consumer` by default
  - parses Kafka messages and persists audit rows
  - treats duplicate `eventId` values as non-fatal idempotent repeats

- `../../../server/index.js`
  - starts the audit consumer during boot when Kafka is enabled
  - logs startup failures without stopping the server

- `../../../server/controllers/admin.controller.js`
  - adds `listAuditLogs`
  - supports filters for `limit`, `eventType`, `bookingId`, and `actorUserId`
  - includes associated actor and booking summaries for admin inspection

- `../../../server/routes/admin.routes.js`
  - exposes `GET /api/admin/audit-logs` behind the system admin guard

---

## Audit Log Shape

The audit row stores the booking event envelope and enough context to review the action later:

```txt
eventId
eventType
occurredAt
topic
partition
offset
actorUserId
bookingId
resourceType
resourceId
bookingType
status
payload
```

---

## Verification Tests

Automated script:

```bash
npm run test:milestone-17
```

Observed results:

- Kafka disabled: passes with the audit consumer staying safely inactive.
- Kafka enabled: passes with a published `booking.audit_test` event persisted into `AuditLogs`.

Validation performed:

- `npx sequelize-cli db:migrate --env development`
- `npm run test:milestone-17`
- `npm run test:milestone-17` with `KAFKA_ENABLED=true`
- `git diff --check`

The Kafka-enabled run still emits the existing non-blocking `TimeoutNegativeWarning`, but the milestone behavior completes successfully.

---

## Code Quality Assessment

- Audit rows are append-only by model hooks.
- The consumer keeps the Kafka concern isolated from controller logic.
- Admin API filtering is simple and bounded.
- Idempotency is handled through `eventId` uniqueness instead of extra infrastructure.
- The app still works normally when Kafka is disabled.

---

## Readiness Checklist

- [x] Migration added.
- [x] Model added.
- [x] Consumer added.
- [x] Startup wiring added.
- [x] Admin API added.
- [x] Swagger updated.
- [x] Milestone verification script added.
- [x] Local migration and test run passed.

---

## Next Steps

Milestone 18 can now focus on a lightweight analytics consumer and a minimal admin analytics view without needing to redesign the event pipeline.

---

## Summary

Milestone 17 completes the audit trail layer for booking events. Kafka booking activity is now persisted into an immutable audit log and exposed to admins through a small, practical API.
