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

## Running Tests

Tests are standalone Node.js scripts that can be run directly:

```bash
node milestone_tests/milestone-{number}-{description}.js
```

**Prerequisites:**
- Server must be running on `http://localhost:4000`
- Database must be seeded with test data
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

## Notes

- Tests use axios for HTTP requests
- All tests should be self-contained and not modify production data
- Tests should provide clear success/failure output with ✅/❌ indicators
