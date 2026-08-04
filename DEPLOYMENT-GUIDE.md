# PTCF Deployment Guide — Render + Supabase + Vercel

**Canonical deploy doc for this project.** Full stack: Vercel (frontend), Render (backend), Supabase (PostgreSQL), UptimeRobot (health pings). Older copies of `DEPLOYMENT-GUIDE.md` redirect here.

New developer? Start with [`LOCAL-DEVELOPMENT-GUIDE.md`](LOCAL-DEVELOPMENT-GUIDE.md) before deploying.

## Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Vercel    │─────▶│   Render    │─────▶│  Supabase   │
│  (Frontend) │      │  (Backend)  │      │ (PostgreSQL)│
└─────────────┘      └─────────────┘      └─────────────┘
                            ▲
                            │
                     ┌──────┴──────┐
                     │ UptimeRobot │
                     │(Health Ping)│
                     └─────────────┘
```

**Stack:**
- Frontend: Vercel (React + Vite)
- Backend: Render (Node.js + Express)
- Database: Supabase (PostgreSQL)
- Event broker: Aiven for Apache Kafka (production), Docker Compose Kafka (local development only)
- Monitoring: UptimeRobot (reduces Render free-tier cold starts)

**Demo/prototype cost:** Can be $0/month on free tiers, subject to each provider's limits.

---

## Before You Deploy

Use this quick pass before touching Supabase, Render, or Vercel:

1. Install dependencies in all three package roots:

   ```bash
   npm install
   cd server && npm install
   cd ../client && npm install
   ```

2. Confirm the seed CSV files exist in the server seed data folder:

   - `server/seed-data/PTCF-rooms-list.csv`
   - `server/seed-data/PTCF-equipments-list.csv`

   The production seed command depends on these files for rooms and equipment.

3. Keep environment files private:

   - `server/.env` is for local development.
   - `server/.env.production` is a private local helper for production-targeted CLI commands, such as migrations and seed/reset scripts.
   - Use `server/.env.example`, `server/.env.production.example`, and `client/.env.example` as safe templates.
   - Render does **not** need `server/.env.production`; the deployed backend uses the environment variables configured in the Render dashboard.
   - Do not commit `.env`, `.env.production`, or real secrets.

---

## Part 1: Set Up Supabase Database (10 minutes)

### Step 1: Create Supabase Project

1. **Go to:** https://supabase.com
2. **Sign up** with GitHub
3. **Create New Project:**
   - Name: `ptcf-reservation`
   - Database Password: (generate strong password - save it!)
   - Region: `Southeast Asia (Singapore)` (closest to Philippines)
   - Pricing Plan: **Free**
4. **Wait** for project to initialize (~2 minutes)

### Step 2: Get Database Connection String

1. **Go to:** Project Settings → Database
2. **Find:** Connection String → URI
3. **Copy** the connection string (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```
4. **Replace** `[YOUR-PASSWORD]` with your actual password
5. **Save** this for later (you'll need it for Render)

### Step 3: Run Database Migrations

Use Sequelize CLI locally. This is the safest path because it runs the same migrations used by local development.

```bash
# In your server directory
cd server

# Create a private local helper file for production CLI commands
# Use placeholders here only; put the real value in your private local file.
echo "DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres" > .env.production

# Run migrations
npx sequelize-cli db:migrate --env production
```

`server/config/config.cjs` loads `server/.env.production` for `--env production`. Render still uses Render dashboard environment variables when the deployed backend runs, not the local .env.production file.

Supabase SQL Editor is only recommended if you are comfortable translating every Sequelize migration under `server/migrations/` into equivalent SQL and running them in timestamp order. This project currently has more than 20 migration files, so avoid keeping a hand-written partial migration list in this guide.

### Step 4: Seed Initial Data (Optional)

Run your seeder to add test data. This depends on both CSV files in `server/seed-data/`.

```bash
npx sequelize-cli db:seed:all --env production
```

If `AUTH_PROVIDER=supabase`, sync the seeded `Users` rows into Supabase Auth after seeding:

```powershell
$env:NODE_ENV="production"
npm run sync:supabase-auth
Remove-Item Env:\NODE_ENV
```

On macOS / Linux:

```bash
NODE_ENV=production npm run sync:supabase-auth
```

Or manually insert via Supabase SQL Editor if you are intentionally managing all required rows yourself.

Optional extra seeded admin (local or production seed runs):

- `SEED_EXTRA_ADMIN_EMAIL` (required to enable this feature)
- `SEED_EXTRA_ADMIN_PASSWORD` (required when email is set)
- `SEED_EXTRA_ADMIN_USER_CATEGORY` (optional; default `null`)

Example (PowerShell):

```bash
$env:SEED_EXTRA_ADMIN_EMAIL="rodolfopfloresiii27@gmail.com"
$env:SEED_EXTRA_ADMIN_PASSWORD="your-secure-temp-password"
npx sequelize-cli db:seed:all --env development
```

This keeps the default seeded admin (`admin@uplb.edu.ph`) and adds your preferred test admin as a second `system_admin`.

### Step 5: MVP demo — backup before a full reset

**Wiping data is irreversible** if you have no backup.

1. In **Supabase Dashboard**, use **Database → Backups** if your plan includes point-in-time or daily backups.
2. On the **free tier**, backups may be limited: export anything you must keep (e.g. run a manual SQL export or copy critical rows) before resetting.
3. Share demo credentials only over a private channel; seeded passwords are documented in [`PROJECT-ORGANIZATION.md`](PROJECT-ORGANIZATION.md).

### Step 6: MVP demo — schema/seed flow for production

Use the flow that matches your production DB state.

#### Case A: brand-new production DB (empty schema)

Run migrations first, then seed data.

```bash
npx sequelize-cli db:migrate --env production
npx sequelize-cli db:seed:all --env production
```

Sync Supabase Auth when `AUTH_PROVIDER=supabase`.

```powershell
# Windows PowerShell
$env:NODE_ENV="production"
npm run sync:supabase-auth
Remove-Item Env:\NODE_ENV
```

```bash
# macOS / Linux
NODE_ENV=production npm run sync:supabase-auth
```

#### Case B: existing production DB (refresh demo data)

Use this when you need a **clean slate** (remove stray registrations, refresh demo bookings). `reset:mvp-demo` deletes **all** rows in `Bookings`, `Users`, `Equipment`, and `Rooms`, clears **SequelizeData** (seed history) when that table exists, and does **not** touch **SequelizeMeta** (migrations).

`config.cjs` loads `.env.production` automatically for `--env production`, so you do not need to re-type `NODE_ENV` or `DATABASE_URL` if they are already set in `.env.production`. Keep `ALLOW_MVP_DEMO_RESET` manual as a safety gate. After reseeding, run `npm run sync:supabase-auth` when `AUTH_PROVIDER=supabase`.

```bash
# Windows PowerShell
$env:ALLOW_MVP_DEMO_RESET="1"
npm run reset:mvp-demo
npx sequelize-cli db:seed:all --env production
npm run sync:supabase-auth
Remove-Item Env:\ALLOW_MVP_DEMO_RESET
```

```bash
# CMD
set ALLOW_MVP_DEMO_RESET=1
npm run reset:mvp-demo
npx sequelize-cli db:seed:all --env production
npm run sync:supabase-auth
set ALLOW_MVP_DEMO_RESET=
```

```bash
# macOS / Linux
export ALLOW_MVP_DEMO_RESET=1
npm run reset:mvp-demo
npx sequelize-cli db:seed:all --env production
npm run sync:supabase-auth
unset ALLOW_MVP_DEMO_RESET
```

**Local dev reset** (uses `development` in `config.cjs` and your `.env` `DB_*` variables; no `ALLOW_` flag needed):

```bash
npm run reset:mvp-demo
npx sequelize-cli db:seed:all --env development
```

---

## Part 2: Deploy Backend to Render (15 minutes)

### Step 1: Prepare Backend for Render

This project currently uses manual Render dashboard configuration as the main deployment path.

1. **Ensure your `server/package.json`** has the correct start script: `npm start`
2. **Do not rely on `render.yaml`** unless it has been intentionally populated. The current file is empty, so configure the service directly in Render.

### Step 2: Deploy to Render

1. **Go to:** https://render.com
2. **Sign up** with GitHub
3. **Click:** New → Web Service
4. **Connect** your GitHub repository
5. **Configure:**
   - **Name:** `ptcf-backend`
   - **Region:** `Singapore` (closest to Philippines)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### Step 3: Add Environment Variables

In Render dashboard, add these environment variables. You can look up ./server/.env.production.example which contains additional details about certain variables on how to declare them:

```bash
# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Auth mode
AUTH_PROVIDER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLIENT_URL=https://your-frontend-domain.com
FRONTEND_URL=https://your-frontend-domain.com
SUPABASE_AUTH_REDIRECT_URL=https://your-frontend-domain.com
SUPABASE_PASSWORD_RESET_REDIRECT_URL=https://your-frontend-domain.com/reset-password

# Cloudinary (your existing credentials)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Resend (app/booking transactional email)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@mail.yourdomain.dev

# Kafka (Aiven production broker)
KAFKA_ENABLED=true
KAFKA_CLIENT_ID=ptcf-booking-system
KAFKA_BROKERS=your-aiven-host:your-aiven-port
KAFKA_SSL=true
KAFKA_USERNAME=your-aiven-username
KAFKA_PASSWORD=your-aiven-password
KAFKA_SASL_MECHANISM=your-aiven-sasl-mechanism
KAFKA_CA_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
KAFKA_BOOKING_EVENTS_TOPIC=booking-events
KAFKA_AUTO_CREATE_TOPICS=false
KAFKA_NOTIFICATION_CONSUMER_GROUP=notification-consumer
KAFKA_AUDIT_CONSUMER_GROUP=audit-log-consumer
KAFKA_ANALYTICS_CONSUMER_GROUP=analytics-consumer

# Node Environment
NODE_ENV=production

# Port (Render provides this automatically, but you can set it)
PORT=4000
```

App-triggered booking emails and the app's normal auth emails are sent through the backend Resend transport, so `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are the key production settings here.

Application emails (booking notifications, approvals, reminders, etc.) are sent by the backend using Resend. 

- Backend email transport:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`

On the other hand, Authentication emails (password resets, email verification, magic links, etc.) are generated by Supabase Auth. To have those authentication emails also come from your Resend sender address, configure Supabase's SMTP settings as follows:

 - Open your project in the Supabase Dashboard.
 - Go to Authentication (left sidebar).
 - Click Emails.
 - Scroll to the SMTP Settings (or Custom SMTP) section.
 - Enable Custom SMTP.
 - Fill in the Supabase Auth SMTP settings:
   - `Host: smtp.resend.com`
   - `Port Number: 465`
   - `Username: resend`
   - `Password: your Resend API key`
   - `Sender name: PTCF Reservation System`
   - `Sender email: your verified Resend sender`

See `docs/supabase-auth.md` for the full Google OAuth, Resend SMTP, and DNS checklist. Use `docs/email-testing-checklist.md` for the end-to-end auth and booking email test pass.

Kafka note:

- Production should use Aiven, not the local Docker Kafka container.
- Keep `KAFKA_SSL=true` for Aiven.
- Use the SASL mechanism shown by Aiven Quick Connect. Do not assume `plain` if Quick Connect shows `SCRAM-SHA-256`.
- If Aiven Quick Connect shows `ssl.ca.location = "ca.pem"`, copy that certificate into `KAFKA_CA_CERT` on Render.
- Create `booking-events` manually in Aiven and keep `KAFKA_AUTO_CREATE_TOPICS=false` for normal production use.

### Step 4: Deploy

1. **Click:** "Create Web Service"
2. **Wait** for deployment (~5-10 minutes)
3. **Check logs** for any errors
4. **Get your URL:** `https://ptcf-backend.onrender.com`

### Step 5: Test Backend

```bash
# Test health endpoint
curl https://ptcf-backend.onrender.com/api/health

# Should return:
# {"status":"ok","message":"PTCF server is running"}
```

### Step 6: Kafka production setup and validation

1. Provision an **Aiven for Apache Kafka** service in the closest practical region.
2. Create or confirm the Kafka topic in Aiven:

```txt
booking-events
```

3. Copy the Aiven broker host, port, username, password, SASL mechanism, and CA certificate into the Render environment variables listed above.
4. Redeploy the backend after saving the new Kafka settings.
5. Run the Kafka connectivity check against the deployed configuration.

Local check command:

```bash
cd server
npm run kafka:check
```

The check should confirm:

- Kafka is enabled
- hosted mode is detected
- producer connectivity succeeds
- `booking-events` is reachable

6. Perform one real test booking in the deployed app and verify:

- booking write succeeds
- Kafka event publish succeeds in logs
- notification side effect runs
- `AuditLogs` receives a row
- `BookingAnalyticsEvents` receives a row
- admin endpoints expose the new audit/analytics side effects

If Kafka credentials are wrong or Aiven is unavailable, the booking API should still persist to PostgreSQL while Kafka side effects degrade until the connection is fixed.

---

## Part 3: Set Up UptimeRobot (5 minutes)

**Why?** Render free web services can spin down after inactivity. UptimeRobot pings your health endpoint every 5 minutes, which helps reduce cold starts during demos.

### Step 1: Create UptimeRobot Account

1. **Go to:** https://uptimerobot.com
2. **Sign up** (free account)
3. **Verify** your email

### Step 2: Add Monitor

1. **Click:** "Add New Monitor"
2. **Configure:**
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `PTCF Backend`
   - **URL:** `https://ptcf-backend.onrender.com/api/health`
   - **Monitoring Interval:** `5 minutes` (free tier)
3. **Click:** "Create Monitor"

### Step 3: Verify

- Monitor should show "Up" status
- Your Render service should have fewer cold starts during demo periods
- You'll get email alerts if your backend goes down

**Pro Tip:** Add a simple health check endpoint if you don't have one:

```javascript
// server/index.js (you already have this)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PTCF server is running' });
});
```

---

## Part 4: Deploy Frontend to Vercel (10 minutes)

### Step 1: Push Latest Changes to GitHub
### Step 2: Deploy to Vercel

1. **Go to:** https://vercel.com
2. **Sign in** with GitHub
3. **Click:** "Add New Project"
4. **Import** your repository
5. **Configure:**
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### Step 3: Add Environment Variable

**Key:** `VITE_API_URL`  
**Value:** `https://ptcf-backend.onrender.com/api` (use your real Render service URL)

The client sets Axios `baseURL` from `import.meta.env.VITE_API_URL` in [`client/src/lib/axios.js`](client/src/lib/axios.js); it must include the **`/api` suffix** so requests hit `https://…onrender.com/api/...`, not the bare origin.

#### Verify `VITE_API_URL` before sharing the app

1. In Vercel → **Project → Settings → Environment Variables**, confirm `VITE_API_URL` is set for **Production** (and **Preview** if you rely on preview deployments).
2. **Redeploy** after any change to `VITE_*` variables (Vite inlines them at build time).
3. Smoke-check in the browser: **DevTools → Network** → log in or open equipment list → confirm request URLs use your **Render** host, not `localhost`.

### Step 4: Deploy

1. **Click:** "Deploy"
2. **Wait** (~2-3 minutes)
3. **Get your URL:** `https://ptcf-reservation.vercel.app`

---

## Part 5: Testing Your Deployment

### Test Checklist

```bash
# 1. Test backend health
curl https://ptcf-backend.onrender.com/api/health

# 2. Test database connection
curl https://ptcf-backend.onrender.com/api/equipment

# 3. Test frontend
# Open in browser: https://ptcf-reservation.vercel.app
```

### Manual Testing

1. **Visit your Vercel URL**
2. **Test public pages:**
   - ✅ Equipment listing loads
   - ✅ Room listing loads
   - ✅ Images display correctly
3. **Test authentication:**
   - ✅ Login with: `staff@uplb.edu.ph` / `staff123`
   - ✅ Dashboard accessible
4. **Test CRUD operations:**
   - ✅ Create new equipment
   - ✅ Edit equipment
   - ✅ Delete equipment
   - ✅ Upload images
   - ✅ Remove images
5. **Test protected routes:**
   - ✅ Equipment detail page (requires auth)
   - ✅ Room detail page (requires auth)

### After an MVP demo reset (`reset:mvp-demo` + `db:seed:all`)

1. **Student** (`student@uplb.edu.ph` / `password123`): dashboard and calendar show pencils and a **pending approval** firm booking where applicable.
2. **Staff** (`staff@uplb.edu.ph` / `staff123`): staff dashboard shows **contested** pencils and at least one **pending approval** queue item; approve/deny still works.
3. **Admin** (`admin@uplb.edu.ph` / `admin123`): admin panel lists **five** seeded users (including `researcher1` / `researcher2`).
4. **Calendar** (any role): upcoming demo events appear on future dates.

---

## Troubleshooting

### Issue: CORS Error

The backend currently uses permissive CORS in `server/index.js`:

```javascript
app.use(cors());
```

That should allow requests from Vercel while the project is in demo mode. If you later tighten CORS for production, use an allowlist callback rather than a literal wildcard string:

```javascript
// server/index.js
const allowedOrigins = [
  'http://localhost:5173',
  'https://ptcf-reservation.vercel.app',
];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/.+\.vercel\.app$/.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
```

Redeploy Render after making this change.

### Issue: Database Connection Failed

**Check:**
1. Supabase DATABASE_URL is correct in Render env vars
2. Password doesn't have special characters that need URL encoding
3. Supabase project is active (not paused)

**Fix:** Update DATABASE_URL in Render and redeploy.

### Issue: Images Not Uploading

**Check:**
1. Cloudinary credentials are correct in Render
2. Check Render logs for upload errors
3. Verify Cloudinary account is active

### Issue: Render Service Sleeping

**Check:**
1. UptimeRobot monitor is active
2. Monitor interval is 5 minutes
3. Health endpoint is responding

**Note:** First request after sleep may take 30-60 seconds (cold start).

### Issue: Frontend Can't Reach Backend

**Check:**
1. `VITE_API_URL` in Vercel matches your Render URL (must include `/api` suffix, e.g. `https://your-service.onrender.com/api`)
2. Redeploy Vercel after changing env vars — only variables prefixed with `VITE_` are exposed to the client
3. Check browser console for CORS errors

---

## Alternatives (not the main path)

### Frontend-only on Vercel (API still local)

You can deploy the client and temporarily set `VITE_API_URL` to `http://localhost:4000/api` for experiments, but **production users’ browsers cannot reach your laptop**. Use this only for learning.

### Why not host the Express app on Vercel?

Serverless functions on Vercel expect a different shape than a long-running Express server. This repo uses **Render** for the backend so file uploads, sessions, and PostgreSQL via Sequelize stay straightforward.

### Why not use Docker Kafka in production?

The local `docker-compose.kafka.yml` setup is only for development and milestone testing. Production should use Aiven so Kafka stays available independently of the app host and does not rely on a local broker container.

---

## Repository files (deployment-related)

| File | Role |
|------|------|
| `client/vercel.json` | Vercel routing / SPA fallback |
| `client/.env.example` | Template for `VITE_API_URL` locally |
| `server/.env.example` | Template for local backend development |
| `server/.env.production.example` | Template for trusted local production CLI commands |
| `client/src/lib/axios.js` | API base URL from env |
| `client/src/lib/imageUpload.js` | Upload URL from env |

Local dev remains backward compatible: point `VITE_API_URL` at `http://localhost:4000/api`.

---

## Post-Deployment Checklist

- [ ] Backend deployed to Render
- [ ] Database running on Supabase
- [ ] Frontend deployed to Vercel
- [ ] UptimeRobot monitoring active
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] All endpoints tested
- [ ] Authentication working
- [ ] Image upload working
- [ ] CRUD operations working

