# PTCF Project

Room and Equipment Reservation Management System for the UPLB ICropS Plant Tissue Culture Facility, built as a full-stack academic web application with an event-driven architecture using Apache Kafka.

## Tech Stack

This section summarizes the current stack in use and the project's package manifests.

### Frontend

| Technology | Version / Service | Notes |
| --- | --- | --- |
| React | 19.2.4 | Frontend library |
| React DOM | 19.2.4 | React rendering package |
| Vite | 8.0.1 | Frontend build tool and dev server |
| Tailwind CSS | 4.2.2 | Utility-first CSS framework |
| shadcn/ui | Project-configured | UI component pattern used in `client/src/components/ui` |
| Radix UI | Alert Dialog 1.1.15, Dialog 1.1.15, Label 2.1.8, Select 2.2.6, Slot 1.2.4 | Headless UI primitives used by the frontend |
| react-router-dom | 7.13.2 | Client-side routing |
| React Hook Form | 7.72.0 | Form state management |
| Zod | 4.3.6 | Schema validation |
| `@hookform/resolvers` | 5.2.2 | React Hook Form resolver integration |
| Axios | 1.14.0 | HTTP client |
| React Big Calendar | 1.19.4 | Calendar UI |
| date-fns | 4.1.0 | Date utilities |
| class-variance-authority | 0.7.1 | Variant-based component styling |
| clsx | 2.1.1 | Conditional class names |
| tailwind-merge | 3.5.0 | Tailwind class merging utility |
| lucide-react | 1.7.0 | Icon library |

### Backend

| Technology | Version / Service | Notes |
| --- | --- | --- |
| Node.js | Runtime used by backend | Backend runtime |
| Express | 5.2.1 | Web server framework |
| Sequelize | 6.37.8 | ORM for PostgreSQL access and migrations |
| sequelize-cli | 6.6.5 | Sequelize migration and seeding CLI |
| PostgreSQL | Supabase-managed | Primary relational database |
| `pg` | 8.20.0 | PostgreSQL driver |
| `pg-hstore` | 2.3.4 | Sequelize PostgreSQL support dependency |
| Supabase Auth | `@supabase/supabase-js` 2.105.1 | Current production-oriented authentication path |
| JWT auth | `jsonwebtoken` 9.0.3 | Legacy/local auth mode |
| bcrypt | 6.0.0 | Password hashing for legacy auth mode |
| Cloudinary | 2.9.0 | File and image storage |
| Resend | 6.10.0 | Transactional email delivery |
| node-cron | 4.2.1 | Scheduled background jobs |
| KafkaJS | 2.2.4 | Apache Kafka client |
| Swagger UI Express | 5.0.1 | API documentation UI |
| Morgan | 1.10.1 | Request logging |
| Multer | 2.1.1 | Multipart/form-data handling |
| CORS | 2.8.6 | Cross-origin request support |
| dotenv | 17.3.1 | Environment variable loading |
| Nodemon | 3.1.14 | Local backend development auto-reload |

### Infrastructure and Services

| Technology | Version / Service | Notes |
| --- | --- | --- |
| Frontend Hosting | Vercel | Hosts the client application |
| Backend Hosting | Render | Hosts the Express backend |
| Database Hosting | Supabase | Hosts PostgreSQL database |
| Production Kafka | Aiven for Apache Kafka | Managed Kafka host for production-oriented deployment |
| Local Kafka | Docker Compose | Local Kafka development via `docker-compose.kafka.yml` |
| Render Keep-Awake Monitor | UptimeRobot | Prevents Render free-tier sleeping during demos |

## Authentication Modes

The project currently supports two authentication modes:

- Legacy mode: local JWT + bcrypt
- Current production-oriented path: Supabase Auth integration, while the local `Users` table is still used for app roles

## Architecture Summary

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL via Supabase
- ORM: Sequelize
- Event-driven side effects: Apache Kafka via KafkaJS
- Architecture style: modular monolith

## Recent Updates (May 2026)

- My Bookings active filter updated from `Contested` to role-based `Under Contention` (challenger/defender participants).
- Authorization document preview is now available immediately after file selection in:
  - New Booking form
  - My Bookings Convert-to-Firm panel (replace-file flow)
- Added booking lifecycle event `booking.on_hold_released`:
  - Triggered when an `on_hold` pencil becomes active (`penciled`) after firm blocker removal.
  - Notification wired through Kafka consumer and direct fallback notifier.
- Firm `pending_approval` auto-expiry path now always re-evaluates overlapping on-hold pencils and emits release notifications when applicable.
- Admin Panel Analytics Phase 1:
  - Added date-range filtering (`all`, `today`, `last_7_days`, `last_30_days`, `custom` via `startDate`/`endDate`) to `GET /admin/analytics`.
  - Added CSV export endpoint `GET /admin/analytics/export.csv` with the same filters.
  - Analytics tab now includes range controls and an `Export CSV` action for the current filtered view.
