# Milestone Tests

This directory contains verification test scripts for each development milestone.

## Naming Convention

Test files should follow this format:
```
milestone-{number}-{description}.js
```

**Examples:**
- `milestone-2-auth-verification.js` - Auth module verification tests
- `milestone-3-crud-endpoints.js` - Equipment/Room CRUD endpoint tests
- `milestone-4-booking-workflow.js` - Booking system workflow tests

## Test Utilities

The `utils/` directory contains reusable helper functions for milestone tests:

**`utils/test-helpers.js`**
- `checkServerHealth(baseUrl)` - Verifies the server is running and healthy before executing tests
  - Returns `{ success: true, message }` if server is accessible
  - Returns `{ success: false, error }` if server is down
  - Automatically logs status with ✅/❌ indicators

**Usage in test scripts:**
```javascript
const { checkServerHealth } = require('./utils/test-helpers');

async function testMilestone() {
  // Check server health first
  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('❌ Cannot proceed: Server is not running');
    return;
  }

  // Continue with tests...
}
```

## Running Tests

Tests are standalone Node.js scripts that can be run directly:

```bash
node milestone_tests/milestone-{number}-{description}.js
```

**Prerequisites:**
- Server must be running on `http://localhost:4000`
- Database must be seeded with test data (for Milestone 2+)
- Required npm packages must be installed

## Current Tests

### Milestone 1: Setup Verification
**File:** `milestone-1-setup-verification.js`
**Tests:**
- Server health check and accessibility
- Project structure (client/server directories)
- Database migrations (Users, Equipment, Rooms)
- Sequelize models existence
- Client setup (React + Vite files)
- Server configuration files
- Git repository initialization

### Milestone 2: Auth Verification
**File:** `milestone-2-auth-verification.js`
**Tests:**
- User login with all role types (regular_user, ptcf_staff, system_admin)
- JWT token generation and validation
- Role-based access control (staff-only and admin-only endpoints)
- `/me` endpoint authentication

**Test Users:**
- `student@uplb.edu.ph` / `password123` (regular_user)
- `staff@uplb.edu.ph` / `staff123` (ptcf_staff)
- `admin@uplb.edu.ph` / `admin123` (system_admin)

### Milestone 3: Equipment & Room CRUD Endpoints
**File:** `milestone-3-crud-endpoints.js`
**Tests:**
- Equipment CRUD operations (GET all, GET by ID, POST, PUT, DELETE)
- Room CRUD operations (GET all, GET by ID, POST, PUT, DELETE)
- Role-based authorization (staff/admin for CUD, all users for R)
- Regular user access restrictions (403 Forbidden for CUD operations)
- Resource deletion verification (404 for deleted items)
- Cloudinary integration (optional image uploads)

**Test Coverage:**
- 12 automated test scenarios
- All HTTP methods (GET, POST, PUT, DELETE)
- All user roles (student, staff, admin)
- Success and failure cases
- 404 verification for deleted resources

**Note:** Image upload tests with actual files require manual testing using Postman or similar tools with multipart/form-data support.

### Milestone 4: Frontend Setup
**File:** `milestone-4-frontend-setup.js`
**Tests:**
- Backend server health check
- Frontend dev server availability check
- Manual UI testing checklist (10 scenarios)

**Manual Test Coverage:**
1. Navigate to app and verify redirect to login
2. Test registration flow with form validation
3. Test login flow with existing credentials
4. Test protected route access (dashboard)
5. Test token persistence across page refresh
6. Test logout functionality
7. Test form validation errors
8. Test error handling for invalid credentials
9. Test UI/UX with Tailwind + shadcn/ui styling
10. Test route guards (redirect logic)

**Technologies Verified:**
- React Router (client-side routing)
- Axios with JWT interceptor (API communication)
- Tailwind CSS + shadcn/ui (styling and components)
- React Hook Form + Zod (form validation)
- AuthContext (authentication state management)
- Protected routes (route guarding)

**Note:** Frontend tests are primarily manual/visual due to the nature of UI testing. The test script provides automated server checks and a comprehensive manual testing checklist.

