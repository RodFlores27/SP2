'use strict';

/**
 * Booking user-visible copy (Node / Express).
 *
 * This file does **not** use JSX. The client uses React fragments in `client/src/messages/bookingMessages.jsx`;
 * here everything is plain JavaScript strings (or functions that return strings).
 *
 * Structure (keep new copy in the right bucket):
 * - **api** — JSON `error` / `message` fields sent to the client. Plain text only (no HTML).
 * - **domain** — Strings thrown or attached to domain/service errors (lock window, contention, etc.).
 * - **email** — HTML email bodies: trusted static snippets may include inline tags (`<strong>`, `<a>`).
 *   Pair **`title`** with **`body`** (main HTML paragraph). Subjects use **`({ id }) =>`** or **`({ id, hours }) =>`** etc.
 *   All **parameterized** helpers use a **single object** argument.
 *
 * Controllers: `booking.controller.js` → `api`. Rules/services: `booking-rules.js`, `contention.service.js` →
 * `domain`. Mail: `booking-notifications.js` → `email`.
 */

const api = {
  create: {
    missingFields:
      'Missing required fields: resourceType, resourceId, bookingType, startTime, and endTime are required',
    invalidResourceType: 'Invalid resourceType. Must be "equipment" or "room"',
    invalidBookingType: 'Invalid bookingType. Must be "pencil" or "firm"',
    invalidDates: 'Invalid date format for startTime or endTime',
    endBeforeStart: 'endTime must be after startTime',
    pastBooking: 'Cannot create booking in the past',
    invalidRebookId: 'Invalid rebookedFromBookingId',
    rebookSourceNotFound: 'Source booking for rebook not found',
    rebookAccessDenied: 'Access denied. You can only rebook your own booking attempts.',
    rebookInvalidStatus: ({ status, allowedListCsv }) =>
      `Cannot rebook from booking with status: ${status}. Only ${allowedListCsv} attempts can be rebooked.`,
    displacedRebookBlocked:
      'Cannot rebook yet: the firm booking that displaced this slot is still pending or approved. Try again after it is cancelled or denied.',
    threadNotLatest:
      'This booking attempt is no longer the latest in its thread. Please rebook from the most recent attempt.',
    rebookResourceMismatch: 'Resource type and resource must match the source booking when rebooking.',
    resourceNotFound: ({ resourceType }) => `${resourceType} not found`,
    resourceNotBookable: ({ resourceType, resourceStatus }) =>
      `Cannot book ${resourceType}. Current status: ${resourceStatus}`,
    firmFirmConflict: 'Firm bookings cannot overlap with other firm bookings',
    firmOwnPencilOverlapConfirm:
      'Firm booking overlaps your existing pencil booking(s). Confirm to proceed — overlapping pencil bookings will be cancelled.',
    firmForeignPencilOverlapConfirm:
      'Firm booking overlaps another user’s pencil booking(s). Confirm to proceed — those bookings remain active until staff approval, then are displaced if approved.',
    firmAuthRequired: 'Authorization document is required when creating a firm booking',
    pencilOverlapsFirm: 'Cannot create pencil booking: time slot overlaps a firm booking',
    pencilOwnDuplicate: "You already have a pencil booking for this time slot. Users are not allowed to overlap own pencils",
    pencilActiveContentionLocked: 'Slot is in active contention, please try again later',
    pencilForeignOverlapConfirm:
      'This pencil booking overlaps another user’s pencil booking. Confirm to proceed and start contention.',
    successCancelledPencils: ({ count }) =>
      `Booking created successfully. ${count} overlapping pencil booking(s) were cancelled.`,
    successFirmSubmitted: 'Firm booking submitted for staff approval.',
    successContentionStarted:
      'Booking created; contention timer started against the overlapping pencil holder.',
    successGeneric: 'Booking created successfully',
    failed: 'Failed to create booking',
    autoCancelledPencilRemark: 'Auto-cancelled: superseded by firm booking',
  },

  list: {
    accessDenied: 'Access denied.',
    invalidApprovedBy: 'Invalid approvedBy filter. Use approvedBy=me.',
    approvedByUserIdInvalid: 'approvedByUserId must be a positive integer.',
    approvedByRequiresApprovedStatus: 'approvedBy filters are only valid with status=approved.',
    fetchFailed: 'Failed to fetch bookings',
  },

  getById: {
    notFound: 'Booking not found',
    accessDenied: 'Access denied. You can only view your own bookings.',
    fetchFailed: 'Failed to fetch booking',
  },

  cancel: {
    notFound: 'Booking not found',
    accessDenied: 'Access denied. You can only cancel your own bookings.',
    alreadyTerminal: ({ status }) => `Booking is already ${status}`,
    firmStarted: 'Firm bookings cannot be cancelled once the scheduled start time has begun or passed.',
    successMessage: 'Booking cancelled successfully',
    failed: 'Failed to cancel booking',
  },

  convert: {
    notFound: 'Booking not found',
    accessDenied: 'Access denied. You can only convert your own bookings.',
    alreadyFirm: 'Booking is already a firm booking',
    cannotConvertStatus: ({ status }) => `Cannot convert ${status} booking to firm`,
    challengerBlocked:
      'As the challenger in an open contention, you cannot convert to firm until that round finishes. See your booking card for the current step and overlapping slots.',
    authRequired: 'Authorization document is required when converting to firm booking',
    overlapsFirm: 'Cannot convert to firm booking: time slot overlaps another firm booking',
    successMessage: 'Booking converted to firm successfully. Awaiting staff approval.',
    failed: 'Failed to convert booking to firm',
  },

  approve: {
    invalidId: 'Invalid booking id',
    notFound: 'Booking not found',
    invalidStatus: ({ status }) =>
      `Cannot approve booking with status: ${status}. Only firm bookings awaiting staff approval can be approved.`,
    lockWindow:
      'This firm booking can no longer be approved: the scheduled start is within 24 hours. Staff must approve at least 24 hours before start; otherwise the request expires automatically.',
    concurrentUpdate:
      'This booking was updated by another action. Refresh the staff dashboard and try again.',
    successMessage: 'Booking approved successfully',
    failed: 'Failed to approve booking',
  },

  deny: {
    invalidId: 'Invalid booking id',
    notFound: 'Booking not found',
    invalidBooking: 'Only firm bookings awaiting staff approval can be denied.',
    successMessage: 'Booking denied',
    failed: 'Failed to deny booking',
  },

  availability: {
    invalidResourceType: 'Invalid resourceType. Must be "equipment" or "room"',
    invalidStartDate: 'Invalid startDate format',
    invalidEndDate: 'Invalid endDate format',
    fetchFailed: 'Failed to fetch availability',
  },

  conflicts: {
    notFound: 'Booking not found',
    fetchFailed: 'Failed to fetch booking conflicts',
  },
};

