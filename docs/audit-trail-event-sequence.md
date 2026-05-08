# Audit Trail End-to-End Walkthrough (Generate All Available Audit Events)

This guide gives one practical sequence of actions that will generate every audit event type currently available in the system.

## 1) Preconditions

1. Run backend with database access.
2. Set `KAFKA_ENABLED=true` and ensure Kafka is running (`booking-events` topic available).
3. Keep both consumers active in-process (normal server boot path):
   - notification consumer
   - audit consumer
4. Prepare 4 users:
   - `sysadmin` (`system_admin`)
   - `staff` (`ptcf_staff`)
   - `userA` (`regular_user`)
   - `userB` (`regular_user`)
5. Ensure at least:
   - 1 room resource (`roomR1`)
   - 2 equipment resources (`eq1`, `eq2`)
6. Use times well outside the 24-hour lock, except where expiry/deadline tests are intended.

## 2) Event Types You Can Generate

### Booking events (from Kafka lifecycle)
- `booking.created`
- `booking.approved`
- `booking.denied`
- `booking.cancelled`
- `booking.expired`
- `booking.expiring_soon`
- `booking.on_hold`
- `booking.displaced`
- `booking.contention_started`
- `booking.contention_resolved`
- `booking.converted_to_firm`

### Admin/resource events (direct app audit writes)
- `user.role_changed`
- `user.deleted`
- `resource.room_updated`
- `resource.equipment_updated`

### Not shown in Admin Audit Trail list
- `booking.displaced_slot_reopened` is published but intentionally excluded from `/admin/audit-logs`.

## 3) Step-by-Step Sequence

Use this exact order. After each step, open Admin Panel -> Audit Trail and confirm newest entries.

### Step A - Resource audit events
1. Login as `sysadmin`.
2. Edit `roomR1` (change a harmless field, save).
   - Expect: `resource.room_updated`
3. Edit `eq1` (change a harmless field, save).
   - Expect: `resource.equipment_updated`

### Step B - User admin audit events
4. In Admin Panel, change `userB` role from `regular_user` to `ptcf_staff`, then back to `regular_user`.
   - Expect: two `user.role_changed`
5. Create a temporary account `tempUser`, then delete it as `sysadmin`.
   - Expect: `user.deleted`

### Step C - Basic booking lifecycle
6. Login as `userA`; create a pencil booking on `eq1` at `T1`.
   - Expect: `booking.created`
7. Cancel that booking.
   - Expect: `booking.cancelled`

### Step D - Denial + approval
8. Login as `userA`; create a firm booking on `roomR1` at `T2` with auth doc.
   - Expect: `booking.created`
9. Login as `staff`; deny that firm booking.
   - Expect: `booking.denied`
10. Login as `userA`; create another firm booking on `roomR1` at `T3` with auth doc.
   - Expect: `booking.created`
11. Login as `staff`; approve it.
   - Expect: `booking.approved`

### Step E - Contention started/resolved + convert-to-firm + on_hold
12. Login as `userA`; create pencil booking on `eq2` at `T4`.
    - Expect: `booking.created`
13. Login as `userB`; create overlapping pencil on `eq2` at `T4` and confirm contention.
    - Expect: `booking.created` and `booking.contention_started`
14. Login as defender user (the earlier booking holder from step 12 if elected defender); convert to firm.
    - Expect: `booking.converted_to_firm`
    - Expect: `booking.contention_resolved` (single event with both parties)
    - Opponent will become `on_hold` depending on blockers.
15. Have `staff` approve the converted firm.
    - Expect: `booking.approved`
    - Expect for overlaps: `booking.displaced`

### Step F - Explicit on_hold through firm blocker (valid path)
16. Login as `userA`; create a pencil booking on `eq1` at `T5`.
    - Expect: `booking.created`
17. Login as `userA`; convert that same pencil to firm.
    - Expect: `booking.converted_to_firm`
18. Login as `staff`; approve the converted firm.
    - Expect: `booking.approved`
19. Ensure there is an overlapping opposing pencil involved in the same contention/rebuild path (from prior steps or by preparing the overlap before conversion flow completes) so rebuild classifies it as blocked by the newly approved/created firm.
    - Expect: one or more `booking.on_hold`

Note:
- Creating a brand-new pencil directly on top of an existing firm blocker is rejected by design.
- `booking.on_hold` is observed via rebuild/reclassification of existing pencils, not by directly creating a fresh overlapping pencil over a firm blocker.

### Step G - Defender-loss displacement reasons
18. Create a fresh 1v1 contention on `eq2` at `T6` (`userA` vs `userB`).
19. Let defender miss contention deadline (or force cron run when due).
    - Expect: `booking.contention_resolved` with `resolutionReason=defender_missed_deadline`
    - Defender outcome should reflect displacement.
20. Create another 1v1 where defender expires at boundary and run expiry cron.
    - Expect: `booking.contention_resolved` with `resolutionReason=defender_expired_boundary`

### Step H - Expiring soon + expired
21. Create pencil booking with `expiryAt` entering 48h warning window; run warning cron.
    - Expect: `booking.expiring_soon` (48h)
22. Let same booking enter 24h warning window; run warning cron again.
    - Expect: `booking.expiring_soon` (24h)
23. Let eligible pencil/firm hit expiry; run expiry cron.
    - Expect: `booking.expired`

## 4) Quick Verification Checklist

You should see at least one of each in Audit Trail:

- [ ] `resource.room_updated`
- [ ] `resource.equipment_updated`
- [ ] `user.role_changed`
- [ ] `user.deleted`
- [ ] `booking.created`
- [ ] `booking.cancelled`
- [ ] `booking.denied`
- [ ] `booking.approved`
- [ ] `booking.contention_started`
- [ ] `booking.contention_resolved`
- [ ] `booking.converted_to_firm`
- [ ] `booking.on_hold`
- [ ] `booking.displaced`
- [ ] `booking.expiring_soon`
- [ ] `booking.expired`

## 4.1 Payload checks (important)

For newer rows, confirm these details in Admin Panel Audit Trail:

- `booking.contention_resolved` is a single entry per contention episode and includes both defender/challenger in payload.
- `booking.on_hold` includes:
  - `source`
  - `causingBookingId`
  - `causingReferenceCode`
- `booking.displaced` includes:
  - `displacementReason`
  - `displacingBookingId`
  - `displacingReferenceCode`

## 5) Troubleshooting

1. If booking events do not appear, confirm `KAFKA_ENABLED=true` and audit consumer connected.
2. If an event appears in notifications but not audit trail, check if it is excluded (`booking.displaced_slot_reopened`).
3. For contention events, ensure two users and overlapping pencils on the same resource/time.
4. For expiry events, you may need short test windows and manual cron triggering in dev.
