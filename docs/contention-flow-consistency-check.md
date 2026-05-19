# Contention Flow Consistency Check

Checked against the current two-lane contention flow diagram and the backend implementation.

## Result

The diagram and manuscript wording are consistent with the implemented booking rules, with these implementation details preserved:

- Pencil-to-pencil overlaps use strict 1v1 contention.
- The system assigns `defender` and `challenger` automatically.
- Staff do not manually choose the winner of pencil-to-pencil contention.
- A defender can convert to a firm request, which changes the booking to `firm` + `pending_approval`.
- When a defender converts to firm, the challenger is rebuilt and may become `on_hold` if the pending firm blocks it.
- No pencil is displaced at the defender-conversion moment.
- If the defender misses the contention deadline, the defender becomes `displaced`.
- A firm request over an existing pencil can put the overlapping pencil on hold while the firm is unresolved.
- On staff approval of the firm request, overlapping `penciled` or `on_hold` pencils become `displaced`.
- If the firm request is denied, cancelled, or expires, overlapping `on_hold` pencils are rebuilt and may become active again or re-enter contention.

## Code Paths Checked

- `server/services/contention.service.js`
  - `applyFirmHoldState`
  - `rebuildPencilAfterEpisode`
  - `onDefenderConvertedToFirm`
  - `onFirmBookingApproved`
  - `onFirmDeniedOrCancelled`
  - `autoResolveFirmBlockedDefenders`
  - `reevaluateOverlappingPencilsForFirm`
  - `resolveDueContentionDeadlines`
- `server/controllers/booking.controller.js`
  - booking creation overlap handling
  - convert-to-firm handling
  - staff approval handling
- `docs/booking-system-rules-staff.md`
  - sections on overlap rules, pencil contention, `on_hold`, convert-to-firm, staff actions, and displacement.

## Manuscript Check

The LaTeX subsection `Contention, On-Hold, and Displacement Handling` now states that displacement occurs after firm approval, while unresolved firm requests only place affected pencils on hold.
