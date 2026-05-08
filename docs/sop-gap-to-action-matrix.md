# PTCF SOP Gap-to-Action Matrix (Refactored v4)

Source baseline: `C:/BSCS/SP/SP2/PTCF Booking Process Overhaul.md`
System compared: current implementation in `C:/BSCS/SP/SP2/PTCF Project`
Date assessed: 2026-05-07

## Locked Project Decisions
1. SMS is out of scope; email is the official notification channel.
2. Google Calendar integration is out of scope; the in-app calendar is the official booking calendar.
3. Signatory level rules remain guideline-governed user responsibility (`Guidelines.jsx`, `endorsementRequirements`).
4. No post-approval reconfirmation step.
5. Denial alternatives (suggested slots/experiment alternatives) are not required as structured system features.

## Final Implemented Definitions

### Equipment booking reference
- Format: `{CATEGORY_CODE}-{EQUIPMENT_ID_CODE}-{SEQUENCE}-{YY}`
- Example: `STE-AUT-001-26`
- `YY` is derived from booking created year.

### Room code and room booking reference
- Room uses one full code field in `Rooms.resourceCode` (single-line value such as `PTCF-2-CR-M2-RA`).
- Room reference format: `{ROOM_CODE}-{SEQUENCE}-{YY}`
- Example: `PTCF-2-CR-M2-RA-001-26`

## Matrix
| SOP Area | Expected / Agreed Rule | Current System Behavior | Gap Status | Notes |
|---|---|---|---|---|
| Submission channel | In-app calendar/booking flow | Implemented | Implemented | Google Calendar integration waived by decision |
| Notification channel | Email-only | Implemented | Implemented | SMS waived by decision |
| Equipment request type | Explicit `in_house` / `loan` | Implemented | Implemented | Required for equipment booking create path |
| Equipment lead time (in-house) | Minimum 2 days | Implemented | Implemented | Enforced in backend |
| Equipment lead time (loan) | Minimum 7 days | Implemented | Implemented | Enforced in backend |
| Room lead time | Minimum 7 days | Implemented | Implemented | Enforced in backend |
| Generic 7-day creation cap | Removed | Implemented | Implemented | Replaced by request-type lead time guards |
| Cancellation cutoff (equipment in-house) | Block inside 2 hours pre-start | Implemented | Implemented | Enforced in cancel endpoint rules |
| Cancellation cutoff (equipment loan) | Block inside 24 hours pre-start | Implemented | Implemented | Enforced in cancel endpoint rules |
| Cancellation cutoff (room) | Block inside 24 hours pre-start | Implemented | Implemented | Enforced in cancel endpoint rules |
| Denial message requirement | Deny requires staff message | Implemented | Implemented | `staffRemark` required on deny |
| Loan details | Reason + workflow note + transport plan required | Implemented | Implemented | Required in API and reflected in forms/staff review |
| Room details | Participants + equipment needs + setup/catering + program details required | Implemented | Implemented | Required in API and reflected in forms/staff review |
| Firm purpose requirement | Purpose required for firm booking | Implemented | Implemented | Enforced in create and convert-to-firm |
| Equipment reference format | `CATEGORY-EQUIPID-SEQ-YY` | Implemented | Implemented | Uses created year basis |
| Room reference format | `ROOMCODE-SEQ-YY` | Implemented | Implemented | Uses `Rooms.resourceCode` |
| Room code storage | Single full room code field | Implemented | Implemented | Room group code removed from room form and schema path |
| Reconfirmation step | Not required | Implemented | Waived (Decision) | No reconfirm feature by project decision |
| Denial alternatives workflow | Not required | Implemented | Waived (Decision) | Staff messaging handled operationally |
| Cancellation message completeness | Include reason + probable rebook date | Implemented | Implemented | Captured in cancellation flow and notification content |
| Room approval policy text | Include payment/damage policy in room approval email | Implemented | Implemented | Present in room approval notification content |

## Phase Closure Summary
- Phase 1: Implemented
- Phase 2: Implemented
- Phase 3: Implemented

Residual operational note:
- Existing legacy records seeded before the refactor may still contain old data shapes (for example null `equipmentRequestType` on old rows), but new and edited flows follow the final SOP-aligned rules above.
## Phase 4 (Post-SOP Enhancements)

Purpose: improvements after SOP alignment, not required for SOP compliance.

### Candidate items
1. UX copy and form guidance polish for staff/user flows.
2. Staff dashboard usability refinements (filter presets, clearer review panes, faster triage actions).
3. Lightweight performance pass (frontend code-splitting and heavy view optimization).
4. Automated regression tests for SOP-critical rules:
   - request-type lead times
   - cancellation required fields
   - deny remark required
   - reference code format checks
5. Admin diagnostics enhancements (runtime/Kafka/email health visibility).

### Prioritization (initial)
- Must:
  - Automated regression tests for SOP-critical rules.
- Should:
  - Staff dashboard usability refinements.
  - Admin diagnostics enhancements.
- Could:
  - UX copy/form guidance polish.
  - Performance optimization pass.

### Implementation status
- Phase 1: Implemented
- Phase 2: Implemented
- Phase 3: Implemented
- Phase 4: Backlog defined (pending selection)