---

## Monitoring & Maintenance

### Daily Checks
- Check UptimeRobot dashboard for uptime status
- Monitor Render logs for errors

### Weekly Checks
- Review Supabase database size (free tier: 500MB)
- Check Render usage and build minutes in the dashboard
- Verify Vercel bandwidth usage (free tier: 100GB/month)

### Monthly Checks
- Review error logs
- Check for security updates
- Test all critical features

---

## Upgrade Paths (If Needed)

### If You Exceed Free Tiers:

**Render:**
- Free web service: useful for prototypes and demos, with provider limits
- Paid: $7/month (no sleep, more resources)

**Supabase:**
- Free: 500MB database, plus current free-tier bandwidth/Auth/storage limits
- Pro: starts at $25/month, with higher database and bandwidth limits

**Vercel:**
- Free: 100GB bandwidth
- Pro: $20/month (1TB bandwidth)

**Total if all paid:** ~$52/month (unlikely for student project)

---

## Useful Commands

```bash
# View Render logs
# Go to: https://dashboard.render.com → Your Service → Logs

# Redeploy Render (after code changes)
git push origin main
# Render auto-deploys on push

# Redeploy Vercel (after env var changes)
# Go to: Vercel Dashboard → Deployments → Redeploy

# Check Supabase database
# Go to: Supabase Dashboard → Table Editor

# Force Render wake-up
curl https://ptcf-backend.onrender.com/api/health
```

---

## Support Resources

- **Render Docs:** https://render.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **UptimeRobot Docs:** https://uptimerobot.com/help

---

## Summary

**Your deployment stack:**
- ✅ Frontend: Vercel (fast, reliable, free)
- ✅ Backend: Render (free, auto-deploy, good for Node.js)
- ✅ Database: Supabase (better than Render's PostgreSQL, free)
- ✅ Monitoring: UptimeRobot (reduces Render cold starts on free web services)

**Total setup time:** ~40 minutes
**Demo/prototype cost:** Can be $0/month on free tiers
**Uptime:** Free-tier services are suitable for demos, but they do not provide a production uptime guarantee.

Well suited for student projects and demos.
