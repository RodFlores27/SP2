# Milestone 10 Completion Report
**Date:** April 10, 2026  
**Project:** PTCF Room & Equipment Reservation System  
**Status:** ✅ **COMPLETE — READY FOR MILESTONE 11**

---

## Milestone 10 Requirements (From Project Plan)

### Required Deliverables
1. ✅ User booking dashboard: my bookings list with status badges
2. ✅ Cancel button with 24-hour rule enforcement
3. ✅ Convert-to-firm button with authorization document upload
4. ✅ Inline conflict alerts for contested bookings
5. ✅ Resend integration: `booking.created` transactional email
6. ✅ Resend integration: `booking.approved` transactional email
7. ✅ Resend integration: `booking.denied` transactional email
8. ✅ Resend integration: `booking.cancelled` transactional email

---

## Implementation Summary

### 1. User Booking Dashboard (`/dashboard`) ✅
**Files Modified/Created:**
- `../../../client/src/pages/Dashboard.jsx` — Full replacement of placeholder page

**Features Implemented:**
- Fetches authenticated user's bookings via `GET /api/bookings` using `axiosInstance` (JWT auto-attached)
- Fetches equipment and room lists (public endpoints) to resolve resource names client-side
- **Active Bookings** section: cards for bookings not in `cancelled`, `denied`, or `expired` states
- **Past Bookings** section: reduced-opacity cards for inactive bookings
- Empty state with link to create a new booking
- Refresh button and "New Booking" link in header
- Loading and error states handled

### 2. BookingStatusBadge Component ✅
**Files Created:**
- `../../../client/src/components/BookingStatusBadge.jsx`

**Features Implemented:**
- Separate from `StatusBadge.jsx` (which handles resource availability)
- Covers all 7 booking lifecycle statuses: `penciled`, `contested`, `pending_approval`, `approved`, `denied`, `cancelled`, `expired`
- Color-coded: green (approved), yellow (pending), blue (penciled), orange (contested), red (denied), gray (cancelled/expired)
- Displays booking type badge alongside status badge

### 3. Cancel Action ✅
**Files Modified:**
- `../../../client/src/pages/Dashboard.jsx`

**Features Implemented:**
- Cancel button shown only for cancellable bookings (not already cancelled/denied/expired AND more than 24h before start)
- Uses existing `ConfirmDialog` component for confirmation
- Calls `PATCH /api/bookings/:id/cancel`
- On success: refreshes booking list
- On failure: shows inline error banner with dismiss button (e.g., "Cannot cancel within 24 hours")

### 4. Convert-to-Firm Inline Panel ✅
**Files Modified:**
- `../../../client/src/pages/Dashboard.jsx`

**Features Implemented:**
- "Convert to Firm" button shown only on eligible pencil bookings
- Expands an inline panel below the booking card (toggle open/close)
- File upload area with drag-target styling; validates type (PDF, DOC, DOCX, JPG, PNG) and size (≤5 MB) — same rules as `BookingForm.jsx`
- Uses `fetch` with `FormData` and manual JWT header (mirrors `BookingForm.jsx` multipart pattern)
- On `409` conflict: shows conflict list with resource name, booking type, status, and time range
- On success: collapses panel and refreshes list

### 5. Inline Conflict Alerts ✅
**Files Modified:**
- `../../../client/src/pages/Dashboard.jsx`

**Features Implemented:**
- Contested bookings show a persistent orange alert banner at the top of their card
- Convert-to-firm `409` conflicts are shown inline within the convert panel

### 6. Resend Email Utilities ✅
**Files Created:**
- `../../../server/utils/email.js` — Thin wrapper around the `resend` SDK; reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from env; failures are logged but never throw
- `../../../server/utils/booking-notifications.js` — Four transactional email functions:
  - `notifyBookingCreated(booking, resourceName)` — sent after successful `POST /bookings`
  - `notifyBookingApproved(booking, resourceName)` — sent after staff approves
  - `notifyBookingDenied(booking, resourceName)` — sent after staff denies
  - `notifyBookingCancelled(booking, resourceName, cancelledBy)` — sent after cancellation; includes a note if cancelled by staff

**Email Template Features:**
- HTML emails with inline styles (compatible with email clients)
- Booking details table: ID, resource name, type, start/end times, purpose
- Status-appropriate messaging (contested warning, pencil expiry note, pending approval note)
- Link back to `/dashboard` or `/bookings/new`
- Times formatted in Asia/Manila timezone

