# Project Organization

## Directory Structure

```
PTCF Project/
├── docker-compose.kafka.yml     # Local Kafka broker for development
├── client/                      # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   │   ├── alert-dialog.jsx
│   │   │   │   ├── button-variants.js # Shared button variants for non-component imports
│   │   │   │   ├── button.jsx
│   │   │   │   ├── card.jsx
│   │   │   │   ├── dialog.jsx
│   │   │   │   ├── form.jsx
│   │   │   │   ├── input.jsx
│   │   │   │   ├── label.jsx
│   │   │   │   └── select.jsx
│   │   │   ├── BookingCalendar.jsx    # React Big Calendar integration
│   │   │   ├── BookingStatusBadge.jsx # Booking lifecycle status badge
│   │   │   ├── ConfirmDialog.jsx      # Delete confirmation dialog
│   │   │   ├── EquipmentFormModal.jsx # Equipment create/edit form
│   │   │   ├── ImageUpload.jsx        # Image upload with preview
│   │   │   ├── LoadingSpinner.jsx     # Loading state component
│   │   │   ├── Navigation.jsx         # Site navigation header
│   │   │   ├── ProtectedRoute.jsx     # Route guard component
│   │   │   ├── RoomFormModal.jsx      # Room create/edit form
│   │   │   └── StatusBadge.jsx        # Resource availability status badge
│   │   ├── contexts/            # React contexts
│   │   │   └── AuthContext.jsx  # Authentication state management
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── axios.js         # Axios instance + JWT interceptor
│   │   │   ├── convertFirmSuccessSession.js # Convert-to-firm success redirect/session helper
│   │   │   ├── formatBookingDateRange.js # Cross-day booking date-range formatting
│   │   │   ├── imageUpload.js   # Multipart/form-data upload helper
│   │   │   └── utils.js         # cn() helper for class merging
│   │   ├── messages/            # User-facing copy catalogs
│   │   │   ├── bookingMessages.jsx # Booking UI messages and JSX fragments
│   │   │   └── bookingMessages.js  # Compatibility re-export for JS importers
│   │   ├── pages/               # Page components
│   │   │   ├── BookingForm.jsx  # Booking creation form (protected)
│   │   │   ├── Calendar.jsx     # Calendar view with availability
│   │   │   ├── Dashboard.jsx    # User booking dashboard (protected)
│   │   │   ├── StaffDashboard.jsx  # Staff approvals + conflict resolution (staff/admin only)
│   │   │   ├── AdminPanel.jsx      # User management + booking event analytics (system_admin only)
│   │   │   ├── EquipmentDetail.jsx  # Equipment detail (protected)
│   │   │   ├── EquipmentList.jsx    # Equipment listing (public)
│   │   │   ├── Login.jsx        # Login page
│   │   │   ├── Register.jsx     # Registration page
│   │   │   ├── RoomDetail.jsx   # Room detail (protected)
│   │   │   └── RoomList.jsx     # Room listing (public)
│   │   ├── App.jsx              # Main app with router
│   │   ├── main.jsx             # App entry point
│   │   └── index.css            # Global Tailwind v4 styles and @theme design tokens
│   ├── components.json          # shadcn/ui configuration
│   ├── vite.config.js           # Vite configuration (with Tailwind v4 plugin)
│   └── package.json             # Frontend dependencies
├── server/                      # Backend (Express + Sequelize)
│   ├── config/                  # Database and Kafka configuration
│   │   └── kafka.js             # KafkaJS env config and topic names
│   ├── controllers/             # Route controllers
│   │   ├── auth.controller.js   # Auth endpoints (register, login)
│   │   ├── admin.controller.js  # Admin user management, audit logs, and analytics
│   │   ├── booking.controller.js    # Booking CRUD + conflict detection
│   │   ├── equipment.controller.js  # Equipment CRUD operations
│   │   └── room.controller.js   # Room CRUD operations
│   ├── docs/                    # Documentation & dev utilities
│   │   ├── swagger.json         # OpenAPI documentation
│   │   └── test-token.js        # JWT token debugger
│   ├── middleware/              # Auth & other middleware
│   │   └── auth.middleware.js   # JWT auth & role-based authorization
│   ├── migrations/              # Database migrations
│   ├── models/                  # Sequelize models (includes booking, audit logs, analytics events)
│   ├── jobs/                    # Scheduled background jobs
│   │   └── booking-expiry.js   # node-cron: booking expiry, warning, contention deadline, firm deadline, completion jobs
│   ├── messages/                # Backend API/domain/email message catalogs
│   │   └── bookingMessages.js   # Booking API messages, domain errors, and email copy
│   ├── routes/                  # API routes
│   │   ├── auth.routes.js       # Auth routes
│   │   ├── admin.routes.js      # Admin routes (system_admin only, users, audit logs, analytics)
│   │   ├── booking.routes.js    # Booking routes
│   │   ├── equipment.routes.js  # Equipment routes
│   │   └── room.routes.js       # Room routes
│   ├── seeders/                 # Database seed data
│   ├── scripts/                 # Local development and maintenance scripts
│   │   ├── check-kafka.js       # Kafka foundation connectivity check
│   │   ├── clear-bookings.js    # Booking cleanup for repeatable demos/tests
│   │   ├── reset-mvp-demo-data.js # MVP demo reset workflow
│   │   └── seed-foundation-only.js # Foundation-only seed workflow
│   ├── services/                # Domain services
│   │   └── contention.service.js # Strict 1v1 contention, displacement, and on_hold rebuild rules
│   └── utils/                   # Utility functions
│       ├── cloudinary.js        # Cloudinary image upload utility
│       ├── email.js             # Resend email transport wrapper
│       ├── kafka/               # KafkaJS producer + booking event helpers + notification/audit/analytics consumers
│       ├── booking-rules.js     # Booking lifecycle/status helper rules
│       ├── file-hash.js         # Authorization document hash helper
│       └── booking-notifications.js  # Transactional email templates (created/approved/denied/cancelled/expired/expiringSoon)
├── docs/                        # Project planning and workflow docs
│   ├── design/                  # Visual identity and design implementation briefs
│   │   └── up-visual-identity-reskin.md # UP-inspired PTCF reskin source-of-truth brief
│   ├── milestones/              # Weekly milestone plans and daily routine
│   │   ├── milestone-daily-routine.md
│   │   ├── week2-daily-brief.md
│   │   └── week3-daily-brief.md
│   ├── workflows/               # Milestone wrap-up workflow
│   │   └── milestone-sync-seal.md
│   ├── kafka-local-dev.md       # Local Kafka setup with Docker Compose
│   └── booking-*.md             # Booking SOP and transition notes
├── milestone_tests/             # Verification test scripts
│   ├── utils/                   # Reusable test utilities
│   │   └── test-helpers.js      # Common test helper functions
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
**Utilities:** `{purpose}.js` (in server/utils/)

### Frontend Files
**Pages:** `{PageName}.jsx` (PascalCase, in client/src/pages/)  
**Components:** `{ComponentName}.jsx` (PascalCase, in client/src/components/)  
**UI Components:** `{component}.jsx` (lowercase, in client/src/components/ui/)  
**Contexts:** `{ContextName}Context.jsx` (PascalCase, in client/src/contexts/)  
**Utilities:** `{purpose}.js` (lowercase, in client/src/lib/)

### Test Utilities
**Location:** `milestone_tests/utils/`  
**Purpose:** Shared helper functions for milestone tests  
**Files:**
- `test-helpers.js` - Common test utilities (server health check, etc.)

**Key Functions:**
- `checkServerHealth(baseUrl)` - Verifies server is running before tests execute

## Running Tests

The root `package.json` includes scripts to run milestone verification tests:

```bash
# Run individual milestone tests
npm run test:milestone-1    # Foundation & infrastructure
npm run test:milestone-2    # Auth module verification
npm run test:milestone-3    # Equipment & Room CRUD endpoints
npm run test:milestone-4    # Frontend setup (React Router, Axios, Tailwind, Auth pages)
npm run test:milestone-5    # Equipment & Room listing pages with staff management
npm run test:milestone-6    # Booking system backend (pencil/firm bookings, conflict detection)
npm run test:milestone-7    # Booking lifecycle & staff approval endpoints
npm run test:milestone-8    # Calendar view & availability API
npm run test:milestone-9    # Booking creation form
npm run test:milestone-10   # User booking dashboard + Resend transactional emails
npm run test:milestone-11   # Staff dashboard + conflict resolution
npm run test:milestone-12   # Scheduled jobs + admin panel
npm run test:milestone-13   # Booking contention rules + displacement/on_hold lifecycle
npm run test:milestone-14   # Kafka foundation
npm run test:milestone-15   # Booking event publishing
npm run test:milestone-16   # Kafka notification consumer
npm run test:milestone-17   # Kafka audit log consumer
npm run test:milestone-18   # Kafka analytics consumer + admin analytics endpoint
npm run test:milestone-19   # End-to-end Kafka verification + documentation
npm run test:milestone-20   # UP visual identity reskin + email branding

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
- `researcher1@uplb.edu.ph` / `password123` (regular_user)
- `researcher2@uplb.edu.ph` / `password123` (regular_user)

### Seeded Equipment
- Laminar Flow Hood
- Autoclave
- Growth Chamber

### Seeded Rooms
- Culture Room A (capacity: 8)
- Preparation Room (capacity: 4)

### Seeded Bookings
- Demo bookings with various scenarios:
  - Pencil booking for equipment (student)
  - Firm booking for room (staff/admin workflows)
  - Strict 1v1 contention scenarios (defender/challenger)
  - Firm booking **pending staff approval**
  - Pencil booking (researcher1, Growth Chamber)
  - Displaced/on-hold showcase rows in targeted seed workflows
  - Mix of users (student, staff, admin, researcher)
  - Mix of resources (equipment and rooms)
  - Future dates for all bookings

## Notes

- All milestone-related files use "milestone" terminology, not "day"
- Test scripts should be self-contained and runnable independently
- Completion reports serve as documentation and handoff materials
- Keep this file updated as project structure evolves