### Milestone 5: Equipment & Room Listing Pages
**File:** `milestone-5-listing-pages.js`
**Tests:**
- User authentication (staff and regular user)
- Public access to equipment listing (no auth required)
- Public access to room listing (no auth required)
- Protected access to detail pages (auth required)
- Staff CRUD operations (create, update, delete)
- Role-based access control (403 for unauthorized actions)
- Equipment and room data persistence
- 404 verification for deleted resources

**Test Coverage:**
- 20+ automated test scenarios
- Public vs protected endpoint access
- Staff vs regular user authorization
- All HTTP methods (GET, POST, PUT, DELETE)
- Success and failure cases
- Hybrid access model verification

**Technologies Verified:**
- Public listing endpoints (no authentication)
- Protected detail endpoints (JWT required)
- Role-based UI rendering (staff management controls)
- Multipart/form-data image uploads
- React Router navigation
- Integrated staff management UI

### Milestone 6: Booking System Backend
**File:** `milestone-6-booking-backend.js`
**Tests:**
- User authentication (student, staff, admin)
- Create pencil booking for equipment (with auto-expiry)
- Create firm booking for room (without expiry)
- Conflict detection for overlapping pencil bookings (contested status)
- Conflict detection for overlapping firm bookings (409 rejection)
- Validation: missing required fields (400 error)
- Validation: invalid date range (endTime before startTime)
- Validation: booking in the past (400 error)
- Validation: non-existent resource (404 error)
- Get all bookings (student sees own, staff sees all)
- Get booking by ID (owner access)
- Get booking by ID (unauthorized access blocked with 403)
- Get booking by ID (staff can view any booking)
- Filter bookings by status query parameter
- Filter bookings by resourceType query parameter

**Test Coverage:**
- 16 automated test scenarios
- All CRUD operations for bookings
- Conflict detection algorithm verification
- Pencil vs Firm booking logic
- Role-based access control (users vs staff)
- Query parameter filtering
- Association loading (user details)
- Validation rules enforcement

**Technologies Verified:**
- Sequelize model with associations
- Polymorphic relationships (resourceType + resourceId)
- Conflict detection with time range queries
- Database indexes for performance
- Role-based query filtering
- Auto-expiry logic for pencil bookings
- JWT authentication and authorization

**Note:** Server must be running on `http://localhost:4000` before executing tests.

### Milestone 7: Booking Lifecycle & Staff Approval Endpoints
**File:** `milestone-7-booking-lifecycle.js`
**Tests:**
- User booking cancellation (own bookings, staff can cancel any)
- Cancel restrictions (cannot cancel approved, within 24 hours)
- Convert pencil to firm with authorization document upload
- Document upload requirement validation
- Conflict re-checking during conversion (409 if overlaps exist)
- Authorization checks (can only convert own bookings)
- Staff approve booking with optional staffRemark
- Staff deny booking with optional staffRemark
- Role-based access control (403 for regular users on approve/deny)
- Status validation (cannot approve already approved, etc.)
- staffRemark persistence in database

**Test Coverage:**
- 20 automated test scenarios
- All 4 new PATCH endpoints
- Cloudinary document upload integration
- Conflict detection algorithm verification
- Business rule enforcement (24-hour rule, approved booking protection)
- Role-based authorization (user vs staff)
- Database field updates (staffRemark, status, bookingType, authorizationDocUrl, expiryAt)

**Technologies Verified:**
- Multer multipart/form-data file upload
- Cloudinary secure document storage
- JWT authentication and role-based authorization
- Sequelize model updates and associations
- Conflict detection with time range queries
- Business logic enforcement

**Note:** Test creates temporary files for document upload testing. Files are automatically cleaned up after tests complete.

### Milestone 8: Calendar View & Availability API
**File:** `milestone-8-calendar-view.js`
**Tests:**
- Availability API endpoint (public, no authentication required)
- Filter by resourceType (equipment/room)
- Filter by specific resourceId
- Filter by date range (startDate/endDate)
- Verify response excludes sensitive data (userId, purpose, authorizationDocUrl)
- Verify excluded statuses (cancelled, denied, expired)
- Firm bookings get pending_approval status (not confirmed)
- Invalid parameters return 400 error

