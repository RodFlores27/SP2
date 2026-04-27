# Milestone 16 Completion Report

**Date:** April 27, 2026  
**Project:** PTCF Room and Equipment Reservation Management System  
**Milestone:** Notification Consumer  
**Status:** Complete

---

## Requirements Checklist

- [x] Add Kafka notification consumer for booking lifecycle events.
- [x] Reuse existing Resend notification templates in `server/utils/booking-notifications.js`.
- [x] Keep Kafka mode non-blocking for API responses.
- [x] Prevent duplicate notifications in Kafka-enabled mode.
- [x] Preserve fallback behavior when Kafka is disabled.
- [x] Add milestone verification script and docs updates.

---

## Implementation Summary

Milestone 16 moves notification delivery behind Kafka when Kafka is enabled, while keeping existing direct notification calls as a fallback path when Kafka is disabled.

Core additions:

- `server/utils/kafka/notification-consumer.js`
  - subscribes to topic `booking-events`
  - uses consumer group `notification-consumer` (configurable with `KAFKA_NOTIFICATION_CONSUMER_GROUP`)
  - maps booking lifecycle events to existing notification functions
  - loads booking/user/resource context from DB before sending emails

- `server/index.js`
  - starts the notification consumer after DB authentication when `KAFKA_ENABLED=true`
  - logs startup failures without crashing the server

Duplicate-send prevention:

- `server/controllers/booking.controller.js`
  - direct notification calls now run only when `!isKafkaEnabled()`
  - Kafka-enabled mode relies on event consumer for email sends

- `server/jobs/booking-expiry.js`
  - direct expiry/warning notification calls now run only when `!isKafkaEnabled()`
  - Kafka-enabled mode relies on event consumer for email sends

---

## Notification Event Mapping

Handled by the consumer:

```txt
booking.created
booking.approved
booking.denied
booking.cancelled
booking.expired
booking.expiring_soon
booking.contention_started
booking.displaced_slot_reopened
```

`booking.converted_to_firm` remains an event stream signal for downstream consumers (audit/analytics) and does not trigger an email in this milestone.

---

## Verification Tests

Automated script:

```bash
npm run test:milestone-16
```

Result with Kafka disabled:

```txt
Passed: 7
Failed: 0
Kafka enabled: false
```

Result with Kafka enabled:

```txt
Passed: 7
Failed: 0
Kafka enabled: true
```

Additional verification:

- `node --check` passed for new consumer and milestone test files.
- `git diff --check` passed (no whitespace errors).

---

## Code Quality Assessment

- Email templates and transport remain centralized in existing modules.
- Consumer-side event handling is explicit and easy to trace.
- Kafka-disabled fallback keeps current local behavior intact.
- Kafka-enabled mode prevents duplicate sends by guarding direct notification calls.
- No booking-domain rules were changed.

---

## Readiness Checklist

- [x] Consumer module added and exported.
- [x] Backend startup wiring updated.
- [x] Controller fallback guards added.
- [x] Expiry job fallback guards added.
- [x] Milestone test script added (`test:milestone-16`).
- [x] Week 3 milestone status updated.
- [x] Project docs and report indexes updated.

---

## Next Steps

Milestone 17 should add audit-log consumer persistence so every booking event is recorded in an immutable append-only table.

---

## Summary

Milestone 16 completes the first end-to-end Kafka notification path for this project. In Kafka-enabled mode, booking lifecycle notifications are now event-driven via a consumer, while fallback direct notifications remain available when Kafka is disabled.
