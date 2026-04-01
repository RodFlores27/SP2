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

## Notes

- Tests use axios for HTTP requests
- All tests should be self-contained and not modify production data
- Tests should provide clear success/failure output with ✅/❌ indicators
- **API Documentation:** When milestones add/modify API endpoints, `server/docs/swagger.json` must be updated to keep the interactive API docs at `/api-docs` current
