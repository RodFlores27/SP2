# Project Organization

## Directory Structure

```
PTCF Project/
├── client/                      # Frontend (React + Vite)
├── server/                      # Backend (Express + Sequelize)
│   ├── config/                  # Database configuration
│   ├── controllers/             # Route controllers
│   ├── middleware/              # Auth & other middleware
│   ├── migrations/              # Database migrations
│   ├── models/                  # Sequelize models
│   ├── routes/                  # API routes
│   └── seeders/                 # Database seed data
├── milestone_tests/             # Verification test scripts
│   ├── README.md
│   └── milestone-{n}-{desc}.js
├── milestone_reports/           # Completion reports
│   ├── README.md
│   └── MILESTONE-{n}-COMPLETION-REPORT.md
├── package.json                 # Root package for test scripts
├── .gitignore                   # Git ignore rules
└── PROJECT-ORGANIZATION.md      # This file
```

## Naming Conventions

### Milestone Tests
**Location:** `milestone_tests/`  
**Format:** `milestone-{number}-{description}.js`  
**Examples:**
- `milestone-2-auth-verification.js`
- `milestone-3-crud-endpoints.js`

### Milestone Reports
**Location:** `milestone_reports/`  
**Format:** `MILESTONE-{number}-COMPLETION-REPORT.md`  
**Examples:**
- `MILESTONE-2-COMPLETION-REPORT.md`
- `MILESTONE-3-COMPLETION-REPORT.md`

### Database Files
**Migrations:** `YYYYMMDDHHMMSS-{description}.js`  
**Seeders:** `YYYYMMDDHHMMSS-{description}.js`  
**Models:** `{modelname}.js` (lowercase)

### Backend Files
**Controllers:** `{module}.controller.js`  
**Routes:** `{module}.routes.js`  
**Middleware:** `{purpose}.middleware.js`

## Running Tests

The root `package.json` includes scripts to run milestone verification tests:

```bash
# Run individual milestone tests
npm run test:milestone-1    # Foundation & infrastructure
npm run test:milestone-2    # Auth module verification

# Run all milestone tests
npm run test:all
```

**Prerequisites:**
- Server must be running on `http://localhost:4000`
- Database must be seeded with test data (for Milestone 2+)
- All dependencies installed in client, server, and root

## Development Workflow

### 1. Start New Milestone
- Review previous milestone completion report
- Create implementation plan
- Set up any new dependencies

### 2. During Development
- Follow existing code patterns
- Keep files organized in proper directories
- Write clear, documented code

### 3. Complete Milestone
- Create verification test script in `milestone_tests/`
- Run all tests and verify functionality
- Create completion report in `milestone_reports/`
- Update this organization document if structure changes

## Test Data

### Seeded Users
- `student@uplb.edu.ph` / `password123` (regular_user)
- `staff@uplb.edu.ph` / `staff123` (ptcf_staff)
- `admin@uplb.edu.ph` / `admin123` (system_admin)

### Seeded Equipment
- Laminar Flow Hood
- Autoclave
- Growth Chamber

### Seeded Rooms
- Culture Room A (capacity: 8)
- Preparation Room (capacity: 4)

## Notes

- All milestone-related files use "milestone" terminology, not "day"
- Test scripts should be self-contained and runnable independently
- Completion reports serve as documentation and handoff materials
- Keep this file updated as project structure evolves
