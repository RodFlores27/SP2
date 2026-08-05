---
description: Generate milestone completion report and verification test (Sync & Seal)
---

# Milestone Sync & Seal Template

Use this template to generate comprehensive milestone documentation after completing a development phase.

## Prompt Template

```
I've just completed Milestone {NUMBER} of my project. Please create the milestone documentation using the "Sync & Seal" process:

**Milestone Number:** {NUMBER}
**Milestone Name:** {SHORT_NAME} (e.g., "Auth Module", "CRUD Endpoints", "Booking System")
**Completion Date:** {DATE}

**What was completed:**
{LIST_OF_DELIVERABLES}
- Item 1
- Item 2
- Item 3

**Files created/modified:**
{LIST_OF_KEY_FILES}
- path/to/file1.js - Description
- path/to/file2.js - Description

**Test scenarios to verify:**
{LIST_OF_TEST_SCENARIOS}
- Scenario 1: Description
- Scenario 2: Description

**Next milestone preview:**
Milestone {NEXT_NUMBER} will focus on: {BRIEF_DESCRIPTION}

Please generate:
1. Verification test script: `milestone_tests/milestone-{NUMBER}-{kebab-case-name}.js`
2. Completion report: `milestone_reports/MILESTONE-{NUMBER}-COMPLETION-REPORT.md`
3. Update both README files in milestone_tests/ and milestone_reports/
4. Update PROJECT-ORGANIZATION.md if needed
5. Add test script to root package.json
6. **Update server/docs/swagger.json if API endpoints were added/modified**
```

## Example Usage

```
I've just completed Milestone 3 of my project. Please create the milestone documentation using the "Sync & Seal" process:

**Milestone Number:** 3
**Milestone Name:** Equipment & Room CRUD
**Completion Date:** April 1, 2026

**What was completed:**
- Equipment CRUD endpoints (GET, POST, PUT, DELETE)
- Room CRUD endpoints (GET, POST, PUT, DELETE)
- Cloudinary integration for image uploads
- Role-based access control (staff/admin for CUD, all users for R)

**Files created/modified:**
- server/controllers/equipment.controller.js - Equipment CRUD operations
- server/controllers/room.controller.js - Room CRUD operations
- server/routes/equipment.routes.js - Equipment API routes
- server/routes/room.routes.js - Room API routes
- server/utils/cloudinary.js - Image upload utility

**Test scenarios to verify:**
- GET /api/equipment - List all equipment (any authenticated user)
- POST /api/equipment - Create equipment with image (staff/admin only)
- PUT /api/equipment/:id - Update equipment (staff/admin only)
- DELETE /api/equipment/:id - Delete equipment (staff/admin only)
- Same scenarios for rooms
- Cloudinary image upload and URL generation

**Next milestone preview:**
Milestone 4 will focus on: React Router setup, Axios instance, JWT interceptor, Tailwind + shadcn init, Auth pages (Login, Register), React Hook Form validation
```

## What Gets Generated

### 1. Verification Test Script
**Location:** `milestone_tests/milestone-{n}-{name}.js`

**Should include:**
- Automated tests for all major features
- API endpoint testing with different user roles
- Success and failure scenarios
- Clear ✅/❌ output indicators
- Test summary at the end

### 2. Completion Report
**Location:** `milestone_reports/MILESTONE-{N}-COMPLETION-REPORT.md`

**Should include:**
- Header with milestone number, date, status
- Requirements checklist with ✅ indicators
- Implementation summary with file references
- Feature descriptions
- Verification test results
- Code quality assessment
- Security considerations (if applicable)
- Readiness checklist for next milestone
- Next steps preview
- Final summary

### 3. Updated Documentation
- `milestone_tests/README.md` - Add new test entry
- `milestone_reports/README.md` - Add new report entry
- `../PROJECT-ORGANIZATION.md` - Update if structure changed
- Root `package.json` - Add test script
- `server/docs/swagger.json` - Update API documentation if endpoints were added/modified

## Quick Reference

### File Naming Conventions
- **Tests:** `milestone-{number}-{kebab-case-description}.js`
- **Reports:** `MILESTONE-{NUMBER}-COMPLETION-REPORT.md`

### Test Script Structure
```javascript
const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

async function testMilestone{N}() {
  console.log('=== MILESTONE {N} VERIFICATION TEST ===\n');
  
  // IMPORTANT: Always check server health first
  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server and try again.');
    return;
  }
  
  // Test 1: Feature A
  console.log('\n--- Test 1: Feature A ---');
  // ... test code ...
  
  // Test 2: Feature B
  console.log('\n--- Test 2: Feature B ---');
  // ... test code ...
  
  // Final Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log('✅ All tests passed');
  console.log('\n=== TEST COMPLETE ===');
}

testMilestone{N}().catch(console.error);
```

### Report Structure Template
```markdown
# Milestone {N} Completion Report
**Date:** {DATE}
**Project:** PTCF Room & Equipment Reservation System
**Status:** ✅ **COMPLETE - READY FOR MILESTONE {N+1}**

---

## Milestone {N} Requirements (From Project Plan)

### Required Deliverables
1. ✅ Deliverable 1
2. ✅ Deliverable 2

---

## Implementation Summary

### 1. Feature Name ✅
**Files Created:**
- `@path/to/file.js` - Description

**Features Implemented:**
- Feature detail 1
- Feature detail 2

---

## Verification Tests ✅
**Test Script:** `@path/to/test.js`

### Test Results (All Passed)
- ✅ Test scenario 1
- ✅ Test scenario 2

---

## Code Quality Assessment

### Strengths
- Quality point 1
- Quality point 2

---

## Milestone {N+1} Readiness Checklist
- ✅ Checklist item 1
- ✅ Checklist item 2

---

## Next Steps (Milestone {N+1})
Brief description of next milestone

---

## Summary
**Milestone {N} is 100% complete.** Summary statement.

You are now ready to proceed with Milestone {N+1} development.
```

## Tips for Effective Documentation

1. **Be Specific:** Include actual file paths, function names, and code references
2. **Show Results:** Include test output, screenshots, or examples
3. **Document Decisions:** Explain why certain approaches were chosen
4. **Security Notes:** Always mention security considerations
5. **Next Steps:** Provide clear guidance for the next milestone
6. **Test Data:** Document any test users, sample data, or credentials used
7. **API Documentation:** Always update swagger.json when adding/modifying API endpoints to keep interactive docs current

## Post-Generation Checklist

After generating milestone documentation:
- [ ] Run the verification test to ensure it passes
- [ ] Review the completion report for accuracy
- [ ] Update root package.json with new test script
- [ ] **Update swagger.json if API endpoints were added/modified**
- [ ] Verify API docs at http://localhost:4000/api-docs (if backend changes)
- [ ] Commit changes with descriptive message
- [ ] Tag the commit with milestone number (optional)

## Git Commit Message Template

```
feat(milestone-{n}): complete {milestone-name}

- Add Milestone {N} completion report and verification test
- Document {key-feature-1}, {key-feature-2}, {key-feature-3}
- Update project documentation and test scripts

All {N} milestones now documented and verified.
```