**Test Coverage:**
- 11 automated test scenarios
- Public availability endpoint verification
- Query parameter filtering
- Data privacy verification
- Status model validation (confirmed status removed)

**Technologies Verified:**
- React Big Calendar integration
- Public API endpoint (no JWT required)
- Date range filtering with Sequelize Op
- Calendar event styling by booking status

**Note:** UI tests require manual verification in browser. The test script provides a checklist for visual testing.

### Milestone 9: Booking Creation Form
**File:** `milestone-9-booking-form.js`
**Tests:**
- User authentication (student and staff login)
- Get available equipment and rooms (for resource IDs)
- Create pencil booking via JSON
- Create firm booking via JSON (pending_approval status)
- Create booking via multipart/form-data (no file)
- Create booking with authorization document upload (Cloudinary)
- Validation: missing required fields (400 error)
- Validation: booking in the past (400 error)
- Validation: non-existent resource (404 error)
- Unauthenticated booking attempt (401 error)
- Public equipment endpoint accessible (for form dropdown)
- Public rooms endpoint accessible (for form dropdown)

**Test Coverage:**
- 14 automated test scenarios
- JSON and multipart/form-data submission paths
- File upload with Cloudinary integration
- Client validation mirroring (type, size)
- All HTTP status codes (201, 400, 401, 404)
- 27-point manual UI testing checklist

**Technologies Verified:**
- React Hook Form + Zod validation
- shadcn/ui form components (Select, Input, Button, Card)
- URL search param prefilling (from calendar and detail pages)
- Multer middleware on POST /bookings
- Cloudinary document upload
- React Router navigation (useNavigate, useSearchParams)
- Protected routes (ProtectedRoute component)

**Note:** UI tests require manual verification in browser. The test script provides a comprehensive 27-point checklist covering navigation, form fields, calendar integration, detail page buttons, and submission feedback.

**Milestone 9 wrap-up (manual):** Verify on `/calendar` that dense days show “+N more,” popup themed correctly, outside click / second click on same “+N more” behave as expected, and slot booking does not fire on the dismiss gesture. On `/bookings/new`, trigger a firm vs firm409 and confirm conflict lines show resource name and labels like `Firm (Pending Approval)`.


### Milestone 10: User Booking Dashboard + Resend Emails
**File:** \milestone-10-booking-dashboard-and-emails.js**Tests:**
- Student login and list own bookings (scoped to user)
- Staff login and list all bookings
- Create pencil booking (triggers \ooking.created\ email hook)
- Cancel booking success (>24h ahead, triggers \ooking.cancelled\ email hook)
- Cancel booking within 24h rejected with 400
- Convert pencil to firm with authorization doc upload
- Convert to firm without file rejected with 400
- Staff approve firm booking (triggers \ooking.approved\ email hook)
- Staff deny pending booking (triggers \ooking.denied\ email hook)
- Email notification module smoke test (all 4 functions exported)
- 18-point manual UI checklist for dashboard page

**Technologies Verified:**
- \GET /bookings\ role-scoped list (student vs staff)
- \PATCH /bookings/:id/cancel\ with 24h rule enforcement
- \PATCH /bookings/:id/convert-to-firm\ multipart upload
- \PATCH /bookings/:id/approve\ and \/deny\ staff endpoints
- Resend email transport (\server/utils/email.js\)
- Booking notifications helper (\server/utils/booking-notifications.js\)
- \BookingStatusBadge\ component (booking lifecycle statuses)
- Dashboard page with active/past sections, inline convert panel, conflict alerts

### Milestone 11: Staff Dashboard
**File:** `milestone-11-staff-dashboard.js`
**Tests:**
- Staff and student login
- Staff fetches pending_approval bookings (array response)
- Staff fetches contested bookings (array response)
- `GET /bookings/:id/conflicts` returns array for staff
- Regular user blocked from conflicts endpoint (403)
- Unauthenticated request blocked from conflicts endpoint (401)
- Non-existent booking returns 404 from conflicts endpoint
- Regular user blocked from approve endpoint (403)
- Regular user blocked from deny endpoint (403)
- Staff approves a pending_approval booking with staffRemark
- Staff denies a contested booking with staffRemark
- 18-point manual UI checklist (nav visibility, route guard, tabs, cards, approve/deny flow, conflict grouping, side-by-side layout, empty states)