### 7. Notification Hooks in Controller ✅
**Files Modified:**
- `../../../server/controllers/booking.controller.js`

**Changes:**
- Added `resolveResourceName(resourceType, resourceId)` helper to look up resource name from DB
- Imported all 4 notification functions
- `createBooking`: fires `notifyBookingCreated` after `res.status(201).json(response)`
- `cancelBooking`: fires `notifyBookingCancelled` after `res.json(...)`, passing `req.user.id` as `cancelledBy`
- `approveBooking`: fires `notifyBookingApproved` after `res.json(...)`
- `denyBooking`: fires `notifyBookingDenied` after `res.json(...)`
- All notifications are **non-blocking**: called with `.then(...).catch(() => {})` after the response is sent

---

## Verification Tests ✅
**Test Script:** `../milestone_testssts/milestone-10-booking-dashboard-and-emails.js`

### Automated Test Scenarios (13)
- ✅ Student login returns JWT
- ✅ Staff login returns JWT
- ✅ Student sees only own bookings from `GET /bookings`
- ✅ Staff sees all bookings from `GET /bookings`
- ✅ Create pencil booking (booking.created hook fires)
- ✅ Cancel booking >24h ahead (booking.cancelled hook fires)
- ✅ Create second pencil booking for convert test
- ✅ Cancel within 24h correctly rejected with 400
- ✅ Convert pencil to firm with PDF upload (booking type → firm, status → pending_approval)
- ✅ Convert to firm without file rejected with 400
- ✅ Staff approve firm booking (booking.approved hook fires)
- ✅ Staff deny pending booking (booking.denied hook fires)
- ✅ Email notification module exports all 4 functions

### Manual UI Checklist (18 points)
See test script output for full checklist. Key items:
- Dashboard shows active/past booking sections
- Contested bookings show inline orange alert
- Cancel button only on eligible bookings; ConfirmDialog works
- Convert panel expands/collapses; file validation enforced
- Convert conflicts shown inline in panel
- Empty state with create link

---

## Code Quality Assessment

### Strengths
- Email sends are fully non-blocking — API response time is unaffected by Resend latency or failures
- `RESEND_API_KEY` absence is handled gracefully with a warning log (safe for local dev without credentials)
- Resource name resolution is done in the notification helper, keeping controllers clean
- Convert-to-firm panel reuses the same file validation constants and multipart upload pattern from `BookingForm.jsx`
- `BookingStatusBadge` is a separate component from `StatusBadge` — no overloading of resource availability styles

### Security Considerations
- JWT token retrieved from `localStorage` for multipart fetch calls (same pattern as `BookingForm.jsx`)
- `RESEND_API_KEY` read from environment variable only; never hardcoded
- Email recipients are always the booking owner's email from the DB — no user-supplied email addresses used

---

## Milestone 11 Readiness Checklist
- ✅ All booking lifecycle endpoints tested and working
- ✅ Email notifications wired and non-blocking
- ✅ Dashboard page live at `/dashboard`
- ✅ `BookingStatusBadge` available for reuse in staff dashboard
- ✅ `ConfirmDialog` pattern established for destructive actions
- ✅ Swagger docs unchanged (no new API endpoints in this milestone)

---

## Next Steps (Milestone 11)
Staff dashboard: pending approvals queue, approve/deny UI with comment field, conflict resolution view (contested bookings side-by-side).

---

## Summary

**Milestone 10 is 100% complete.** The user booking dashboard is live at `/dashboard` with full booking lifecycle visibility, cancel and convert-to-firm actions, and inline conflict alerts. The Resend transactional email layer is wired into all four booking lifecycle events (`created`, `approved`, `denied`, `cancelled`) with non-blocking, fault-tolerant delivery.

You are now ready to proceed with Milestone 11 development.

---

## Follow-up (provider & deliverability)

- **Transport:** Transactional mail uses Resend via [`../../../server/utils/email.js`](../../../server/utils/email.js). Environment variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, plus `FRONTEND_URL` for links in templates.
- **Testing sender:** With Resend’s `onboarding@resend.dev`, API calls may return **403** if the recipient is not the account email; production-style delivery requires a **verified domain** and a `from` address on that domain.
- **SendGrid:** Removed from runtime dependencies; project docs and rules now specify Resend.

---

## Verification (wrap-up)

Run from repo root with the API server on `http://localhost:4000`:

```bash
npm run test:milestone-10
```
