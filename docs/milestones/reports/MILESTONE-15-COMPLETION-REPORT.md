# Milestone 15 Completion Report

**Date:** April 27, 2026  
**Project:** PTCF Room and Equipment Reservation Management System  
**Milestone:** Booking Event Publishing  
**Status:** Complete

---

## Requirements Checklist

- [x] Publish booking lifecycle events after successful database changes.
- [x] Cover create, approve, deny, cancel, expiry, contention start, and displaced slot reopened.
- [x] Add convert-to-firm event for the current system lifecycle.
- [x] Keep publishing non-blocking for API users.
- [x] Preserve existing API response shapes.
- [x] Keep current email behavior in place until the notification consumer milestone.
- [x] Add verification script and documentation updates.

---

## Implementation Summary

Milestone 15 wires the current booking lifecycle into Kafka while preserving the modular monolith design.

The "current booking lifecycle" here is the Milestone 13 stabilized lifecycle. Event payloads preserve contention metadata such as `contentionRole` and `challengingBookingId`, and event statuses can reflect post-refactor states like `on_hold`, `displaced`, and `completed`.

New Kafka booking helper:

- `../../../server/utils/kafka/booking-events.js`
- Exports `BOOKING_EVENT_TYPES`
- Builds consistent booking event metadata
- Publishes through the Milestone 14 producer helper
- Logs publish failures without throwing back into API responses

Controller event publishing:

- `booking.created` after successful booking creation
- `booking.contention_started` when a pencil challenge creates a 1v1 contention episode
- `booking.cancelled` after user/staff cancellation
- `booking.displaced_slot_reopened` when cancellation of an approved firm booking reopens a displaced user's slot
- `booking.converted_to_firm` after pencil-to-firm conversion
- `booking.approved` after staff approval
- `booking.denied` after staff denial

Scheduled job event publishing:

- `booking.expired` for auto-expired firm pending approvals and free pencil bookings
- `booking.expiring_soon` for 48-hour and 24-hour pencil expiry warnings

Existing Resend calls remain active. They will move behind a Kafka notification consumer in Milestone 16.

---

## Event Names

Published to topic:

```txt
booking-events
```

Lifecycle event types:

```txt
booking.created
booking.approved
booking.denied
booking.cancelled
booking.expired
booking.expiring_soon
booking.contention_started
booking.converted_to_firm
booking.displaced_slot_reopened
```

---

## Verification Tests

Automated script:

```bash
npm run test:milestone-15
```

Result with Kafka disabled:

```txt
Passed: 6
Failed: 0
Kafka enabled: false
```

Result with Kafka enabled and local Docker Kafka running:

```txt
Passed: 7
Failed: 0
Kafka enabled: true
```

Additional checks:

```bash
cd server
npm run kafka:check
```

Result:

```txt
Topic booking-events: already available
Published foundation check event
```

Node printed a non-blocking `TimeoutNegativeWarning` after live Kafka publish. The publish succeeded; the warning is from the local KafkaJS/runtime timer path and does not block Milestone 15 functionality.

---

## Code Quality Assessment

- Booking state remains PostgreSQL-first.
- Kafka is used for side-effect event streaming, not as the source of truth.
- Kafka disabled mode remains safe.
- Kafka publish failures are logged and do not change API responses.
- No booking rule or conflict-resolution behavior was rewritten.
- Existing notification behavior remains intact until the consumer migration.

---

## Readiness Checklist

- [x] Booking event constants exist and are verified.
- [x] Controller publish points exist and are verified.
- [x] Cron publish points exist and are verified.
- [x] Root test script registered as `test:milestone-15`.
- [x] Local Kafka documentation updated.
- [x] Week 3 brief marked complete for Milestone 15.
- [x] Project organization updated.
- [x] Milestone test/report indexes updated.

---

## Next Steps

Milestone 16 should add a `notification-consumer` group that listens to `booking-events` and sends the existing Resend email templates. During that milestone, remove or guard direct controller email calls to avoid duplicate emails.

---

## Summary

Milestone 15 establishes the core event stream for the booking domain. The application now emits Kafka events for the main booking lifecycle while keeping the current MVP behavior stable.
