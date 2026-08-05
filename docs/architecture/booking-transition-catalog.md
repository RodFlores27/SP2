# Booking & Contention — Transition Catalog v2.2 (Strict 1v1 + on_hold)

Purpose: technical reference for the current strict 1v1 contention model with explicit `on_hold`.

## Scope

- Strict 1v1 only (no queue/group runtime logic)
- Keep contention fields on `Bookings`:
  - `contentionRole` (`defender` | `challenger` | `null`)
  - `contentionDeadlineAt`
  - `challengingBookingId`
- Explicit pencil hold status:
  - `status='on_hold'` for pencils blocked by overlapping firm blockers
- Third entrant rule:
- new pencil is hard-rejected if overlapping any active contention participant (`defender` or `challenger`) (`409 ACTIVE_CONTENTION_LOCKED`)

## Status Model

Active/important booking statuses in current runtime:

```text
penciled | on_hold | pending_approval | approved | denied | cancelled | expired | displaced | completed
```

Notes:
- `on_hold` means pencil exists on calendar but is firm-blocked.
- `on_hold` is non-blocking for foreign-contention overlap checks, but it **does** block same-user duplicate pencil creation.
- `contested` remains deprecated/backward-compat terminology in some surfaces; runtime role source of truth is `contentionRole`.

## Create Rules

### Create pencil
1. Reject if overlapping firm blocker (`pending_approval` / `approved`) -> `409`.
2. Reject if overlapping own active pencil -> `409`.
3. Evaluate foreign active pencil overlaps (`status='penciled'` only):
   - if any overlapping active contention participant exists (`defender` or `challenger`) -> `409 ACTIVE_CONTENTION_LOCKED` (include `contentionDeadlineAt` for UI notice when available).
   - otherwise, require explicit user confirmation (`requiresContentionConfirmation`) before starting contention, and include projected `contentionDeadlineAt` for the confirmation alert.
   - after confirmation, start 1v1 with earliest `createdAt` defender election.

Defender election rule:
- election pool includes the current booking and free overlapping foreign pencils.
- earliest `createdAt` (then `id`) becomes defender.

### Create firm
1. Reject if overlapping active firm blocker.
2. Own-pencil overlaps (`penciled` or `on_hold`) require explicit confirmation (`confirmOverlapOwn`), then own overlapping pencils are cancelled.
3. Firm is created as `pending_approval`.
4. Post-create firm hooks re-evaluate overlapping pencils:
   - dissolve unwinnable active defenders/challengers
   - rebuild overlapping pencils
   - apply `on_hold` when firm-blocked.

## 1v1 Lifecycle

### Start contention
- Defender:
  - `contentionRole='defender'`
  - `contentionDeadlineAt = min(now + 24h, start - 24h, expiryAt)`
- Challenger:
  - `contentionRole='challenger'`
  - `challengingBookingId = defender.id`

### Defender loses (deadline / cancel / expiry-boundary)
1. Defender becomes terminal (`displaced` / `cancelled` only).
2. Defender contention fields cleared.
3. Challenger contention fields cleared.
4. Challenger runs rebuild:
   - if firm-blocked -> `on_hold`
   - else `penciled` and attempt re-attach to next 1v1 overlap.

### Challenger loses (cancel / expiry)
1. Challenger becomes terminal (`cancelled` / `expired`).
2. Challenger contention fields cleared.
3. Defender contention fields cleared.
4. Defender runs rebuild:
   - if firm-blocked -> `on_hold`
   - else remains free `penciled` (and may re-attach when eligible).

Explicit non-cancel loser outcomes:
- defender loss by deadline/expiry-boundary -> defender becomes `displaced`
- challenger loss by expiry -> challenger becomes `expired` (not `on_hold`)

## Firm Interaction Rules

### Defender converts to firm
1. Defender becomes `firm + pending_approval`.
2. Challenger leaves contention (`contentionRole=null`).
3. Challenger is reclassified:
   - `on_hold` if now firm-blocked
   - otherwise `penciled`.

### Firm approved
- All overlapping active pencils are displaced (`status='displaced'`).

### Firm denied/cancelled
- Firm contention metadata is cleared.
- Overlapping `on_hold` pencils are rebuilt:
  - still blocked by another firm -> remain `on_hold`
  - unblocked -> become `penciled` and attempt 1v1 attach.

### New firm over active 1v1 (unwinnable defender)
- If firm overlaps an active defender/challenger battle, that episode is auto-dissolved.
- Both sides are rebuilt immediately.
- Any side still firm-blocked becomes `on_hold`.

## Rebuild Pattern (Generalized)

All episode-end hooks use the same rebuild intent (`rebuildPencilAfterEpisode`):
1. Lock/reload target pencil.
2. Ignore terminal/non-pencil rows.
3. Apply firm-hold classification (`on_hold` vs `penciled`).
4. If free `penciled` and not in contention, attempt 1v1 attach.
5. If attach is blocked by another active defender lock, keep free pencil state.

This pattern is used after:
- defender/challenger loss
- firm denied/cancelled
- forced dissolve from firm overlap
- firm post-create safety re-evaluation pass.

## Cron Jobs

From `../../server/jobs/booking-expiry.js`:
- `resolveDueContentionDeadlines` (defender timeout)
- `resolveExpiredChallengers`
- `resolveExpiredDefenders`
- firm pending approval expiry handling
- approved firm completion handling
- free pencil expiry handling.

## API Contract Notes

Primary contention fields to consume:
- `contentionRole`
- `contentionDeadlineAt`
- `challengingBookingId`
- `contentionChallenger` convenience flag

Legacy queue/group fields are deprecated and do not drive runtime behavior.

## Implementation Map

- `../../server/services/contention.service.js`
  - `tryAttachPencilToContention`
  - `resolveDefenderLoses1v1`
  - `resolveChallengerLoses1v1`
  - `autoResolveFirmBlockedDefenders`
  - `rebuildPencilAfterEpisode`
  - `reevaluateOverlappingPencilsForFirm`
- `../../server/controllers/booking.controller.js`
  - create/cancel/convert/approve/deny hooks
- `../../server/jobs/booking-expiry.js`
  - deadline/expiry lifecycle hooks
- `../../server/models/booking.js`
  - active pencil vs firm-blocking overlap semantics

## Verification Checklist

- [ ] 1v1 starts with deterministic earliest-created defender election
- [ ] Third overlapping pencil is hard-rejected while defender is active
- [ ] Defender lose path rebuilds challenger (`on_hold` if firm-blocked)
- [ ] Challenger lose path rebuilds defender (`on_hold` if firm-blocked)
- [ ] New firm over active 1v1 auto-dissolves unwinnable episode
- [ ] `on_hold` pencils are non-blocking for active-pencil contention checks (`findActivePencilOverlaps`), while firm blockers can still reject new pencil creation
- [ ] Firm cancel/deny re-evaluates `on_hold` pencils and re-enters contention when unblocked
- [ ] Firm approval displaces overlapping active pencils