**Technologies Verified:**
- `GET /bookings?status=pending_approval` and `?status=contested` (staff-scoped)
- `GET /bookings/:id/conflicts` new endpoint
- `PATCH /bookings/:id/approve` and `/deny` with staffRemark
- `StaffProtectedRoute` (role-based redirect)
- `StaffDashboard.jsx` two-tab page with `ApprovalCard` and `ConflictGroup` components
- Client-side conflict grouping algorithm

### Milestone 12: Scheduled Jobs + Admin Panel
**File:** `milestone-12-cron-and-admin.js`
**Tests:**
- Admin, staff, and student login
- Admin lists all users (array + field validation)
- Staff blocked from /admin/users (403)
- Student blocked from /admin/users (403)
- Unauthenticated request blocked (401)
- Admin promotes regular_user to ptcf_staff and restores
- Admin blocked from changing own role (400)
- Invalid accountType rejected (400)
- Non-existent user returns 404 on role update
- Admin blocked from deleting own account (400)
- Non-existent user returns 404 on delete
- Staff blocked from DELETE /admin/users/:id (403)
- Booking notifications module exports all 6 functions
- Cron job file exists with node-cron and expiry logic
- 17-point manual UI checklist (nav visibility, route guard, stats, search, role dropdown, self-protection, delete flow, cron log)

**Technologies Verified:**
- `node-cron` scheduled tasks (expire + warning jobs)
- `notifyBookingExpired` and `notifyBookingExpiringSoon` email helpers
- `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `DELETE /api/admin/users/:id`
- `AdminProtectedRoute` (system_admin only redirect)
- `AdminPanel.jsx` with stats, search, role select, delete

### Milestone 13: Booking contention rules + displacement
**File:** `milestone-13-booking-contention-rules.js`
**Run:** `npm run test:milestone-13` (from project root; server on `http://localhost:4000`)

**Tests (representative):**
- Pencil overlap with contention confirmation → `contested` / `queued` paths
- Third (and further) overlapping pencils enqueue correctly
- **Defender cancel** mid-episode: reopen pairing per **P-19** (`createdAt` ordering; waitlist only if overlaps new defender)
- Firm **approval**: overlapping pencils → **`displaced`** with `displacedByBookingId` (convert-to-firm releases challenger/queue to **`penciled`** until approve)
- 24h lock window and related guards

**Manual UI (same milestone):** My Bookings — `queued` / `displaced` badges, filters, and displaced rebook messaging; calendar — `#id` titles and **contesting** (challenger) styling from availability `contentionChallenger`.

**Related design doc:** `docs/booking-transition-catalog-seed.md` (transition IDs **P-05b**, **P-19**–**P-21**, **P-07** challenger-expiry row, Section 13 changelog).

### Milestone 14: Kafka Foundation
**File:** `milestone-14-kafka-foundation.js`
**Run:** `npm run test:milestone-14` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Kafka config safe defaults (`KAFKA_ENABLED=false`, `localhost:9092`, `booking-events`)
- Booking event envelope builder (`eventId`, `eventType`, `occurredAt`, actor/resource/status fields, payload)
- Producer helper safe-skip behavior when Kafka is disabled
- Optional live Kafka topic/publish check when `KAFKA_ENABLED=true`

**Technologies Verified:**
- KafkaJS dependency and producer helper
- Local Docker Compose Kafka broker config
- `server/scripts/check-kafka.js`
- Opt-in Kafka startup path in `server/index.js`
- Local setup guide in `docs/kafka-local-dev.md`

### Milestone 15: Booking Event Publishing
**File:** `milestone-15-booking-event-publishing.js`
**Run:** `npm run test:milestone-15` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Booking event type contract includes lifecycle events
- Booking event data builder preserves booking metadata and payload
- Booking controller publishes lifecycle events after successful DB actions
- Cron expiry job publishes expiry and warning events
- Publisher returns a controlled result whether Kafka is disabled or enabled
- Optional live Kafka publish check when `KAFKA_ENABLED=true`