const domain = {
  bookingLockWindow:
    'This schedule is within 24 hours of the start time. New bookings, firm convert-to-firm, and firm staff approval are not allowed in this window.',
  contentionDeadlineInvalid: 'Contention cannot start: resolution window has already lapsed.',
  defenderIneligible: 'Defender is not eligible for contention',
  challengerIneligible: 'Challenger is not eligible for contention',
  activeContentionLocked: 'Slot is in active contention, please try again later',
};

const email = {
  appName: 'PTCF Reservation',
  automatedFooter:
    'This is an automated message from PTCF Reservation. Please do not reply to this email.',

  bookingDetailsLabels: {
    bookingId: 'Booking ID',
    resource: 'Resource',
    bookingType: 'Booking Type',
    start: 'Start',
    end: 'End',
    purpose: 'Purpose',
  },

  created: {
    title: 'Booking Submitted',
    body: 'Your booking has been received. Here are the details:',
    subject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} Submitted`,
    viewDashboard: 'View your bookings →',
    defenderNote:
      '⚠️ Your pencil booking is being <strong>challenged</strong>. Another user is challenging your slot. Convert to a firm booking before the contention deadline to keep the reservation.',
    challengerNote:
      '⚔️ Your pencil booking is currently the <strong>challenger</strong> in an active 1v1 contention.',
    pencilTentativeNote:
      'ℹ️ Your pencil booking is <strong>tentative</strong>. It expires at the earlier of 3 days from creation or 24 hours before the scheduled start unless converted to a firm booking.',
    firmPendingNote:
      '⏳ Your firm booking has been submitted and is <strong>pending staff approval</strong>. Staff must approve it <strong>at least 24 hours before</strong> the scheduled start. If it is still pending inside that window, it will expire automatically.',
  },

  approved: {
    title: 'Booking Approved',
    body:
      'Great news! Your booking has been <strong style="color:#00573F;">approved</strong> by PTCF staff.',
    subject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} Approved`,
    staffRemarkLabel: 'Staff remark:',
    viewDashboard: 'View your bookings →',
  },

  denied: {
    title: 'Booking Denied',
    body:
      'Unfortunately, your booking has been <strong style="color:#8A1538;">denied</strong> by PTCF staff.',
    reasonLabel: 'Reason:',
    contactFacility: 'If you have questions, please contact the PTCF facility directly.',
    subject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} Denied`,
    createNew: 'Create a new booking →',
  },

  cancelled: {
    title: 'Booking Cancelled',
    body: 'Your booking has been <strong>cancelled</strong>.',
    staffCancelledNote:
      'ℹ️ This booking was cancelled by a staff member.',
    subject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} Cancelled`,
    createNew: 'Create a new booking →',
  },

  expired: {
    firmTitle: 'Firm Request Expired',
    pencilTitle: 'Pencil Booking Expired',
    firmBody:
      'Your <strong>firm</strong> booking request has <strong style="color:#8A1538;">expired</strong> because staff did not approve it at least <strong>24 hours before</strong> the scheduled start.',
    firmCallout:
      'Submit a new request with enough lead time for staff review if you still need the slot.',
    pencilBody:
      'Your pencil booking has <strong style="color:#8A1538;">expired</strong> because it was not converted to a firm booking in time.',
    pencilCallout:
      'Pencil bookings must be converted to firm bookings within 3 days of creation (and before other pencil expiry rules). This booking has been automatically expired.',
    subject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} Expired`,
    createNew: 'Create a new booking →',
  },

  expiringSoon: {
    title: ({ hours }) => `Pencil Booking Expiring in ${hours} Hours`,
    body: ({ hours }) =>
      `Your pencil booking is expiring in <strong>${hours} hours</strong>. Convert it to a firm booking to keep your reservation.`,
    callout:
      'To secure this booking, upload your authorization document and convert it to a firm booking before it expires.',
    convertCta: 'Convert to Firm Booking →',
    subject: ({ bookingLabel, hours }) => `[PTCF] Booking ${bookingLabel} Expires in ${hours}h — Action Required`,
  },

  contentionStarted: {
    defenderTitle: 'Your pencil booking is being challenged',
    defenderBody:
      'Another user has placed an overlapping pencil booking for the same resource. A contention timer is running.',
    defenderResolveBy: 'Resolve by:',
    defenderAction:
      'To keep this slot, convert your booking to a <strong>firm</strong> booking and upload your authorization document before the deadline.',
    defenderDashboard: 'Open your dashboard →',
    defenderSubject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} — being challenged`,
    challengerTitle: 'You started a pencil contention',
    challengerBody:
      'Your overlapping pencil booking is now challenging the current holder. If they do not convert to firm in time, you will take the slot.',
    challengerResolvesBy: 'Contention resolves by:',
    challengerDashboard: 'View your booking →',
    challengerSubject: ({ bookingLabel }) => `[PTCF] Booking ${bookingLabel} — contention started`,
    timezoneNote: '(Asia/Manila)',
  },

  displacedSlotReopened: {
    title: 'Time slot may be available again',
    body:
      'A firm booking that previously displaced your pencil booking has been <strong>cancelled</strong>. The time window may be open again on a first-come, first-served basis.',
    yourBookingLabel: 'Your displaced pencil booking',
    firmCancelledLabel: 'Firm booking cancelled:',
    tryAgain: 'Try booking again →',
    subject: ({ firmBookingLabel }) => `[PTCF] Slot notice — firm booking ${firmBookingLabel} cancelled`,
  },
};

module.exports = {
  api,
  domain,
  email,
};
