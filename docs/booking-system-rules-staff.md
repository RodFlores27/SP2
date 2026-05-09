# Booking system rules (staff and administrators) — v2

This guide explains current booking behavior in plain language for **facility staff** and **system administrators**.

It is aligned with the strict **1v1 contention + `on_hold`** model used by the live system.

For technical transitions and code-level lifecycle details, see [`booking-transition-catalog-v2.md`](booking-transition-catalog-v2.md).

---

## 1) Booking types

| Kind | Meaning | Needs staff approval? |
| --- | --- | --- |
| **Pencil** | Soft hold on a slot. Can expire, enter contention, or be displaced by approved firms. | No |
| **Firm** | Formal request for the slot. Becomes final once staff approves. | **Yes** (`pending_approval`) |

There is **no** separate `confirmed` status. Approved firm = `approved`.

---

## 2) Booking time window

Rules tied to the booking start time:

- Users can create new pencil or firm bookings based on request-type lead time: equipment in-house requires at least 2 days, equipment loan at least 7 days, and rooms at least 7 days before start time.
- Users cannot create **new** pencil or firm bookings when start time is within 24 hours.
- Staff can approve a firm only while start time is still **more than 24 hours away**.
- A firm still `pending_approval` at the cutoff is auto-marked `expired` by cron.
- `deny` can still be used to close a pending row before cron catches it.

---

## 3) Pencil expiry and warnings

- Pencil expiry = earlier of:
  - 3 days after creation, or
  - 24 hours before scheduled start.
- Expiry is processed by scheduled jobs.
- Users can receive 48h / 24h warning emails for eligible pencils.

---

## 4) Overlap rules (same resource, overlapping time)

| Scenario | Result |
| --- | --- |
| Firm vs firm (`pending_approval` or `approved`) | New booking is rejected. |
| Pencil vs firm (`pending_approval` or `approved`) | Pencil is rejected. |
| Firm vs other users’ pencils | Firm submission allowed (with user confirmation in foreign-pencil overlap cases). No displacement yet at submit time. |
| Pencil vs other users’ pencils | May start strict 1v1 contention after confirmation only when no active contention pair overlaps. If an overlapping active defender **or** challenger already exists, creation is hard-rejected (`ACTIVE_CONTENTION_LOCKED`). |

Same-user rules:

- User cannot create a duplicate overlapping pencil against their own active pencil (`penciled` or `on_hold`).
- Creating a firm over own overlapping pencils (`penciled`/`on_hold`) requires confirmation; those own pencils are auto-cancelled.

---

## 5) Pencil contention (strict 1v1, automatic)

When two different users pencil-overlap the same resource:

- System chooses **defender** deterministically (earliest `createdAt` then tie-breaker `id`).
- Other side becomes **challenger**.
- There is **no queue/waitlist/group ladder** in runtime behavior.
- Third entrant while an overlapping defender is active is hard-rejected (`ACTIVE_CONTENTION_LOCKED`).

Deadline for a defender episode:

- `minimum(now + 24h, start - 24h, defender expiryAt)`

Staff role:

- Staff do not manually decide defender/challenger winners.
- Staff primarily act on firm approvals/denials.

Non-cancel loser outcomes in contention:

- Defender loses by deadline/expiry-boundary -> defender is marked `displaced`.
- Challenger loses by expiry -> challenger is marked `expired` (not `on_hold`).

---

## 6) `on_hold` state (important)

`on_hold` means a pencil is currently blocked by overlapping firm blockers.

- Caused by:
  - Firm created over a pencil.
  - Challenger pencil losing due to defender converting to firm during contention. 
- `on_hold` pencils stay visible but are not treated as free active pencils.
- If the blocking firm disappears (denied/cancelled), `on_hold` pencils are rebuilt:
  - remain `on_hold` if still blocked by another firm, or
  - return to `penciled` and may re-enter 1v1 contention.
- If an `on_hold` pencil returns to active `penciled`, the user now receives an **on-hold released** notification.

Important nuance:

- `on_hold` does **not** participate in active-pencil contention overlap checks.
- But new pencil creation is still be rejected if overlapping firm blockers are found.

---

## 7) Convert pencil to firm

Conversion basics:

- Requires authorization document.
- Allowed only from eligible pencil states.
- Challenger conversion is blocked; defender (or free pencil) can convert based on current rules.

When a defender converts:

- Converted row becomes `firm + pending_approval`.
- Challenger is released from contention and rebuilt (`on_hold` or `penciled`).
- No one is displaced at conversion moment.

Displacement happens only when staff approves the firm.

---

## 8) Staff actions on firm bookings

### Approve

- Valid only for `firm + pending_approval`.
- Must be outside 24-hour pre-start lock window.
- On approval, overlapping active pencils are displaced.

### Deny

- Valid only for `firm + pending_approval`.
- Does not displace pencils.
- Triggers rebuild pass for overlapping `on_hold` pencils (same post-firm cleanup path used by cancel).
- Any released `on_hold -> penciled` rows are notified.

### Pending firm auto-expiry at lock window

- If a firm request stays `pending_approval` into the 24-hour lock window, cron marks it `expired`.
- During that auto-expiry, overlapping `on_hold` pencils are now always rebuilt (same cleanup path as deny/cancel).
- Any released `on_hold -> penciled` rows are notified.

---

## 9) Displacement and rebooking

Displacement is a terminal outcome for that booking row:

- Trigger: staff approval of overlapping firm.
- Result: overlapping active pencils become `displaced` and linked to the firm.

Rebooking note:

- Users can create a new booking attempt, but rebook constraints apply while the displacing firm remains active.

---

## 10) Cancellation behavior

- `cancelled` is terminal for that booking row.
- Cancelling bookings involved in contention triggers automatic contention rebuild logic.
- If an approved firm is cancelled, previously displaced users can be notified that slot conditions changed.

---

## 11) Status glossary (current)

| Status | Meaning |
| --- | --- |
| `penciled` | Active soft hold. |
| `on_hold` | Pencil is firm-blocked temporarily. |
| `pending_approval` | Firm request awaiting staff decision. |
| `approved` | Firm accepted and active. |
| `denied` | Firm rejected by staff. |
| `cancelled` | User/staff cancelled the booking row. |
| `expired` | Booking passed allowed lifetime/deadline (includes pending firm hitting approval deadline). |
| `displaced` | Pencil lost to an approved overlapping firm. |
| `completed` | Approved firm ended and was marked complete by cron. |

Legacy note:

- `contested` may appear in legacy data/surfaces, but runtime contention source of truth is `contentionRole` (`defender` / `challenger`).

---

## 12) Practical staff checklist

1. Prioritize `pending_approval` firms before the 24-hour cutoff.
2. Do not manually arbitrate pencil-vs-pencil contention outcomes.
3. Explain that displacement occurs on **firm approval**, not on submit/convert alone.
4. Use deny/remarks clearly when rejecting firm requests.
5. If demo reseed/reset happened, ask users to re-login if sessions become stale.

---

## 13) Related documents

| Document | Audience |
| --- | --- |
| [`booking-transition-catalog-v2.md`](booking-transition-catalog-v2.md) | Developers/testers (technical transitions and hooks) |
| [`AGENTS.md`](../AGENTS.md) | Project-wide implementation reference |

If this guide and live behavior differ, treat runtime behavior as source of truth and update docs immediately.
