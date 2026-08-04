# PTCF Local Development Guide

Use this guide to run the PTCF project on your machine before touching production deployment.

## Prerequisites

- Git
- Node.js and npm
- PostgreSQL access, either local PostgreSQL or a Supabase PostgreSQL database
- Docker Desktop, only if you want local Kafka features
- Supabase credentials, if `AUTH_PROVIDER=supabase`
- Cloudinary credentials, if you will test image uploads
- Resend credentials, if you will test real email delivery

## 1. Install Dependencies

From the project root:

```powershell
npm install
cd server
npm install
cd ../client
npm install
cd ..
```

## 2. Create Local Environment Files

Copy the safe examples, then fill in real local values:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Do not commit `.env` files or real secrets.

Important local values:

- `server/.env`: database, auth, Cloudinary, Resend, server, and optional Kafka settings
- `client/.env`: frontend API URL
- `VITE_API_URL` should usually be `http://localhost:4000/api`
- `AUTH_PROVIDER=supabase` requires Supabase URL, anon key, and service role key
- `KAFKA_ENABLED=false` lets you run the app without Kafka first

## 3. Confirm Seed Data

The foundation seed uses these CSV files:

- `server/seed-data/PTCF-rooms-list.csv`
- `server/seed-data/PTCF-equipments-list.csv`

If either file is missing, seeding rooms and equipment will fail.

## 4. Prepare the Database

From the server directory:

```powershell
cd server
npm run migrate
npm run seed:foundation
```

If `AUTH_PROVIDER=supabase`, sync the seeded app users into Supabase Auth:

```powershell
npm run sync:supabase-auth
```

Default seeded accounts:

| Account | Password |
| --- | --- |
| `student@uplb.edu.ph` | `password123` |
| `staff@uplb.edu.ph` | `staff123` |
| `admin@uplb.edu.ph` | `admin123` |
| `researcher1@uplb.edu.ph` | `password123` |
| `researcher2@uplb.edu.ph` | `password123` |

## 5. Run Without Kafka

Start the backend from `server`:

```powershell
npm run dev
```

In a second terminal, start the frontend from the project root:

```powershell
cd client
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```txt
http://localhost:5173
```

The backend health endpoint should be available at:

```txt
http://localhost:4000/api/health
```

## 6. Optional: Enable Local Kafka

Start Kafka from the project root:

```powershell
docker compose -f docker-compose.kafka.yml up
```

In `server/.env`, set:

```env
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
```

Then validate Kafka from `server`:

```powershell
npm run kafka:check
```

Restart the backend after changing Kafka environment values.

## 7. Smoke Test Checklist

- Backend health returns `{"status":"ok","message":"PTCF server is running"}`
- Equipment list loads
- Room list loads
- Login works with the seeded student, staff, or admin account
- Dashboard loads after login
- A room or equipment detail page opens
- Image upload works if Cloudinary values are configured
- Email-related actions do not crash the app; real delivery requires Resend values
- If Kafka is enabled, `npm run kafka:check` succeeds and booking actions still persist to PostgreSQL

## 8. Optional: Reset the database
**Local dev reset** (uses `development` in `config.cjs` and your `.env` `DB_*` variables):

```bash
npm run reset:mvp-demo
npm run seed:foundation
```

If `AUTH_PROVIDER=supabase`, sync the seeded app users into Supabase Auth:

```powershell
npm run sync:supabase-auth
```

## 9. Common Issues

- Database connection fails: check `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DIALECT`.
- Login fails with Supabase Auth: run `npm run sync:supabase-auth` after seeding.
- Frontend calls the wrong backend: check `client/.env` and confirm `VITE_API_URL=http://localhost:4000/api`.
- Seed fails with missing CSV: confirm both files exist in `server/seed-data/`.
- Kafka errors during normal local work: set `KAFKA_ENABLED=false` and restart the backend.
- Port conflict: change `PORT` in `server/.env` or stop the process using port `4000`.

For production deployment, use `DEPLOYMENT-GUIDE.md`.
