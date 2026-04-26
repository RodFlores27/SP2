# PTCF Booking Staff SOP (Quick Version)

Use this as a fast operational guide for daily booking decisions.

For full policy context, see:

- `docs/booking-system-rules-staff.md`
- `docs/booking-transition-catalog-v2.md` (technical)

---

## 1) Daily Priority Order

1. Process **firm bookings** in `pending_approval` first.
2. Focus on requests nearest to the **24-hour pre-start cutoff**.
3. Add clear `staffRemark` when denying.
4. Re-check contested/helpdesk cases only after pending firms are handled.

---

## 2) Hard Rules You Must Remember

- No new booking (pencil or firm) can be created inside 24 hours before start.
- Firm approval must happen before the same 24-hour boundary.
- A firm still pending at the cutoff becomes `expired` automatically.
- Do not manually choose winners in pencil-vs-pencil contention.

---

## 3) Approve / Deny Decision Gate

A booking is approvable only when all are true:

- `bookingType = firm`
- `status = pending_approval`
- start time is still more than 24 hours away

### If you APPROVE

- Booking becomes `approved`.
- Overlapping active pencils are displaced automatically.

### If you DENY

- Booking becomes `denied`.
- No displacement is applied.
- Overlapping `on_hold` pencils are rebuilt by system rules.

---

## 4) What to Tell Users (Fast Script)

### A) “Why was my pencil blocked?”

- If overlapping a firm (`pending_approval` or `approved`), pencil create is rejected.
- If overlapping an active defender, system returns `ACTIVE_CONTENTION_LOCKED`.

### B) “Why can’t I convert to firm?”

- Challengers cannot convert while they are challenger.
- Conversion requires authorization document.
- Conversion/approval must still respect 24-hour lock boundary.

### C) “Why was I displaced?”

- Displacement happens when an overlapping firm is approved.
- It does not happen just because a firm was submitted.

### D) “Why is my booking on hold?”

- `on_hold` means a pencil is currently blocked by firm overlap.
- can happen if a firm booking was created over your pencil or you lost a contention as challenger (defender converted to firm).
- If blockers clear, system rebuilds it to `penciled` when eligible.

---

## 5) Status Cheat Sheet (Staff View)

- `penciled` - active soft hold
- `on_hold` - pencil blocked by pending approval firm overlap
- `pending_approval` - waiting for staff decision
- `approved` - accepted firm
- `denied` - rejected firm
- `cancelled` - cancelled booking row
- `expired` - timed out by rules:
  - failed to reach 'Approved' status before the 24-hour pre-start deadline.
  - pencil exceeded 3-day expiry.
- `displaced` - pencil removed due to approved firm or lost contention as defender
- `completed` - approved firm finished (past end time)

Legacy note:

- `contested` may appear in old records; current contention logic uses `contentionRole` (`defender` / `challenger`).

---

## 6) End-of-Shift Quick Checklist

- [ ] No urgent `pending_approval` firms near 24-hour cutoff left unresolved
- [ ] Denials include helpful `staffRemark`
- [ ] Team is aware of any user-facing contention/displacement incidents
- [ ] Any demo reseed/reset was communicated (users may need to log in again)
