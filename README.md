# PTCF Project

Room and Equipment Reservation Management System for the UPLB ICropS Plant Tissue Culture Facility. This repository contains the full-stack application used to manage resource listings, user authentication, booking workflows, staff approvals, analytics, and supporting operational side effects for a university facility context.

The project uses a React + Vite frontend, an Express + Sequelize backend, PostgreSQL hosted through Supabase, and Kafka-driven side effects for notifications, audit logging, and analytics. Detailed local setup and deployment procedures live in [LOCAL-DEVELOPMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/LOCAL-DEVELOPMENT-GUIDE.md) and [DEPLOYMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/DEPLOYMENT-GUIDE.md).

## Core Features

- Resource catalog for rooms and equipment
- Role-aware authentication and protected routes
- Booking creation and lifecycle management
- Staff approval and contention handling workflows
- Calendar-based availability views
- Admin monitoring, audit logs, and booking analytics
- Image uploads and transactional email notifications

## System Architecture

### High-Level Flow

```text
React + Vite client
        |
        v
Express API server
        |
        +--> PostgreSQL via Sequelize and Supabase
        |
        +--> Cloudinary for file and image storage
        |
        +--> Resend for transactional email
        |
        +--> Kafka event publishing and consumers
```

### Runtime Notes

- Frontend entry point: `client/src/main.jsx`
- Backend entry point: `server/index.js`
- API base path: `/api/`
- Local defaults: frontend on `http://localhost:5173`, backend on `http://localhost:4000`
- Architecture style: modular monolith with event-driven side effects

## Repository Structure

- `client/` contains the React + Vite frontend, route pages, UI components, and client utilities.
- `server/` contains the Express API, Sequelize models and migrations, background jobs, and infrastructure integrations.
- `docs/` contains operational, domain, and support documentation such as Kafka, Supabase Auth, UAT, and workflow notes.
- `milestone_tests/` contains milestone verification scripts and shared test helpers.
- `milestone_reports/` contains milestone completion reports and implementation history.

For the fuller directory map and naming conventions, see [PROJECT-ORGANIZATION.md](C:/BSCS/SP/SP2/PTCF%20Project/PROJECT-ORGANIZATION.md).

## Tech Stack and Versions

### Frontend

| Technology | Version | Purpose |
| --- | --- | --- |
| React | 19.2.4 | Frontend UI library |
| React DOM | 19.2.4 | Browser rendering package |
| Vite | 8.0.1 | Build tool and dev server |
| Tailwind CSS | 4.2.2 | Utility-first styling |
| react-router-dom | 7.13.2 | Client-side routing |
| React Hook Form | 7.72.0 | Form state management |
| Zod | 4.3.6 | Schema validation |
| Axios | 1.14.0 | HTTP client |
| React Big Calendar | 1.19.4 | Calendar UI |
| Radix UI | Alert Dialog 1.1.15, Dialog 1.1.15, Label 2.1.8, Select 2.2.6, Slot 1.2.4 | Headless UI primitives |
| shadcn/ui | Project-configured | UI component pattern and composition layer |

### Backend

| Technology | Version | Purpose |
| --- | --- | --- |
| Node.js | 20+ | Backend runtime baseline required by current dependencies |
| Express | 5.2.1 | API server framework |
| Sequelize | 6.37.8 | ORM and migration layer |
| sequelize-cli | 6.6.5 | Migration and seeding CLI |
| Morgan | 1.10.1 | HTTP request logging |
| Multer | 2.1.1 | Multipart/form-data handling |
| CORS | 2.8.6 | Cross-origin request support |
| dotenv | 17.3.1 | Environment variable loading |
| Nodemon | 3.1.14 | Local backend auto-reload |
| Swagger UI Express | 5.0.1 | API documentation UI |

### Data and Authentication

| Technology | Version / Service | Purpose |
| --- | --- | --- |
| PostgreSQL | Supabase-managed | Primary relational database |
| `pg` | 8.20.0 | PostgreSQL driver |
| `pg-hstore` | 2.3.4 | Sequelize PostgreSQL support dependency |
| Supabase Auth | `@supabase/supabase-js` 2.105.1 | Production-oriented authentication path |
| JWT auth | `jsonwebtoken` 9.0.3 | Legacy/local auth mode |
| bcrypt | 6.0.0 | Password hashing for legacy/local auth mode |

### Messaging and Background Processing

