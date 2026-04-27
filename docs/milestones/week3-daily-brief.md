# Week 3 - Kafka Integration + MVP Stabilization

**Dates:** Apr 27 - May 2, 2026  
**Original plan reference:** Apr 13 - Apr 17, 2026, now replanned because those dates have passed.  
**Theme:** Add Kafka to the existing modular monolith without redesigning the MVP.

---

## Practical Architecture Direction

Keep the current system design:

- React + Vite client stays unchanged except for small admin/audit/analytics views.
- Express + Sequelize backend remains the main application.
- Kafka is added as an event layer inside the backend, not as a full microservice split.
- Booking APIs still update PostgreSQL first.
- After successful booking state changes, the backend publishes booking lifecycle events to Kafka.
- Consumers run in the same server codebase for now:
  - notification consumer sends existing Resend emails
  - audit consumer writes append-only audit rows
  - analytics consumer updates or feeds simple utilization metrics

This is enough to demonstrate event-driven architecture for SP2 while keeping the project practical.

---

## Kafka Scope Rules

### Include Now

- One Kafka topic: `booking-events`
- KafkaJS producer helper
- KafkaJS consumers for notification, audit, and simple analytics
- Event documentation for the paper
- End-to-end verification from booking action to event side effects

### Defer Until After MVP

- Full microservice split
- Kafka transactions
- Schema Registry
- Multiple domain topics
- Complex retry/dead-letter infrastructure
- Full real-time dashboard streaming

---

## Event Contract

Use current booking lifecycle terms. Do not reintroduce the removed `confirmed` status.

Initial event names:

- `booking.created`
- `booking.approved`
- `booking.denied`
- `booking.cancelled`
- `booking.expired`
- `booking.expiring_soon`
- `booking.contention_started`
- `booking.displaced_slot_reopened`

Suggested shared event shape:

```json
{
  "eventId": "uuid-or-kafka-key",
  "eventType": "booking.created",
  "occurredAt": "2026-04-27T00:00:00.000Z",
  "actorUserId": 1,
  "bookingId": 123,
  "resourceType": "equipment",
  "resourceId": 2,
  "bookingType": "pencil",
  "status": "penciled",
  "payload": {}
}
```

---

## Daily Milestone Breakdown

### Milestone 14 - Kafka Foundation (Mon Apr 27)

**Tags:** Backend, Kafka  
**Status:** Complete (completed Apr 27)

- Add KafkaJS dependency to the server.
- Add Kafka environment configuration.
- Create a producer helper for publishing booking events.
- Add a small local/cloud setup note for required env vars.
- Keep startup tolerant in development: the server should still run when Kafka is disabled.

Acceptance:

- Server starts with Kafka disabled.
- Server can connect to Kafka when env vars are present.
- A developer can identify the topic name and broker env vars from docs.

---

### Milestone 15 - Booking Event Publishing (Tue Apr 28)

**Tags:** Backend, Kafka
**Status:** Complete (completed Apr 27)

- Publish booking lifecycle events after successful database changes.
- Cover create, approve, deny, cancel, expiry, contention start, and displaced slot reopened.
- Keep event publishing non-blocking where appropriate, but log failures clearly.
- Preserve existing API response shapes.

Acceptance:

- Booking actions still work even if Kafka publish fails in development.
- Kafka receives events for the main booking lifecycle.
- No booking business rules are rewritten just to fit Kafka.

---

### Milestone 16 - Notification Consumer (Wed Apr 29)

**Tags:** Backend, Kafka, Email  
**Status:** Complete (completed Apr 27)

- Add notification consumer group: `notification-consumer`.
- Move direct email-trigger responsibility into the Kafka consumer.
- Reuse existing `server/utils/booking-notifications.js`.
- Keep Resend as the only email transport.

Acceptance:

- Booking action publishes event.
- Notification consumer receives event.
- Existing email templates are sent through Resend.
- Direct controller email calls are removed or guarded to avoid duplicate emails.

---

### Milestone 17 - Audit Log Consumer (Thu Apr 30)

**Tags:** Backend, Kafka, Database  
**Status:** Complete (completed Apr 27)

- Add `AuditLogs` Sequelize model and migration.
- Add audit consumer group: `audit-log-consumer`.
- Store every booking event as an immutable append-only audit row.
- Include enough metadata for admin review: event type, booking id, actor id, occurred at, and JSON payload.

Acceptance:

- Every consumed booking event creates an audit row.
- Audit rows are not edited by normal app flows.
- A simple API endpoint can list recent audit entries for admins.

---

### Milestone 18 - Analytics Consumer + Admin View (Fri May 1)

**Tags:** Backend, Frontend, Kafka  
**Status:** Not started

- Add analytics consumer group: `analytics-consumer`.
- Keep analytics simple: counts by event type, resource type, booking type, and booking status.
- Add a minimal admin analytics/audit view.
- Placeholder-quality charts are acceptable if the data path is real.

Acceptance:

- Kafka events update analytics data or are queryable for metrics.
- Admin panel shows useful counts or recent event summaries.
- No heavy reporting system is introduced yet.

---

### Milestone 19 - End-to-End Kafka Verification + Documentation (Sat May 2)

**Tags:** Kafka, Testing, Documentation  
**Status:** Not started

- Test the full flow:
  - booking created
  - Kafka event emitted
  - notification side effect handled
  - audit row written
  - analytics data updated or visible
- Document topic names, event names, consumer groups, env vars, and known limitations.
- Add milestone verification script and completion report.

Acceptance:

- End-to-end Kafka path is demonstrable.
- Paper-ready architecture notes exist.
- MVP remains usable even with the new event layer.

---

## Week 3 Summary Table

| Milestone | Date | Focus | Tags | Status |
| --------- | ---- | ----- | ---- | ------ |
| 14 | Apr 27 | Kafka foundation | Backend, Kafka | Complete |
| 15 | Apr 28 | Booking event publishing | Backend, Kafka | Complete |
| 16 | Apr 29 | Notification consumer | Backend, Kafka, Email | Complete |
| 17 | Apr 30 | Audit log consumer | Backend, Kafka, Database | Complete |
| 18 | May 1 | Analytics consumer + admin view | Backend, Frontend, Kafka | Not started |
| 19 | May 2 | End-to-end verification + docs | Kafka, Testing, Documentation | Not started |

---

## Notes for Implementation

- Start with Kafka disabled by default unless `KAFKA_ENABLED=true`.
- Prefer one topic first: `booking-events`.
- Keep consumers in-process for MVP.
- Keep the Booking module as the source of truth for booking state.
- Treat Kafka as side-effect delivery for notifications, audit logs, and analytics.
- Do not add visible UI text for Kafka unless it helps admins inspect audit/analytics output.
