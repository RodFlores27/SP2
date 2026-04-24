# PTCF Project — Agent Reference Index

This file is the single starting point for any AI assistant working on this project.
Read this before doing anything else.

---

## What This Project Is

**Room and Equipment Reservation System for UPLB ICropS Plant Tissue Culture Facility**
using Event-Driven Architecture with Apache Kafka.

- Academic solo SP2 project (CMSC 190), 4th year BSCS at UPLB
- Client: PTCF facility administrator and staff
- Solo developer with limited full-stack experience

---

## Read These Files First (in order)

| File | Purpose |
|------|---------|
| `C:\BSCS\SP\SP2\AI briefing document.txt` | Project briefing, stack, current status, **TODAY'S GOAL** |
| `PROJECT-ORGANIZATION.md` | Directory structure, naming conventions, seed test data |
| `milestone_reports/README.md` | Index of all completed milestone reports |
| `milestone_tests/README.md` | Index of all milestone verification test scripts |
| `docs/workflows/milestone-sync-seal.md` | What to generate at the end of each milestone |

---

## Milestone Context

- **Cadence:** 1 milestone = 1 day of work
- **Numbering:** Sequential across all weeks (Milestone 8 = Week 2 Day 1, Milestone 9 = Week 2 Day 2, etc.)
- **Current week plan:** `docs/milestones/week2-daily-brief.md`
- **Past weeks:** Add `docs/milestones/week{N}-daily-brief.md` as each week starts

---

## Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Tailwind v4 (CSS-first), shadcn/ui, React Router v7, React Big Calendar, React Hook Form + Zod, Axios |
| Backend | Node.js, Express.js, Sequelize ORM |
| Database | PostgreSQL via Supabase |
| Auth | JWT + bcrypt |
| Storage | Cloudinary (images + authorization docs) |
| Email | Resend |
| Events | KafkaJS (planned for Week 3) |
| Hosting | Vercel (frontend), Render (backend), UptimeRobot (keep-awake), Supabase (DB) |

---

## Dev Commands

```bash
# Start backend (port 4000)
cd server && npm run dev

# Start frontend (port 5173)
cd client && npm run dev

# Run a milestone verification test (from project root)
npm run test:milestone-{N}

# Run all milestone tests
npm run test:all
```

---

## Key File Paths

| What | Where |
|------|-------|
| Backend entry | `server/index.js` |
| Frontend entry | `client/src/main.jsx` |
| Auth middleware | `server/middleware/auth.middleware.js` |
| API routes | `server/routes/` |
| Controllers | `server/controllers/` |
| Sequelize models | `server/models/` |
| DB migrations | `server/migrations/` |
| Booking & contention transition catalog (IDs like P-01, F-01, EP-01; Section 13 changelog) | `docs/booking-transition-catalog-seed.md` |
| Staff-facing booking rules (plain language) | `docs/booking-system-rules-staff.md` |
| API docs (Swagger) | `server/docs/swagger.json` → rendered at `localhost:4000/api-docs` |
| Frontend pages | `client/src/pages/` |
| React components | `client/src/components/` |
| **Booking user-visible copy (UI)** | `client/src/messages/bookingMessages.jsx` (source); `bookingMessages.js` re-exports for tooling |
| **Booking user-visible copy (API, email, domain errors)** | `server/messages/bookingMessages.js` (`api`, `domain`, `email`; plain strings / string functions, no JSX) |
| Global styles | `client/src/index.css` |
| Cloudinary util | `server/utils/cloudinary.js` |
| Email transport | `server/utils/email.js` |

---

## Seed Test Users

| Email | Password | Role |
|-------|----------|------|
| student@uplb.edu.ph | password123 | regular_user |
| staff@uplb.edu.ph | staff123 | ptcf_staff |
| admin@uplb.edu.ph | admin123 | system_admin |

---

## Naming Conventions

| Artifact | Format | Location |
|----------|--------|----------|
| Test scripts | `milestone-{N}-{kebab-case}.js` | `milestone_tests/` |
| Completion reports | `MILESTONE-{N}-COMPLETION-REPORT.md` | `milestone_reports/` |
| Backend controllers | `{module}.controller.js` | `server/controllers/` |
| Backend routes | `{module}.routes.js` | `server/routes/` |
| Frontend pages | `{PageName}.jsx` (PascalCase) | `client/src/pages/` |
| Frontend components | `{ComponentName}.jsx` (PascalCase) | `client/src/components/` |

---

## Deployment References

- **`RENDER-SUPABASE-DEPLOYMENT.md`** — Canonical full-stack deploy guide (Vercel + Render + Supabase + UptimeRobot)
- `DEPLOYMENT-GUIDE.md` — Redirect only; points to the file above

---

## Important Notes

- Tailwind v4 CSS-first: never use `tailwind.config.js` for theme tokens; use `@theme` in CSS instead.
- All file uploads go through Cloudinary (`server/utils/cloudinary.js`). Never use local disk storage.
- All emails go through Resend (`server/utils/email.js`). Not nodemailer, not mailgun, not SendGrid.
- Firm bookings require staff approval (`pending_approval` → `approved`) **at least 24 hours before** the scheduled start; otherwise pending requests **`expired`** via cron. Approve, convert-to-firm, and create are blocked inside that 24-hour pre-start window. Firm cancellation is allowed anytime before start (including inside 24h). There is no `confirmed` status. A firm request may overlap other users’ pencils; those pencils are **`displaced` when staff approves** the firm—including after a **defender convert-to-firm** from contention—not at submit or at convert. Firm still cannot overlap another firm (`pending_approval` or `approved`). Overlapping pencil–pencil contention is automated (`contested` / `queued`); staff do not resolve pencil contests.
- `server/docs/swagger.json` must be updated whenever API endpoints are added or modified.
- After a **database re-seed** or demo reset, an old JWT may be rejected with **401** and `AUTH_USER_MISSING` (user id no longer exists). Sign in again. See `docs/booking-transition-catalog-seed.md` Section 13.2.
- Documentation files may occasionally lag behind the actual codebase by a small margin.