| Technology | Version / Service | Purpose |
| --- | --- | --- |
| KafkaJS | 2.2.4 | Apache Kafka client for booking events |
| Apache Kafka | Aiven in production, Docker Compose locally | Event broker for notifications, audit logs, and analytics |
| node-cron | 4.2.1 | Scheduled background jobs |

### Infrastructure and External Services

| Technology | Version / Service | Purpose |
| --- | --- | --- |
| Vercel | Managed service | Frontend hosting |
| Render | Managed service | Backend hosting |
| Supabase | Managed service | PostgreSQL hosting and auth services |
| Cloudinary | 2.9.0 | File and image storage |
| Resend | 6.10.0 | Transactional email delivery |
| UptimeRobot | Managed service | Health ping monitoring for demo deployments |

## Quick Start

Use this section for orientation, then follow the full [LOCAL-DEVELOPMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/LOCAL-DEVELOPMENT-GUIDE.md) for complete setup details.

### 1. Install Dependencies

```powershell
npm install
cd server
npm install
cd ../client
npm install
cd ..
```

### 2. Create Local Environment Files

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Fill in the required local values for the .env files before running the app.

### 3. Prepare the Database

```powershell
cd server
npm run migrate
npm run seed:foundation
```

If `AUTH_PROVIDER=supabase`, also run:

```powershell
npm run sync:supabase-auth
```

### 4. Start the Application

Backend:

```powershell
cd server
npm run dev
```

Frontend:

```powershell
cd client
npm run dev
```

Optional local Kafka support is documented in [docs/kafka-local-dev.md](C:/BSCS/SP/SP2/PTCF%20Project/docs/kafka-local-dev.md).

## Documentation Map

| Need | Document |
| --- | --- |
| Local development setup | [LOCAL-DEVELOPMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/LOCAL-DEVELOPMENT-GUIDE.md) |
| Deployment workflow | [DEPLOYMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/DEPLOYMENT-GUIDE.md) |
| Project structure and file conventions | [PROJECT-ORGANIZATION.md](C:/BSCS/SP/SP2/PTCF%20Project/PROJECT-ORGANIZATION.md) |
| Local Kafka setup | [docs/kafka-local-dev.md](C:/BSCS/SP/SP2/PTCF%20Project/docs/kafka-local-dev.md) |
| Supabase Auth integration | [docs/supabase-auth.md](C:/BSCS/SP/SP2/PTCF%20Project/docs/supabase-auth.md) |
| Email verification workflow | [docs/email-testing-checklist.md](C:/BSCS/SP/SP2/PTCF%20Project/docs/email-testing-checklist.md) |
| UAT planning | [docs/UAT-PLAN.md](C:/BSCS/SP/SP2/PTCF%20Project/docs/UAT-PLAN.md) |

## Deployment Summary

- Frontend is deployed to Vercel.
- Backend is deployed to Render.
- Database and auth services are provided through Supabase.
- Production Kafka uses Aiven; local Kafka uses `docker-compose.kafka.yml`.
- UptimeRobot is used to ping the backend health endpoint for demo-oriented uptime support.

Use [DEPLOYMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/DEPLOYMENT-GUIDE.md) for the full deployment procedure, environment variables, smoke tests, and troubleshooting.

## Testing and Verification

- Root verification scripts are available through `npm run test:milestone-*` commands in [package.json](C:/BSCS/SP/SP2/PTCF%20Project/package.json).
- Backend-specific utility and workflow scripts are defined in [server/package.json](C:/BSCS/SP/SP2/PTCF%20Project/server/package.json).
- Milestone verification assets live in [milestone_tests/](C:/BSCS/SP/SP2/PTCF%20Project/milestone_tests) and [milestone_reports/](C:/BSCS/SP/SP2/PTCF%20Project/milestone_reports).
- API documentation is exposed through Swagger UI from `server/docs/swagger.json` at `http://localhost:4000/api-docs`.

Useful examples:

```powershell
npm run test:milestone-20
cd server
npm run kafka:check
```

## Maintenance Notes

- Treat the root README as the project entry point and navigation layer, not the full operational manual.
- Keep setup steps synchronized with [LOCAL-DEVELOPMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/LOCAL-DEVELOPMENT-GUIDE.md) instead of duplicating detailed instructions here.
- Keep deployment instructions synchronized with [DEPLOYMENT-GUIDE.md](C:/BSCS/SP/SP2/PTCF%20Project/DEPLOYMENT-GUIDE.md).
- When stack versions change, update them from the actual package manifests and authoritative docs rather than by memory.
