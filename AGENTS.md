# AGENTS.md

This file is the single source of truth for AI agent behavior in the PTCF project.
It consolidates prior rules from `.cursor/rules`.

## 1) Start Here Before Substantive Work

Read these in order:

1. `C:\BSCS\SP\SP2\AI briefing document.txt` (focus on **TODAY'S GOAL**)
2. `AGENTS.md` (this file)
3. `PROJECT-ORGANIZATION.md`
4. `milestone_reports/README.md`
5. `docs/workflows/milestone-sync-seal.md`

For small follow-up tweaks after a milestone is already wrapped, avoid reloading historical milestone reports/tests unless needed for debugging.

## 2) Non-Negotiable Stack and Architecture Constraints

- Tailwind CSS v4 only:
  - Use `@import "tailwindcss";`
  - Use CSS-first customization with `@theme`
  - Prefer `@tailwindcss/vite` (Vite) or `@tailwindcss/postcss` (PostCSS)
  - Do not add v3 directives (`@tailwind base/components/utilities`) in v4 files
  - Do not add `tailwind.config.js` for theme overrides in this project
- React Router v7 patterns only (no v6-era `Switch`/`useHistory`)
- Sequelize ORM for DB access and migrations (avoid raw SQL unless truly necessary)
- React Hook Form + Zod for frontend forms
- Cloudinary for uploads via `server/utils/cloudinary.js` (no local disk storage)
- Resend for emails via `server/utils/email.js` (not nodemailer/mailgun/sendgrid)

## 3) Core Path and Runtime Map

- Backend entry: `server/index.js` (port `4000`)
- Frontend entry: `client/src/main.jsx` (port `5173`)
- API prefix: `/api/`
- Auth middleware: `server/middleware/auth.middleware.js`
- Swagger source: `server/docs/swagger.json`
- Swagger URL: `http://localhost:4000/api-docs`

## 4) Booking Domain Truths

Valid booking statuses:

- `penciled`
- `on_hold`
- `contested`
- `pending_approval`
- `approved`
- `denied`
- `cancelled`
- `expired`
- `displaced`
- `completed`

There is no `confirmed` status.

`contested` is legacy/backward-compatible terminology. Current runtime contention is strict 1v1 and should use `contentionRole` (`defender` / `challenger`) plus `challengingBookingId` as the source of truth. `on_hold` means a pencil is temporarily blocked by an overlapping firm blocker and may be rebuilt when that blocker is denied/cancelled.

## 5) Booking User-Facing Copy Rules

For booking-related user-visible text (UI labels, validation, toasts, dialogs, booking API messages users read, domain errors, booking emails):

- Do not leave long inline literals in components/controllers.
- Centralize copy here:
  - Client: `client/src/messages/bookingMessages.jsx`
  - Server: `server/messages/bookingMessages.js`
- `bookingMessages.js` in client is re-export compatibility only for `.js` importers.
- Use descriptive keys and parameterized helper functions for dynamic text.
- Avoid `dangerouslySetInnerHTML`; prefer JSX fragments (or plain strings where attributes require strings).

### My Bookings active warning/notice pattern

When implementing warning/alert/notice cards in `ActiveBookingCard`:

1. Place notices inside the booking info column, not floating top blocks.
2. Show a short summary first.
3. Use a `View details` / `Hide details` toggle for deeper explanation.
4. Keep copy centralized under `myBookings.activeCard.alerts.*`.
5. Keep icon/color/role semantics consistent.
6. No long hardcoded inline literals.

### Scope limits

- Non-booking features should use their own messages module(s).
- Developer-only strings (logs/internal assertions/comments) do not need cataloging.
- Swagger descriptions stay in `server/docs/swagger.json` unless that same sentence is directly shown in UI.

## 6) Tailwind v4 Guidance

When editing frontend styles/components:

- Assume v4 conventions unless repo state clearly indicates otherwise.
- Use v4-native features (container queries, modern gradients, modern variants/data variants) before fallback patterns.
- Do not add `content` scanning config by default in v4; rely on automatic detection.
- Use `@source` in CSS only when classes are in paths excluded by default heuristics.
- Preserve behavior during migration-like edits; avoid broad rewrites when intent is unclear.

## 7) Database Reseed/Reset Commands (Local Dev)

When suggesting DB reseed/reset/booking cleanup, use `npm run` scripts from:

`C:\BSCS\SP\SP2\PTCF Project\server`

Preferred scripts:

- `npm run seed:foundation:local` (users/equipment/rooms, no bookings)
- `npm run seed:showcase:local` (showcase day bookings; foundation required first)
- `npm run seed:calendar:demo:local` (clear bookings + showcase seeding)
- `npm run clear:bookings` (delete all bookings rows only)
- `npm run seed:all:local` (full seeders run)
- `npm run reset:mvp-demo` (project-specific reset script; also clears Supabase Auth users when `AUTH_PROVIDER=supabase`)
- `npm run sync:supabase-auth` (recreate/link demo Supabase Auth users after reseeding)
- `npm run clear:supabase-auth` (delete Supabase Auth users only)

Do not invent ad-hoc Sequelize/Node reseed commands when a package script exists.

## 8) Milestone Numbering and Wrap-up Protocol

Milestones:

- One milestone equals one day of work.
- Number milestones sequentially across weeks.
- Refer to milestones by number, not just date/day.
- Check completion state in `milestone_reports/README.md`.

### Sync & Seal (required when milestone implementation is done)

Produce all required artifacts:

1. Verification test script:
   - `milestone_tests/milestone-{N}-{kebab-case-name}.js`
   - Must import and run `checkServerHealth` first
   - Must include success and failure scenarios
   - Use `✅` / `❌` indicators and final summary block
2. Completion report:
   - `milestone_reports/MILESTONE-{N}-COMPLETION-REPORT.md`
   - Include requirements checklist, implementation summary, verification results, quality/security notes, readiness, next steps
3. Update `milestone_tests/README.md`
4. Update `milestone_reports/README.md`
5. Update `PROJECT-ORGANIZATION.md` if structure changed
6. Update root `package.json` with `"test:milestone-{N}": "node milestone_tests/milestone-{N}-{kebab-case}.js"`
7. Update `server/docs/swagger.json` if API changed; verify docs rendering at `/api-docs`

After artifacts are generated, run verification test and ensure it passes.

For small post-wrap-up tweaks, only update what changed (typically current milestone test/report), unless explicitly asked for full historical refresh.

## 9) Git/Commit Intent Guardrail

If user asks to "create/make/prepare a commit message", treat it as draft-only:

- Provide proposed message(s)
- Do not run `git add`, `git commit`, or `git push`
- Only execute commit commands if explicitly requested (e.g. "commit this now")
- If intent is ambiguous, ask one-line clarification first

## 10) Deployment Documentation Authority

- Canonical deployment guide: `RENDER-SUPABASE-DEPLOYMENT.md`
- `DEPLOYMENT-GUIDE.md` is a redirect/stub; do not duplicate full deployment instructions there

## 11) Safety Do-Nots

- Do not push secrets (`.env` files stay ignored).
- Do not rename/delete existing milestone tests or completion reports.
- Do not forget Swagger updates when API contracts change.

## 12) How To Prompt Codex In This Repo

Use this quick template when assigning tasks so implementation is fast and accurate.

### Prompt Template

- Goal: what feature/fix/change is needed
- Scope: exact files/folders allowed to change
- Non-scope: what must not be touched
- Constraints: UI/UX, API, DB, validation, performance, deadline rules
- Acceptance checks: concrete expected outcomes
- Milestone context: milestone number and whether Sync & Seal is required

Example:

"Implement [feature] in [module].
Edit only: [file paths].
Do not modify: [file paths].
Must follow: Tailwind v4, React Router v7, Sequelize-only DB access, booking message catalogs.
Acceptance: [testable bullets].
Milestone: [N], Sync & Seal: [yes/no]."

### Strong Prompt Examples

- "Add [behavior] in `client/src/...` and `server/src/...`; no schema changes."
- "Refactor only for readability in `server/services/...`; no behavior changes."
- "Fix bug in booking conflict flow; preserve existing API response shape."

### For Large Tasks (Recommended)

Ask Codex to do work in this order:

1. Read context (`AGENTS.md`, current milestone goal, directly relevant files only)
2. Share short plan
3. Implement in small batches
4. Run or describe verification
5. Summarize changed files and why

### If You Want Commit Text Only

Say: "Draft commit message only."
Codex should propose commit text and not run `git commit` unless explicitly asked.

### If You Want Execution

Say explicitly:

- "Run the edits now"
- "Apply the patch"
- "Commit this now" (only when you truly want an actual commit command)
