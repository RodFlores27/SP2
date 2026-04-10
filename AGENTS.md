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
| API docs (Swagger) | `server/docs/swagger.json` → rendered at `localhost:4000/api-docs` |
| Frontend pages | `client/src/pages/` |
| React components | `client/src/components/` |
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
- Firm bookings always require staff approval (`pending_approval` → `approved`). There is no `confirmed` status.
- `server/docs/swagger.json` must be updated whenever API endpoints are added or modified.
- Documentation files may occasionally lag behind the actual codebase by a small margin.
