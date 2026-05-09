# Kafka Local Development and Production Reference

Week 3 adds Kafka as an opt-in event layer inside the existing Express + Sequelize backend. The booking API still writes PostgreSQL first; Kafka carries booking lifecycle events to side-effect consumers for notification, audit, and analytics.

This project now supports two Kafka deployment modes:

- local development with Docker Compose
- production deployment with Aiven for Apache Kafka

The architecture stays the same in both modes:

- PostgreSQL remains the source of truth
- the Render backend still runs the Kafka producer and all consumers in-process
- Kafka remains a side-effect/event layer for notification, audit, and analytics

## Local Kafka

Start Kafka from the project root:

```bash
docker compose -f docker-compose.kafka.yml up -d
```

Stop Kafka:

```bash
docker compose -f docker-compose.kafka.yml down
```

Reset local Kafka data:

```bash
docker compose -f docker-compose.kafka.yml down -v
```

Docker Desktop must be running before these commands. If Docker is closed, Docker may report that it cannot connect to the `dockerDesktopLinuxEngine` pipe.

## Production Kafka (Aiven)

Production does not use the local Docker Kafka container. Instead, the deployed backend should connect to an Aiven-managed Kafka cluster.

Recommended production environment values:

```env
KAFKA_ENABLED=true
KAFKA_CLIENT_ID=ptcf-booking-system
KAFKA_BROKERS=<aiven-host>:<aiven-port>
KAFKA_SSL=true
KAFKA_USERNAME=<aiven-username>
KAFKA_PASSWORD=<aiven-password>
KAFKA_SASL_MECHANISM=<value from Aiven Quick Connect, often SCRAM-SHA-256>
KAFKA_CA_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
KAFKA_BOOKING_EVENTS_TOPIC=booking-events
KAFKA_AUTO_CREATE_TOPICS=false
KAFKA_NOTIFICATION_CONSUMER_GROUP=notification-consumer
KAFKA_AUDIT_CONSUMER_GROUP=audit-log-consumer
KAFKA_ANALYTICS_CONSUMER_GROUP=analytics-consumer
```

Use local Docker Kafka only for development and local milestone verification. Do not point production at `localhost:9092`.

### Aiven topic note

Create `booking-events` in Aiven before deploying. The backend checks that the topic exists, but production defaults should not depend on app startup creating managed Kafka topics.

If you intentionally want the app to create the topic and the Aiven service user has permission, set:

```env
KAFKA_AUTO_CREATE_TOPICS=true
```

For normal production use, leave `KAFKA_AUTO_CREATE_TOPICS=false`.

### Aiven Quick Connect note

Treat Aiven Quick Connect as the source of truth for hosted Kafka connection settings.

- Copy the broker host and port from Quick Connect
- Copy the SASL mechanism from Quick Connect
- If Quick Connect shows `ssl.ca.location = "ca.pem"`, add that certificate to `KAFKA_CA_CERT`

The app accepts pasted PEM content in `KAFKA_CA_CERT`. If you store the cert in Render as a single-line value with escaped `\n`, the backend converts it back to normal PEM line breaks automatically.

## Server Environment

Use these values in `server/.env` when Kafka should run locally:

```env
KAFKA_ENABLED=true
KAFKA_CLIENT_ID=ptcf-booking-system
KAFKA_BROKERS=localhost:9092
KAFKA_BOOKING_EVENTS_TOPIC=booking-events
KAFKA_NOTIFICATION_CONSUMER_GROUP=notification-consumer
KAFKA_AUDIT_CONSUMER_GROUP=audit-log-consumer
KAFKA_ANALYTICS_CONSUMER_GROUP=analytics-consumer
```

Leave Kafka disabled when you only want the MVP without a broker:

```env
KAFKA_ENABLED=false
```

When Kafka is disabled, booking APIs still work. Direct notification fallbacks remain active where needed, and Kafka producer/consumer helpers return controlled disabled-mode results instead of crashing the server.

### Validation behavior

When `KAFKA_ENABLED=true`, the server and `npm run kafka:check` now report configuration issues more clearly. Common production setup mistakes that are surfaced include:

- missing or empty `KAFKA_BROKERS`
- `KAFKA_USERNAME` without `KAFKA_PASSWORD`, or vice versa
- hosted Kafka configuration with `KAFKA_SSL=false`
- hosted Kafka configuration without SASL credentials
- hosted Kafka configuration without `KAFKA_CA_CERT` when Aiven requires a project CA

Misconfiguration does not stop booking writes to PostgreSQL, but it does put Kafka side effects into degraded mode until the Kafka connection is fixed.

## Topic

The MVP uses one Kafka topic:

```txt
booking-events
```

This is configurable with `KAFKA_BOOKING_EVENTS_TOPIC`, but all Week 3 tests and docs assume the default topic.

## Event Envelope

Booking lifecycle events use this shape:

