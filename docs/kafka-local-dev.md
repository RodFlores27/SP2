# Kafka Local Development

Milestone 14 adds Kafka as an opt-in local dependency. The React client and Express server still run normally on the host machine; only Kafka runs in Docker.

## Start Kafka

From the project root:

```bash
docker compose -f docker-compose.kafka.yml up -d
```

Docker Desktop must be running before this command. If the Docker engine is closed, Docker will report that it cannot connect to the `dockerDesktopLinuxEngine` pipe.

Stop Kafka:

```bash
docker compose -f docker-compose.kafka.yml down
```

Reset local Kafka data:

```bash
docker compose -f docker-compose.kafka.yml down -v
```

## Server Environment

Add these to `server/.env` when you want Kafka enabled locally:

```env
KAFKA_ENABLED=true
KAFKA_CLIENT_ID=ptcf-booking-system
KAFKA_BROKERS=localhost:9092
KAFKA_BOOKING_EVENTS_TOPIC=booking-events
KAFKA_NOTIFICATION_CONSUMER_GROUP=notification-consumer
```

Leave Kafka disabled when you only want to run the existing MVP:

```env
KAFKA_ENABLED=false
```

## Verify Kafka Foundation

With the backend running:

```bash
npm run test:milestone-14
```

With Kafka enabled, the test also creates/checks the `booking-events` topic and publishes a small foundation check event. With Kafka disabled, the test confirms that the server and Kafka helper stay safe without a broker.

## MVP Scope

For now, Kafka is used inside the existing modular monolith:

- Booking APIs remain the source of truth for PostgreSQL writes.
- Kafka receives booking lifecycle events after successful app actions.
- Consumers for notifications, audit logs, and analytics will be added in later milestones.
- The app must still run when Kafka is disabled.

## Booking Events

Milestone 15 publishes these events to `booking-events`:

- `booking.created`
- `booking.approved`
- `booking.denied`
- `booking.cancelled`
- `booking.expired`
- `booking.expiring_soon`
- `booking.contention_started`
- `booking.converted_to_firm`
- `booking.displaced_slot_reopened`

Milestone 16 consumes these events with consumer group `notification-consumer` and sends email notifications through the existing Resend templates.
