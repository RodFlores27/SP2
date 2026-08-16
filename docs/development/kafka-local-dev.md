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

Create `booking-events` topic in Aiven before deploying. The backend checks that the topic exists, but production defaults should not depend on app startup creating managed Kafka topics.

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

Use these values in `../../server/.env` when Kafka should run locally:

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

This is configurable with `KAFKA_BOOKING_EVENTS_TOPIC`, but all Week 3 tests and docs assume the default topic `booking-events`.

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

The app no longer uses the status `confirmed` for firm bookings, it is removed. Instead, the current firm booking flow now uses `pending_approval` and `approved`.  

The Kafka event contract follows the Milestone 13 booking lifecycle. Event `status` values may include `on_hold`, `displaced`, and `completed`, and strict 1v1 contention details are carried in payload fields such as `contentionRole` and `challengingBookingId`. The `booking.converted_to_firm` event exists because pencil-to-firm conversion became an explicit lifecycle transition before Kafka publishing was added.

## Producer Behavior

Producer code lives in two files under `../../server/utils/kafka`:

- `producer.js` is the Kafka transport helper. Start here to trace producer connection setup, topic checks, `buildBookingEvent`, and `publishBookingEvent`.
- `booking-events.js` is the booking-domain adapter. Start here to see `BOOKING_EVENT_TYPES`, how Booking model data becomes event fields, and `publishBookingLifecycleEvent`.

## Consumers

Consumers run in-process with the Express server for the MVP. Each consumer reads `booking-events` using its own configured Kafka consumer group, then performs a database or email side effect.

### Consumer source files

- **Notification consumer:** `../../server/utils/kafka/notification-consumer.js`
  - Starts with `startNotificationConsumer` and processes events with `processBookingNotificationEvent`.
  - Resolves the booking and resource name, then chooses the appropriate email helper in `../../server/utils/booking-notifications.js`.
  - The email helper sends through Resend and delegates delivery tracking to `../../server/utils/notification-delivery.js`.
  - Uses the `KAFKA_NOTIFICATION_CONSUMER_GROUP` group (default: `notification-consumer`).

- **Audit consumer:** `../../server/utils/kafka/audit-consumer.js`
  - Starts with `startAuditConsumer` and processes events with `processAuditEvent`.
  - Persists an append-only audit record through the Sequelize `AuditLog` model in `../../server/models/auditlog.js`, backed by the `AuditLogs` table.
  - Duplicate event IDs are safely treated as already handled rather than creating another audit row.
  - Uses the `KAFKA_AUDIT_CONSUMER_GROUP` group (default: `audit-log-consumer`).

- **Analytics consumer:** `../../server/utils/kafka/analytics-consumer.js`
  - Starts with `startAnalyticsConsumer` and processes events with `processAnalyticsEvent`.
  - Persists an analytics event through the Sequelize `BookingAnalyticsEvent` model in `../../server/models/bookinganalyticsevent.js`, backed by the `BookingAnalyticsEvents` table.
  - Duplicate event IDs are safely treated as already handled, keeping analytics counts idempotent.
  - Uses the `KAFKA_ANALYTICS_CONSUMER_GROUP` group (default: `analytics-consumer`).

### Notification delivery records

`NotificationDeliveries` is a PostgreSQL table, not a Kafka topic, consumer, or function. It is created by `../../server/migrations/20260510100000-create-notification-deliveries.js` and represented in code by the Sequelize `NotificationDelivery` model in `../../server/models/notificationdelivery.js`.

Before sending an email, `../../server/utils/notification-delivery.js` creates or finds a delivery row using this unique identity:

```txt
eventId + notificationType + recipientEmail
```

The row records the delivery attempt and its `processing`, `sent`, or `failed` status. This lets the application prevent the same Kafka event from sending the same notification to the same recipient more than once, while retaining delivery diagnostics.

Startup happens after database authentication in `../../server/index.js`: it calls `startNotificationConsumer`, `startAuditConsumer`, and `startAnalyticsConsumer` when `KAFKA_ENABLED=true`. Startup failures are logged, and the server continues running. `../../server/utils/kafka/index.js` re-exports these helpers, but the source files above are the best places to trace each consumer.

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

## NOTE: Booking Identifier Convention

Kafka producers and consumers may handle booking identity data. Before changing them, review the [Core Development Convention: Booking Identifiers](LOCAL-DEVELOPMENT-GUIDE.md#core-development-convention-booking-identifiers) in `LOCAL-DEVELOPMENT-GUIDE.md`.
