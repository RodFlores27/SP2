/**
 * Booking user-visible copy (React client).
 *
 * Conventions:
 * - **JSX** — `() => ReactNode` or `({ ... }) => ReactNode` for copy rendered as children (use `<strong>`, etc.).
 * - **Plain strings** — only where required: Zod `schema`, `docErrors`, `apiFallbacks`, session fallbacks,
 *   HTML `placeholder`, `aria-label` / `title` attrs, calendar tooltips (`hover`, `roleLabel`), `Error()` messages.
 * - **Alerts** (`myBookings.activeCard.alerts`) — `icon` (Lucide), `title` / `body`, optional `introInSingleParagraph`,
 *   parameterized lines, toggle **strings** for aria/buttons.
 */

import { AlertTriangle, Info } from 'lucide-react';

const bookingLabel = (id) => {
  const value = String(id ?? 'n/a');
  return value.startsWith('#') || value.includes('-') ? value : `#${value}`;
};

export const bookingMessages = {
  // ---------------------------------------------------------------------------
  // My Bookings — ActiveBookingCard
  // ---------------------------------------------------------------------------
  myBookings: {
    activeCard: {
      alerts: {
        firmPendingOnHold: {
          icon: AlertTriangle,
          introInSingleParagraph: true,
          title: () => <strong>Cancellation or denial of this firm booking</strong>,
          body: () => (
            <> can give the slot to on-hold pencils that are waiting on this same window.</>
          ),
          summaryLine: ({ count }) => (
            <>
              This firm request currently {count === 1 ? 'puts' : 'put'} <strong>{count}</strong>{' '}
              pencil booking{count === 1 ? '' : 's'} on hold.
            </>
          ),
          detailsBody: () => (
            <>
              If this firm request is denied or cancelled, the overlapping on-hold pencils can become
              active again based on the current schedule state.
            </>
          ),
          listHeading: () => <>On-hold pencil bookings:</>,
          toggleHideDetails: 'Hide details',
          toggleViewDetails: 'View details',
          toggleAriaHide: 'Hide on-hold pencil details',
          toggleAriaView: 'View on-hold pencil details',
        },
        pencilOnHold: {
          icon: Info,
          title: () => <strong>This pencil booking is on hold</strong>,
          body: () => (
            <>
              This pencil booking is <strong>on hold</strong> because a <strong>firm booking</strong> currently takes priority. 
              It is inactive and does not block others from requesting this slot. If the firm booking is cancelled or denied, 
              your pencil will automatically reactivate and may enter contention again.
            </>
          ),
          summaryLine: ({ count }) => (
            <>
              This pencil booking is currently <strong>on hold</strong> due to overlapping firm booking
              {count === 1 ? '' : 's'}.
            </>
          ),
          detailsBody: () => (
            <>
              While on hold, this pencil is inactive and users can book over your schedule. If overlapping firm bookings are cancelled or denied,
              this pencil can reactivate or re-enter contention depending on current overlaps. It's recommended to just cancel and rebook to another schedule.
            </>
          ),
          overlappingFirmsListHeading: () => <>Overlapping firm bookings:</>,
          toggleHideDetails: 'Hide details',
          toggleViewDetails: 'View details',
          toggleAriaHide: 'Hide overlapping firm details',
          toggleAriaView: 'View overlapping firm details',
        },
        challenger: {
          icon: Info,
          introInSingleParagraph: false,
          title: () => <strong>You are currently the challenger</strong>,
          body: () => (
            <>
              You are challenging another pencil holder for this slot. They must convert to firm before the
              contention deadline, or you receive the slot. <strong>Convert to Firm</strong> is only enabled for the defender.
            </>
          ),
          summaryLine: ({ bookingId, formattedDeadline }) => (
            <>
              You are currently challenging Booking <strong>{bookingLabel(bookingId)}</strong>. You will win this contention if the holder does not
              confirm by <strong>{formattedDeadline}</strong>.
            </>
          ),
          detailsBody: () => (
            <>
              In a contention round, the <strong>Defender</strong> (first-in-line for this slot) has until the deadline to
              convert to a <strong>Firm</strong> booking. If they fail to do so, you will win the contention. If there are no further contentions that needs resolution, the slot is yours.
            </>
          ),
          whoDefenderHeading: () => <>Booking you are challenging</>,
          defenderSummaryLine: ({ bookingId, timeRange }) => (
            <>
              Booking {bookingLabel(bookingId)} — {timeRange}
            </>
          ),
          toggleHideDetails: 'Hide details',
          toggleViewDetails: 'View details',
          toggleAriaHide: 'Hide challenge details',
          toggleAriaView: 'View challenge details',
        },
        defender: {
          icon: AlertTriangle,
          introInSingleParagraph: true,
          title: () => <strong>Contention deadline has been set</strong>,
          body: () => (
            <>
              {' '}
              — you must convert to firm or the pencil slot will be given to the challenger.
            </>
          ),
          deadlineLine: ({ formattedDeadline }) => (
            <>
              Contention deadline: <strong>{formattedDeadline}</strong>
            </>
          ),
          summaryLine: ({ formattedDeadline }) => (
            <>
              Your booking is being challenged. Convert to firm before{' '}
              <strong>{formattedDeadline}</strong> to keep this slot.
            </>
          ),
          detailsBody: () => (
            <>
              In this contention round, you are the <strong>Defender</strong> (first-in-line for this slot). If you do not
              convert to a <strong>Firm</strong> booking before the deadline, the challenger wins this contention and your booking will be displaced.

              
            </>
          ),
          whoChallengesHeading: () => <>Booking challenging you</>,
          challengerSummaryLine: ({ bookingId, timeRange }) => (
            <>
              Booking {bookingLabel(bookingId)} — {timeRange}
            </>
          ),
          toggleViewDetails: 'View details',
          toggleAriaView: 'View challenger details',
          toggleAriaHide: 'Hide challenger details',
        },
      },

      meta: {
        purposeLabel: () => <>Purpose:</>,
        staffRemarkLabel: () => <>Staff remark:</>,
        expiresPrefix: () => <>Expires:</>,
        previousAttempts: {
          label: ({ count }) => <>Previous attempts ({count})</>,
          show: () => <>Show</>,
          hide: () => <>Hide</>,
          bookingLine: ({ id, statusLabel }) => (
            <>
              Booking {bookingLabel(id)} ({statusLabel})
            </>
          ),
        },
      },

      convertPanel: {
        icons: {
          convertError: AlertTriangle,
        },
        convertToFirm: () => <>Convert to Firm</>,
        close: () => <>Close</>,
        buttonCancelBooking: () => <>Cancel</>,
        convertSectionTitle: () => <>Convert to Firm Booking</>,
        convertSectionBlurb: () => (
          <>Convert as a firm request which will be submitted for staff approval.</>
        ),
        convertAuthRequiredSuffix: () => <> An authorization document is required.</>,
        convertPurposeLabel: () => <>Purpose</>,
        convertPurposePlaceholder: 'Describe the purpose of your booking...',
        convertConflictsHeading: () => <>Conflicting bookings:</>,
        convertConflictLine: ({ id, resourceName, typeLabel, statusLabel, range }) => (
          <>
            {bookingLabel(id)} {resourceName} — {typeLabel} ({statusLabel}) — {range}
          </>
        ),
        convertAuthLabel: () => <>Authorization Document</>,
        convertAuthHint: () => (
          <>
            Upload an authorization letter or supporting document for your firm booking.
          </>
        ),
        convertUsingPreviousDoc: () => <>Using authorization document from previous attempt.</>,
        replaceFile: () => <>Replace File</>,
        dropzoneTypes: () => <>PDF, DOC, DOCX, JPG, or PNG (max 5MB)</>,
        chooseFile: () => <>Choose File</>,
        convertSubmit: () => <>Submit for Approval</>,
        convertSubmitLoading: () => <>Converting...</>,
        cancel: () => <>Cancel</>,
      },
    },

    firmCancelBlocked: {
      startedOrPast: 'The start time has passed; this booking can’t be cancelled here.',
      cutoffReached: 'Cancellation cutoff has been reached for this booking type.',
    },
    deadlineQualifier: {
      expiry: 'This deadline matches pencil expiry.',
      lockWindow: 'This deadline is 24 hours before the scheduled start.',
    },
  },

  // ---------------------------------------------------------------------------
  // New booking form
  // ---------------------------------------------------------------------------
  bookingForm: {
    schema: {
      resourceTypeRequired: 'Select a resource type',
      resourceIdRequired: 'Select a resource',
      bookingTypeRequired: 'Select a booking type',
      startTimeRequired: 'Start time is required',
      endTimeRequired: 'End time is required',
      equipmentRequestTypeRequired: 'Select equipment request type',
      roomParticipantCountRequired: 'Participant count is required',
      firmPurposeRequired: 'Purpose is required for firm bookings.',
    },
    docErrors: {
      invalidType: 'Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.',
      tooLarge: 'File size exceeds 5MB limit.',
      requiredForFirm: 'Authorization document is required for firm bookings.',
    },
    apiFallbacks: {
      pencilOverlapChanged:
        'Overlapping pencil bookings changed. Please check the calendar and try again.',
      genericConflict: 'Booking conflicts with existing bookings.',
      genericCreateFailed: 'Failed to create booking. Please try again.',
    },
    convertFirmDefaultSuccess:
      'Booking converted to firm successfully. Awaiting staff approval.',

    nav: {
      backToCalendar: () => <>Back to Calendar</>,
    },

    success: {
      bookingIdLabel: () => <>Booking ID:</>,
      statusLabel: () => <>Status:</>,
      typeLabel: () => <>Type:</>,
      contentionBody: () => (
        <>
          You are challenging an existing pencil booking. A contention timer is running — the current holder
          must convert to a firm booking before the deadline, or you will take the slot.
        </>
      ),
      contentionConflictsHeading: () => <>Overlapping booking you are contesting:</>,
      firmBlockingIntro: () => (
        <>This firm booking is currently &quot;blocking&quot; the pencils listed below.</>
      ),
      firmBlockingIfApprovedLine: () => (
        <>
          <strong>If Approved:</strong> Overlapping pencil bookings are displaced but notified they can rebook
          if you cancel.
        </>
      ),
      firmBlockingIfDeniedLine: () => (
        <>
          <strong>If Denied/Cancelled:</strong> These pencils will immediately resume their original schedule.
        </>
      ),
      overlappingPencilsHeading: () => <>Overlapping pencils:</>,
      backToMyBookings: () => <>Back to my bookings</>,
      viewCalendar: () => <>View Calendar</>,
      createAnother: () => <>Create Another Booking</>,
    },

    confirmOwnPencilOverlap: {
      title: () => (
        <>This firm booking overlaps with your existing pencil booking(s).</>
      ),
      subtitle: () => (
        <>
          Creating this firm booking will automatically cancel the following pencil booking(s):
        </>
      ),
    pencilCardTitle: ({ id }) => <>Pencil Booking {bookingLabel(id)}</>,
      confirmLoading: 'Creating...',
      confirm: 'Confirm & Cancel Pencil Booking(s)',
      goBack: 'Go Back',
    },
    confirmForeignPencilOverlap: {
      title: () => (
        <>This firm booking overlaps with another user&apos;s pencil booking(s).</>
      ),
      subtitle: () => (
        <>
          By confirming, overlapping pencil bookings will be placed <strong>on hold</strong>. 
    If staff <strong>approves</strong> your request, they will be displaced; however, 
    if your request is <strong>denied</strong> or <strong>cancelled</strong>, those bookings will automatically resume 
    their active status.
        </>
      ),
    pencilCardTitle: ({ id }) => <>Pencil Booking {bookingLabel(id)}</>,
      confirmLoading: 'Submitting...',
      confirm: 'Confirm & Submit Firm Request',
      goBack: 'Go Back',
    },

    confirmContention: {
      title: () => (
        <>This pencil booking would contest an existing pencil on the same resource.</>
      ),
      subtitle: () => (
        <>
          Contention is resolved automatically: the holder must convert to a firm booking before the deadline,
          or you receive the slot. The deadline is set to the earliest of: <strong>24 hours from now</strong>,
          <strong> 24 hours before the schedule start</strong>, or <strong>the current holder&apos;s pencil expiry time</strong>.
        </>
      ),
      deadlineLine: ({ formattedDeadline }) => (
        <>
          If you confirm, the contention timer will resolve by: <strong>{formattedDeadline}</strong>.
        </>
      ),
    conflictCardTitle: ({ id }) => <>Booking {bookingLabel(id)}</>,
      confirmLoading: 'Creating...',
      confirm: 'Confirm & start contention',
      goBack: 'Go Back',
    },
    activeContentionUnavailable: {
      title: () => <>Slot Unavailable (Active Contention)</>,
      body: () => (
        <>
          This time slot is currently being contested by two other users. Our system only allows one
          challenger per slot at a time.
        </>
      ),
      recommendation: ({ formattedDeadline }) => (
        <>
          Recommendation: Please choose a different time window or check back after the deadline (
          <strong>{formattedDeadline}</strong>) to see if the slot becomes available (not guaranteed).
        </>
      ),
      deadlineUnknown: 'the current contention deadline',
    },

    formCard: {
      title: () => <>Create New Booking</>,
      subtitle: () => (
        <>Reserve equipment or a room at the Plant Tissue Culture Facility</>
      ),
      conflictingBookingsHeading: () => <>Conflicting bookings:</>,
      conflictLine: ({ id, resourceName, typeLabel, statusLabel, range }) => (
        <>
          {bookingLabel(id)} {resourceName} — {typeLabel} ({statusLabel}) — {range}
        </>
      ),
    },

    labels: {
      bookingType: { firm: 'Firm', pencil: 'Pencil' },
    },

    fields: {
      resourceFallback: 'Resource',
      resourceNumber: (id) => `Resource #${id}`,
      resourceType: () => <>Resource Type</>,
      resourceTypePlaceholder: 'Select resource type',
      equipment: () => <>Equipment</>,
      room: () => <>Room</>,
      selectRoomFirst: 'Select resource type first',
      selectRoom: 'Select a room',
      selectEquipment: 'Select equipment',
      bookingType: () => <>Booking Type</>,
      equipmentRequestType: () => <>Equipment Request Type</>,
      equipmentRequestTypePlaceholder: 'Select equipment request type',
      inHouse: () => <>In-house use</>,
      loan: () => <>Loan</>,
      pencilTitle: () => <>Pencil</>,
      pencilBlurb: () => (
        <>
          Tentative reservation. Expires in 3 days if not converted to firm.
        </>
      ),
      firmTitle: () => <>Firm</>,
      firmBlurb: () => (
        <>
          Confirmed reservation. Cannot overlap other firms; may overlap pencils (displaced if approved).
          Pending staff approval after submission.
        </>
      ),
      firmOverlapCallout: () => (
        <>
          Firm bookings cannot overlap other firm bookings. They can overlap pencil bookings; what happens
          depends on whose pencil it is.
        </>
      ),
      firmOverlapShowDetails: () => <>Show details</>,
      firmOverlapHideDetails: () => <>Hide details</>,
      firmOverlapSectionTitle: () => <>If overlapping pencils</>,
      firmOverlapOwnPencilsDt: () => <>Your own pencils</>,
      firmOverlapOwnPencilsDd: () => (
        <>Overlapping pencils are cancelled when your firm booking is submitted.</>
      ),
      firmOverlapOtherPencilsDt: () => <>Other users&apos; pencils</>,
      firmOverlapOtherPencilsDd: () => (
        <>
          Their pencils remain but on hold. Once staff approves your request, those pencils will be displaced.
          If you cancel, displaced users are notified immediately, in which they can rebook.
        </>
      ),
      startTime: () => <>Start Time</>,
      startTimeWindowHelp: () => <>Lead-time requirements vary by booking type.</>,
      endTime: () => <>End Time</>,
      purposeOptional: () => <>Purpose (optional)</>,
      purposePlaceholder: 'Describe the purpose of your booking...',
      loanReason: () => <>Loan reason</>,
      loanReasonPlaceholder: 'Why does the equipment need to be transported?',
      loanWorkflowNote: () => <>Workflow or schematic note</>,
      loanWorkflowNotePlaceholder: 'Describe the workflow/schematic context for this loan request...',
      loanTransportPlan: () => <>Transport plan</>,
      loanTransportPlanPlaceholder: 'How will the equipment be transported safely?',
      roomParticipantCount: () => <>Expected participants</>,
      roomEquipmentNeeds: () => <>Event equipment needs</>,
      roomEquipmentNeedsPlaceholder: 'Microphone, LCD, speakers, or other needs...',
      roomSetupRequirements: () => <>Setup and catering requirements</>,
      roomSetupRequirementsPlaceholder: 'Setup arrangement, catering, and additional setup notes...',
      roomProgramDetails: () => <>Program or event details</>,
      roomProgramDetailsPlaceholder: 'Provide brief event description or program details...',
      authLabelFirm: () => <>Authorization Document</>,
      authLabelOptional: () => <>Authorization Document (optional)</>,
      authHelpFirm: () => (
        <>
          Upload an authorization letter or supporting document for your firm booking.
        </>
      ),
      authHelpPencil: () => (
        <>
          You may attach an authorization document now, or upload it later when converting to a firm booking.
        </>
      ),
      authRebookNote: () => <>Using authorization document from previous attempt.</>,
      replaceFile: () => <>Replace File</>,
      dropzoneTypes: () => <>PDF, DOC, DOCX, JPG, or PNG (max 5MB)</>,
      chooseFile: () => <>Choose File</>,
      rebookLockResourceType: () => (
        <>Locked for rebook: keep the original resource type.</>
      ),
      rebookLockResource: () => <>Locked for rebook: keep the original resource.</>,
    },

    submit: {
      cancel: () => <>Cancel</>,
      creating: () => <>Creating Booking...</>,
      create: () => <>Create Booking</>,
    },
  },

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------
  calendar: {
    fetchAvailabilityFailed: 'Failed to fetch availability',
    errorLoading: ({ message }) => (
      <>
        Error loading calendar: {message}
      </>
    ),
    aggregateMonthTitle: ({ timeRange, resourceName, contestedCount, challengerCount }) =>
      `${timeRange} [${resourceName}] • Contention (${contestedCount}/${challengerCount})`,
    legend: {
      approved: () => <>Approved</>,
      pendingApproval: () => <>Pending Approval</>,
      penciled: () => <>Penciled</>,
      onHold: () => <>On Hold</>,
      contentionGroup: () => <>Contention group</>,
    },
    agendaScope: {
      label: () => <>Agenda filters</>,
      options: {
        firms: () => <>Firms</>,
        activePencils: () => <>Active Pencils</>,
        secondaryBackup: () => <>Secondary/Backup</>,
      },
    },
    flyout: {
      ariaDialog: 'Contention overlaps',
      activeOverlaps: () => <>Active overlaps</>,
      overlapDetailsWithResource: ({ name }) => <>{name} · overlap details</>,
      overlapDetailsFallback: () => <>Overlap details</>,
      close: () => <>Close</>,
    },
    event: {
      expandOverlapAria: 'Show or hide overlapping contention bookings details',
      expandOverlapTitle: 'Show or hide overlap details',
    },
    roleLabel: {
      defenderContested: 'Defender (contested)',
      challenger: 'Challenger',
      penciled: 'Penciled',
    },
    hover: {
      contentionGroupHeadline: (resourceName) => `${resourceName} - contention group`,
      partContested: (n) => `${n} contested`,
      partChallenger: (n) => `${n} challenger`,
      partPenciled: (n) => `${n} penciled`,
      activeOverlaps: (total, inner) => `Active overlaps: ${total} (${inner})`,
      hintStack: 'Click the stack icon to show or hide overlap details.',
      statusContestingChallenger: 'contesting (challenger)',
      headlineWithKind: (idPrefix, name, kind, status) =>
        `${idPrefix}${name} - ${kind} (${status})`,
    },
  },
};

export default bookingMessages;
