# MILESTONE 11 COMPLETION REPORT

**Milestone:** 11 — Staff Dashboard  
**Date:** April 11, 2026  
**Project:** PTCF Room & Equipment Reservation System  
**Status:** ✅ Complete

---

## Requirements Checklist

| Deliverable | Status |
|-------------|--------|
| Pending approvals queue (staff-only view) | ✅ |
| Approve/deny UI with comment (staffRemark) field | ✅ |
| Conflict resolution view — contested bookings side-by-side | ✅ |
| Role-guarded `/staff` route (ptcf_staff + system_admin only) | ✅ |
| Staff-only nav link (hidden from regular users) | ✅ |
| `GET /api/bookings/:id/conflicts` backend endpoint | ✅ |
| Swagger documentation updated | ✅ |

---

## Implementation Summary

### Backend

**`server/controllers/booking.controller.js`**  
Added `getBookingConflicts` — fetches all active bookings that overlap the given booking's resource and time window using the existing `Booking.findConflicts()` static method with `excludeId` set to the target booking. Returns 404 if the booking does not exist.

**`server/routes/booking.routes.js`**  
Added `GET /:id/conflicts` route, restricted to `ptcf_staff` and `system_admin` via `authorizeRoles`.

**`server/docs/swagger.json`**  
Added full OpenAPI entry for `GET /bookings/{id}/conflicts` under the Bookings tag.

### Frontend

**`client/src/pages/StaffDashboard.jsx`** (new file, ~400 lines)  
Two-tab layout:

- **Pending Approvals tab** — fetches `GET /bookings?status=pending_approval`. Renders one `ApprovalCard` per booking. Each card shows: booking ID, resource name/type, requester email + user category, time range, `BookingStatusBadge`, purpose, authorization doc link. A "Review" button toggles an inline panel with a `staffRemark` textarea and green Approve / red Deny buttons. Actions call `PATCH /bookings/:id/approve` or `PATCH /bookings/:id/deny` then refresh.

- **Conflict Resolution tab** — fetches `GET /bookings?status=contested`. Client-side `groupContestedBookings()` clusters bookings by `resourceType:resourceId` then by time overlap. Each conflict group renders a header (resource name + time window) and a responsive 2-column grid of `ConflictBookingCard` components. Each card has its own `staffRemark` textarea and Approve/Deny buttons.

Tab headers display badge counts (primary color for pending, orange for conflicts).

**`client/src/App.jsx`**  
Added `StaffProtectedRoute` component (inline) that redirects unauthenticated users to `/login` and non-staff users to `/dashboard`. Registered `/staff` route.

**`client/src/components/Navigation.jsx`**  
Added "Staff Dashboard" link in both desktop nav and mobile menu, conditionally rendered when `user?.accountType === 'ptcf_staff' || user?.accountType === 'system_admin'`.

---

## API Endpoints Added

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/bookings/:id/conflicts` | Staff/Admin | Returns overlapping active bookings for the same resource/time window |

Existing endpoints used (no changes):

| Method | Path | Used for |
|--------|------|---------|
| GET | `/api/bookings?status=pending_approval` | Approvals queue |
| GET | `/api/bookings?status=contested` | Conflict resolution |
| PATCH | `/api/bookings/:id/approve` | Approve with staffRemark |
| PATCH | `/api/bookings/:id/deny` | Deny with staffRemark |

---

## Conflict Grouping Logic

```
contestedBookings
  → group by resourceType + resourceId
  → within each resource group, cluster bookings that overlap each other
     (greedy: add booking to cluster if it overlaps any existing cluster member)
  → render each cluster as one ConflictGroup card
```

This is pure client-side with no additional API calls.

---

## Verification Test

**Script:** `milestone_tests/milestone-11-staff-dashboard.js`  
**Run:** `npm run test:milestone-11`

Automated checks:
- Staff login and student login
- `GET /bookings?status=pending_approval` returns array for staff
- `GET /bookings?status=contested` returns array for staff
- `GET /bookings/:id/conflicts` returns array for staff
- Regular user blocked from conflicts endpoint (403)
- Unauthenticated request blocked from conflicts endpoint (401)
- Non-existent booking returns 404 from conflicts endpoint
- Regular user blocked from approve endpoint (403)
- Regular user blocked from deny endpoint (403)
- Staff can approve a pending_approval booking with staffRemark
- Staff can deny a contested booking with staffRemark

Manual UI checklist: 18 items covering nav visibility, route guarding, tab badges, card content, approve/deny flow, conflict grouping, side-by-side layout, empty states.

---

## Code Quality Notes

- No new dependencies introduced.
- `StaffProtectedRoute` is a lightweight inline component in `App.jsx` — no separate file needed given its simplicity.
- Conflict grouping is O(n²) within each resource group, acceptable given typical contested booking counts.
- All API calls use the existing `axiosInstance` (with JWT interceptor) for authenticated requests; public resource fetches use raw `fetch` consistent with `Dashboard.jsx` pattern.
- `staffRemark` state is keyed by booking ID in a shared map, so multiple cards can have independent remarks without interference.

---

## Security Considerations

- `/staff` route is guarded both client-side (role redirect) and server-side (`authorizeRoles` middleware on all approve/deny/conflicts endpoints).
- `staffRemark` is optional on approve, recommended on deny — consistent with existing backend behavior.

---

## Readiness Checklist

- [x] Backend endpoint added and swagger updated
- [x] StaffDashboard page created with both tabs
- [x] Route guard prevents regular users from accessing `/staff`
- [x] Nav link hidden from non-staff users
- [x] No linter errors in edited files
- [x] Verification test script written
- [x] Completion report written

---

## Next Steps (Milestone 12 — Day 12)

Per the week 2 plan:
- Scheduled job (node-cron): auto-expire pencil bookings past `expiryAt`
- Send 48hr and 24hr warning emails for expiring pencil bookings
- Admin panel: user list, role promotion (regular → staff), account management