**Technologies Verified:**
- `server/utils/kafka/booking-events.js`
- Booking event publishing from `server/controllers/booking.controller.js`
- Expiry/warning event publishing from `server/jobs/booking-expiry.js`
- Kafka topic `booking-events`
- Event names: `booking.created`, `booking.approved`, `booking.denied`, `booking.cancelled`, `booking.expired`, `booking.expiring_soon`, `booking.contention_started`, `booking.converted_to_firm`, `booking.displaced_slot_reopened`

### Milestone 16: Notification Consumer
**File:** `milestone-16-notification-consumer.js`
**Run:** `npm run test:milestone-16` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Kafka notification consumer module export checks
- Booking event contract checks for notification lifecycle events
- Controller and expiry-job fallback guards for direct notification calls
- Notification processor safety checks for invalid and unsupported events
- Consumer startup behavior checks for Kafka-disabled and Kafka-enabled modes

**Technologies Verified:**
- `server/utils/kafka/notification-consumer.js`
- `server/index.js` Kafka notification-consumer startup wiring
- `server/controllers/booking.controller.js` fallback guards for notification calls
- `server/jobs/booking-expiry.js` fallback guards for notification calls
- Consumer group `notification-consumer`

### Milestone 17: Audit Log Consumer
**File:** `milestone-17-audit-log-consumer.js`
**Run:** `npm run test:milestone-17` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Admin login and admin audit endpoint response shape check
- Booking event constants availability check
- Audit consumer startup behavior checks for Kafka-disabled and Kafka-enabled modes
- Kafka publish-to-audit persistence verification (`booking.audit_test` event)

**Technologies Verified:**
- `server/utils/kafka/audit-consumer.js`
- `server/models/auditlog.js` and `AuditLogs` migration
- `GET /api/admin/audit-logs` admin endpoint
- Consumer group `audit-log-consumer`

### Milestone 18: Analytics Consumer + Admin View
**File:** `milestone-18-analytics-consumer.js`
**Run:** `npm run test:milestone-18` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Admin login and admin analytics endpoint response shape check
- Booking event constants availability check
- Direct analytics persistence and duplicate `eventId` deduplication
- Analytics consumer startup behavior checks for Kafka-disabled and Kafka-enabled modes
- Kafka publish-to-analytics persistence verification (`booking.analytics_test` event)

**Technologies Verified:**
- `server/utils/kafka/analytics-consumer.js`
- `server/models/bookinganalyticsevent.js` and `BookingAnalyticsEvents` migration
- `GET /api/admin/analytics` admin endpoint
- `client/src/pages/AdminPanel.jsx` analytics cards and recent event summaries
- Consumer group `analytics-consumer`

### Milestone 19: End-to-End Kafka Verification + Documentation
**File:** `milestone-19-end-to-end-kafka.js`
**Run:** `npm run test:milestone-19` (from project root; server on `http://localhost:4000`)

**Tests:**
- Server health check
- Safe Kafka-disabled guidance path
- Admin and student login
- Unique notification, audit, and analytics test consumer groups
- Real `POST /api/bookings` pencil booking action
- `booking.created` observed in `AuditLogs`
- `booking.created` observed in `BookingAnalyticsEvents`
- Notification consumer email side effect captured without sending real Resend email
- Admin audit and analytics endpoints expose resulting side effects

**Technologies Verified:**
- Kafka topic `booking-events`
- Producer path from booking API action
- Consumer groups `notification-consumer`, `audit-log-consumer`, and `analytics-consumer`
- `AuditLogs` and `BookingAnalyticsEvents` persistence
- `GET /api/admin/audit-logs` and `GET /api/admin/analytics`
- Week 3 Kafka documentation and completion report

## Notes

- Tests use axios for HTTP requests
- All tests should be self-contained and not modify production data
- Tests should provide clear success/failure output with ✅/❌ indicators
- **API Documentation:** When milestones add/modify API endpoints, `server/docs/swagger.json` must be updated to keep the interactive API docs at `/api-docs` current
- **Frontend Tests:** UI/UX tests require manual verification in the browser. Automated E2E tests can be added in future milestones.
