# Milestone 13 Completion Report

**Date:** April 15-27, 2026  
**Project:** PTCF Room and Equipment Reservation Management System  
**Milestone:** MVP Refactor, Booking Contention Rules, and Stabilization  
**Status:** Complete

---

## Requirements Checklist

- [x] Stabilize the MVP after Milestone 12 before Kafka work.
- [x] Separate Cloudinary upload folders by environment.
- [x] Add rebooking lineage and change tracking for cancelled, denied, and expired bookings.
- [x] Implement automatic pencil contention with deterministic defender/challenger roles.
- [x] Replace queue/group contention behavior with strict 1v1 runtime rules.
- [x] Add displacement and `on_hold` lifecycle handling for firm-over-pencil conflicts.
- [x] Enforce firm approval deadlines and approved-firm completion handling.
- [x] Improve My Bookings, Calendar, Staff Dashboard, and Admin Panel UX around new booking states.
- [x] Centralize booking-related user-facing copy on both client and server.
- [x] Add targeted seed/reset workflows for repeatable MVP demonstrations.
- [x] Add milestone 13 verification coverage and booking-rule documentation.

---

## Git History Reconstructed

Milestone 13 is reconstructed from the commit range:

```txt
f9f3133..9cb8131
```

This starts after the Milestone 12 branch (`f9f3133`, deployment/env loading and MVP demo reset cleanup) and ends at the `mvp_refactor` / `main` refactor point (`9cb8131`) immediately before the Kafka planning and Milestone 14 commits.

Important commits in this range:

- `3175b38` - Cloudinary folder isolation for dev/prod uploads.
- `79a315b` - My Bookings scope/session handling and initial rebook flow.
- `1a99898` - Rebook lineage, change summaries, and staff-focused review UX.
- `8fec299` - Completed rebook workflow, auth-doc hashing, denied rebook queue, concurrency-safe approve/deny.
- `2c1837b` - Automated pencil contention, displacement, staff docs, and milestone 13 test script.
- `9b9131a` - Contention UX, approved bookings staff tab, completion progression, and race-state guards.
- `0604d62` - Firm approval deadline, pre-start firm cancellation, cron expiry updates.
- `4299180` - Contention lifecycle stabilization and calendar grouping fixes.
- `3499706` - `on_hold`, strict 1v1 calendar pair grouping, availability payload fixes.
- `3569073` - Centralized client/server booking message catalogs.
- `02475d8` - Foundation/showcase seed workflows and My Bookings filter upgrades.
- `982f1d4` / `9cb8131` - Staff dashboard and staff SOP refactor wrap-up before Kafka.

---

## Implementation Summary

### Environment and Deployment Stabilization

Cloudinary uploads now respect `CLOUDINARY_FOLDER` as an environment base such as `ptcf/dev` or `ptcf/prod`. Equipment, room, and authorization-document uploads use resource subfolders under that base, which keeps development and production media separated while preserving backward compatibility for fully qualified `ptcf/*` folder paths.

Core resources also gained soft-delete support through migrations and model updates, reducing the risk of destructive data loss during MVP demos.

### Rebooking and Change Tracking

The booking model and controller were extended with rebooking lineage fields:

- `bookingThreadId`
- `rebookedFromBookingId`
- `rebookedFromStatus`
- `rebookChangeSummary`
- `authorizationDocHash`

Cancelled, denied, and expired bookings can be used as the source for a new booking attempt. The form is semi-locked where appropriate, authorization documents can be reused, and SHA-256 hashes prevent same-document Cloudinary URL churn from appearing as a meaningful document change.

Staff views now surface prior attempt context, change summaries, and denied-origin urgency so reviewers can understand why a booking was resubmitted.

### Contention, Displacement, and `on_hold`

Milestone 13 introduced the booking contention refactor that became the source of truth for the MVP:

- Pencil-vs-pencil overlaps can start automatic contention.
- Runtime contention now uses strict 1v1 roles:
  - `contentionRole='defender'`
  - `contentionRole='challenger'`
  - `challengingBookingId`
  - `contentionDeadlineAt`
- Third overlapping entrants are rejected while an active defender/challenger pair is already present.
- Defender and challenger cancellation/expiry paths rebuild the surviving pencil cleanly.
- Firm approval displaces overlapping active pencils with `status='displaced'`.
- Firm-blocked pencils can enter `status='on_hold'`.
- When a blocking firm is cancelled or denied, `on_hold` pencils are rebuilt and may re-enter free pencil or 1v1 contention state.

The earlier queue/group idea was retained only in historical docs and migration context. The current runtime model is strict 1v1 plus `on_hold`.

### Firm Deadlines and Scheduled Job Expansion

The expiry job was expanded beyond free pencil expiry:

- Resolve due contention deadlines.
- Resolve expired challengers and defenders.
- Expire pending firm requests at the 24-hour pre-start approval cutoff.
- Unfreeze or rebuild affected pencils after firm expiry/cancel/deny.
- Mark past approved firm bookings as `completed`.
- Preserve warning and expiry notifications.

Firm conversion and approval now honor the 24-hour pre-start lock window, while firm cancellation remains allowed before the start time.

### Frontend and Staff Workflow Updates

The client was updated across the booking workflow:

- My Bookings filters and sorting were upgraded for active, past, conflict, expiry, duration, and update-focused triage.
- Booking cards now show contention, challenger, displaced, on-hold, rebook, and firm deadline context.
- Calendar grouping was fixed so independent 1v1 pairs do not merge into one broad contention block.
- Availability payloads now expose pairing metadata such as `challengingBookingId` and `contentionChallenger`.
- Staff Dashboard gained clearer tab-specific filters, approved-booking visibility, approver attribution, denied rebook handling, and compact review panels.
- Admin Panel copy and confirmation flows were polished after Milestone 12.
- Login/session handling now supports idle timeout and session-expired notices.

### Message Catalogs and Documentation

Booking copy was centralized to reduce duplicated literals and make future edits safer:

- Client UI copy: `client/src/messages/bookingMessages.jsx`
- Client compatibility export: `client/src/messages/bookingMessages.js`
- Server API/domain/email copy: `server/messages/bookingMessages.js`

Documentation added or substantially refreshed:

- `docs/booking-system-rules-staff.md`
- `docs/booking-staff-sop-quick.md`
- `docs/booking-transition-catalog-seed.md`
- `docs/booking-transition-catalog-v2.md`
- `.cursor/rules/booking-user-messages.mdc`
- `.cursor/rules/database-reseed-commands.mdc`
- `.cursor/rules/commit-message-vs-commit-intent.mdc`
- `AGENTS.md`

---

## API and Data Model Changes

### Booking Model / Migration Additions

- Staff remark alignment.
- Soft-delete fields for core entities.
- Rebook lineage and change summary fields.
- Authorization document hash fields.
- Contention and displacement fields.
- Approval audit fields (`approvedByUserId`, `approvedAt`).
- Denial audit fields (`deniedByUserId`, `deniedAt`).
- New booking statuses:
  - `on_hold`
  - `displaced`
  - `completed`

### Endpoint and Contract Updates

- `GET /api/bookings` gained staff-focused filters such as denied rebook source filtering.
- `GET /api/bookings/availability` gained contention/challenger metadata for calendar grouping.
- Booking creation supports confirmation flags for contention and own-overlap firm behavior.
- Convert, approve, deny, cancel, and cron-driven lifecycle paths were updated for strict 1v1 contention and firm-blocking rules.
- Swagger documentation was updated for booking filters, fields, lifecycle responses, and new business-rule errors.

---

## Verification Tests

**Script:** `milestone_tests/milestone-13-booking-contention-rules.js`  
**Run:** `npm run test:milestone-13`

Automated checks include:

- Server health check.
- Three-user login setup.
- Resource selection from public equipment/room APIs.
- Base pencil creation.
- Challenger pencil creation starts 1v1 contention.
- Defender/challenger roles and `challengingBookingId` are assigned correctly.
- Third overlapping entrant is rejected with `ACTIVE_CONTENTION_LOCKED`.
- Challenger cancellation releases defender back to free pencil state.
- Extended firm-over-contention scenario establishes 1v1 before firm overlap hooks run.
- Creating an overlapping firm dissolves active contention and moves blocked pencils to `on_hold`.
- A free pencil can be created while another pencil is `on_hold` when it does not violate firm blockers.
- Firm cancellation triggers `on_hold` rebuild and deterministic new defender/challenger assignment.

Related manual verification:

- My Bookings displays displaced/on-hold/contention/rebook states clearly.
- Calendar shows separate strict 1v1 contention pairs instead of merged overlap clusters.
- Staff Dashboard filters and review panels expose pending, approved, denied rebook, and contention context.
- Reset/seed scripts support repeatable MVP demos.

---

## Code Quality Assessment

- The runtime contention model was simplified to strict 1v1, reducing ambiguity from queue/group behavior.
- Booking side effects are handled after successful database transitions, with concurrency-sensitive approve/deny updates tightened.
- User-facing booking copy now has centralized catalogs instead of scattered strings.
- Demo data setup became more repeatable through foundation/showcase seed scripts.
- Docs were expanded so staff-facing rules, transition behavior, and agent guidance match the evolved booking lifecycle.
- The MVP remained a modular monolith at this point; Kafka integration was intentionally deferred until Milestone 14.

---

## Readiness Checklist

- [x] Rebook lineage and change tracking implemented.
- [x] Authorization document hash comparison added.
- [x] Strict 1v1 contention service implemented.
- [x] `on_hold`, `displaced`, and `completed` lifecycle behavior added.
- [x] Cron lifecycle paths expanded for contention, firm deadlines, and completion.
- [x] Calendar grouping and availability metadata updated.
- [x] Staff Dashboard and My Bookings updated for new states.
- [x] Booking message catalogs centralized.
- [x] Staff SOP and transition documentation refreshed.
- [x] Milestone 13 verification script registered in root `package.json`.
- [x] Milestone test README updated.

---

## Next Steps

Milestone 14 should begin the Kafka implementation from this stabilized MVP baseline. Kafka should be added as an opt-in event layer for booking lifecycle side effects without redesigning the existing booking APIs or rewriting the newly stabilized contention rules.

---

## Summary

Milestone 13 filled the gap between the original MVP deployment/polish plan and the later Kafka milestones. In practice, it became the major MVP refactor and booking-rule stabilization milestone: rebooking, strict 1v1 contention, displacement, `on_hold`, firm deadlines, staff workflow cleanup, calendar fixes, message catalogs, and repeatable demo seeds were all completed before Kafka work began.
