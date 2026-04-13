# MILESTONE 12 COMPLETION REPORT

**Milestone:** 12 — Scheduled Jobs + Admin Panel  
**Date:** April 11, 2026  
**Project:** PTCF Room & Equipment Reservation System  
**Status:** ✅ Complete

---

## Requirements Checklist

| Deliverable | Status |
|-------------|--------|
| Scheduled job: auto-expire pencil bookings past `expiryAt` | ✅ |
| Expiry warning emails (48hr and 24hr) | ✅ |
| Admin panel: user list with search | ✅ |
| Admin panel: role promotion/demotion (regular_user ↔ ptcf_staff ↔ system_admin) | ✅ |
| Admin panel: account deletion with confirmation | ✅ |
| Admin-only route guard (`/admin`) | ✅ |
| Admin-only nav link | ✅ |
| Swagger documentation for admin endpoints | ✅ |

---

## Implementation Summary

### Part A: Scheduled Jobs

**`server/jobs/booking-expiry.js`** (new file)  
Uses `node-cron` with two scheduled tasks:

- **Expire job** (`*/15 * * * *` — every 15 minutes): Queries all bookings with `status = 'penciled'` AND `expiryAt <= NOW()`. Sets each to `status = 'expired'` and fires `notifyBookingExpired` non-blocking.
- **Warning job** (`0 0 * * *` — daily at 00:00 UTC / 08:00 PH): Queries pencil bookings with `expiryAt` in the 47–49h window (48hr warning) and 23–25h window (24hr warning). Fires `notifyBookingExpiringSoon(booking, resourceName, 48|24)` for each.

The cron job is started inside the `sequelize.authenticate().then(...)` callback in `server/index.js` so it only runs after the DB connection is confirmed.

**`server/utils/booking-notifications.js`** — two new functions added:
- `notifyBookingExpired(booking, resourceName)` — "Your pencil booking has expired" email with red banner
- `notifyBookingExpiringSoon(booking, resourceName, hoursLeft)` — urgency-styled warning email with CTA to convert to firm

**`server/index.js`** — added `require('./jobs/booking-expiry')` inside DB connect callback; added `app.use('/api/admin', adminRoutes)`.

### Part B: Admin Panel

**`server/controllers/admin.controller.js`** (new)
- `listUsers` — returns all users ordered by `createdAt DESC`, attributes: id, email, accountType, userCategory, createdAt
- `updateUserRole` — validates role is one of `[regular_user, ptcf_staff, system_admin]`, blocks self-role-change, updates `accountType`
- `deleteUser` — blocks self-delete, hard-deletes via `user.destroy()`

**`server/routes/admin.routes.js`** (new)  
All three routes use `router.use(authenticateToken, authorizeRoles(['system_admin']))` as middleware.

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/admin/users` | `listUsers` |
| PATCH | `/api/admin/users/:id/role` | `updateUserRole` |
| DELETE | `/api/admin/users/:id` | `deleteUser` |

**`server/docs/swagger.json`** — added `Admin` tag and full OpenAPI entries for all three admin endpoints.

**`client/src/pages/AdminPanel.jsx`** (new, ~270 lines)
- Stats row: card counts for each role
- User list with client-side email search
- Per-row role `<select>` — fires `PATCH /admin/users/:id/role` on change; disabled for self
- Per-row delete button — opens `ConfirmDialog`; disabled for self
- Error banners for role and delete failures
- Refresh button

**`client/src/App.jsx`** — added `AdminProtectedRoute` (redirects non-`system_admin` to `/dashboard`) and `/admin` route.

**`client/src/components/Navigation.jsx`** — added "Admin Panel" link in desktop and mobile nav, visible only when `user?.accountType === 'system_admin'`.

---

## API Endpoints Added

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/users` | system_admin | List all users |
| PATCH | `/api/admin/users/:id/role` | system_admin | Update user role |
| DELETE | `/api/admin/users/:id` | system_admin | Delete user account |

---

## Technical Notes

- **Cron timezone:** The warning job runs at `0 0 * * *` UTC, which is 08:00 AM Philippine Standard Time (UTC+8). This is a reasonable morning check time for daily warnings.
- **Hard delete vs soft delete:** The current implementation uses hard delete (`user.destroy()`). A soft-delete approach (adding an `isActive` column via migration) would be better long-term but was deferred to avoid a DB migration mid-week. Flagged for future improvement.
- **node-cron installed:** Added to `server/package.json` as a production dependency.
- **Self-protection guards:** Both role-change and delete endpoints block the admin from modifying their own account, preventing accidental lockout.

---

## Verification Test

**Script:** `milestone_tests/milestone-12-cron-and-admin.js`  
**Run:** `npm run test:milestone-12`

Automated checks:
- Admin, staff, and student login
- Admin can list users (array + field validation)
- Staff blocked from /admin/users (403)
- Student blocked from /admin/users (403)
- Unauthenticated blocked (401)
- Admin promotes regular_user to ptcf_staff and restores
- Admin blocked from changing own role (400)
- Invalid accountType rejected (400)
- Non-existent user returns 404 on role update
- Admin blocked from deleting own account (400)
- Non-existent user returns 404 on delete
- Staff blocked from DELETE /admin/users/:id (403)
- Booking notifications module exports all 6 functions
- Cron job file exists and contains expected logic

Manual UI checklist: 17 items covering nav visibility, route guarding, stats cards, user list, search, role dropdown, self-protection, delete flow, and cron log verification.

---

## Readiness Checklist

- [x] node-cron installed and cron jobs wired
- [x] Expiry + warning notification functions added
- [x] Admin controller + routes created
- [x] Swagger updated with admin endpoints and tag
- [x] AdminPanel page created with all three features
- [x] Route guard and nav link added
- [x] No linter errors in edited files
- [x] Verification test script written
- [x] Completion report written

---

## Next Steps (Milestone 13 — Day 13)

Per the week 2 plan:
- Full deployment push: Render backend live, Vercel frontend live, Supabase DB connected
- Smoke test the full booking flow end-to-end on staging URL
- Bug fixes from smoke test; polish UI (empty states, loading spinners, error messages)
