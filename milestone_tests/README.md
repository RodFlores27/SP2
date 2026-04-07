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

## Notes

- Tests use axios for HTTP requests
- All tests should be self-contained and not modify production data
- Tests should provide clear success/failure output with ✅/❌ indicators
- **API Documentation:** When milestones add/modify API endpoints, `server/docs/swagger.json` must be updated to keep the interactive API docs at `/api-docs` current
- **Frontend Tests:** UI/UX tests require manual verification in the browser. Automated E2E tests can be added in future milestones.