```json
{
  "eventId": "uuid-or-test-id",
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

`eventId` is used by audit and analytics persistence for deduplication.
`eventId` is also used by the notification delivery ledger for per-recipient idempotency.

## Event Names

Published to `booking-events`:

```txt
booking.created
booking.approved
booking.denied
booking.cancelled
booking.expired
booking.expiring_soon
booking.on_hold
booking.displaced
booking.contention_started
booking.contention_resolved
booking.converted_to_firm
booking.displaced_slot_reopened
```

Do not reintroduce the removed `confirmed` status. The current firm booking flow uses `pending_approval` and `approved`.

The Kafka event contract follows the Milestone 13 booking lifecycle. Event `status` values may include `on_hold`, `displaced`, and `completed`, and strict 1v1 contention details are carried in payload fields such as `contentionRole` and `challengingBookingId`. The `booking.converted_to_firm` event exists because pencil-to-firm conversion became an explicit lifecycle transition before Kafka publishing was added.

## Producer Behavior

The producer helper lives under `server/utils/kafka`.

- `buildBookingEvent` creates the shared envelope.
- `publishBookingEvent` sends to the configured topic.
- `publishBookingLifecycleEvent` adapts Booking model data to event fields.
- Publishing is non-blocking for booking API behavior: failures are logged and returned as controlled results.
- Kafka is not the source of truth; PostgreSQL booking writes happen first.

## Consumers

Consumers run in-process with the Express server for the MVP.

```txt
notification-consumer -> sends Resend emails through server/utils/booking-notifications.js
audit-log-consumer    -> writes append-only AuditLogs rows
analytics-consumer    -> writes deduplicated BookingAnalyticsEvents rows
```

Notification delivery idempotency is persisted in:

```txt
NotificationDeliveries
```

The notification path deduplicates by:

```txt
eventId + notificationType + recipientEmail
```

and tracks `processing`, `sent`, and `failed` states for delivery observability.

Startup happens after DB authentication in `server/index.js` when `KAFKA_ENABLED=true`. Startup failures are logged, and the server continues running.

## Verification Commands

Kafka foundation:

```bash
npm run test:milestone-14
```

Event publishing:

```bash
npm run test:milestone-15
```

Notification consumer:

```bash
npm run test:milestone-16
```

Audit consumer:

```bash
npm run test:milestone-17
```

Analytics consumer:

```bash
npm run test:milestone-18
```

End-to-end Kafka flow:

```bash
npm run test:milestone-19
```

Milestone 19 requires `KAFKA_ENABLED=true`, local Kafka running, and the backend running on `http://localhost:4000`. With Kafka disabled, the script exits safely with setup guidance.

For production-style connectivity validation without running local Docker Kafka:

```bash
cd server
npm run kafka:check
```

Run that command with Aiven-backed environment variables to verify:

- the broker is reachable
- producer connectivity works
- the `booking-events` topic exists or can be created

## End-to-End Demonstration

Milestone 19 demonstrates:

1. A real `POST /api/bookings` pencil booking succeeds.
2. The backend publishes `booking.created`.
3. The notification consumer handles the event and invokes the email path.
4. The audit consumer writes an `AuditLogs` row.
5. The analytics consumer writes a `BookingAnalyticsEvents` row.
6. Admin endpoints expose the audit and analytics side effects.

The test captures email calls in-process instead of sending real Resend email, so demos do not depend on external email delivery.

## Known Limitations

- Kafka is an MVP event layer, not a full microservice split.
- There is no Schema Registry yet.
- There are no Kafka transactions.
- There is no dead-letter topic yet.
- Consumers run inside the backend process.
- The analytics view is simple event-count reporting, not full utilization analytics.
- Local KafkaJS runs may print a non-blocking `TimeoutNegativeWarning`; previous tests still passed when this warning appeared.

## Booking Reference Display (UI)

The system now keeps two booking identifiers:

- Internal primary key: `Bookings.id` (numeric)
- User-facing reference: `Bookings.referenceCode` (for example `ICR-CRA-004-26`)

UI screens should display `referenceCode` when available and only fall back to `#id` for legacy/null rows.

### If you still see old `#1234` values

1. Restart the backend after pulling latest changes so updated controller payloads are loaded.
2. Refresh the frontend page (hard refresh if needed).
3. Re-seed using your normal flow (`npm run seed:all:local`) so seeded rows include `referenceCode`.
4. Confirm these endpoints now return `referenceCode` where needed:
   - `/api/bookings/availability` (calendar labels/tooltip paths)
   - My Bookings overlap hint rows (`overlappingOnHoldPencils`, `overlappingFirmBookings`)
   - Admin analytics recent events include booking relation with `referenceCode`

### Display migration scope completed

- Calendar (month/week/day/agenda labels and hover headline prefix)
- My Bookings alerts (`View details` lists, contention detail lines, previous attempts)
- Book Now conflict cards and confirmation prompts
- Staff Dashboard resubmissions `Rebooked from ...`
- Admin Panel `Recent Event Summaries`
