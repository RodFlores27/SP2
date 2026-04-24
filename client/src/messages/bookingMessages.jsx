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
          listHeading: () => <>On-hold pencil bookings:</>,
        },
        pencilOnHold: {
          icon: Info,
          title: () => null,
          body: () => (
            <>
              This pencil is <strong>on hold</strong>; it is not treated like an active pencil while a firm
              booking blocks this time. If it no longer overlaps those firms, it can become a free pencil or
              enter contention again.
            </>
          ),
          overlappingFirmsListHeading: () => <>Overlapping firm bookings:</>,
        },
        challenger: {
          icon: Info,
          introInSingleParagraph: false,
          title: () => (
            <>
              <strong>Challenger</strong> can&apos;t convert to firm due to contention.
            </>
          ),
          body: () => (
            <>
              You are challenging another pencil holder for this slot. They must convert to firm before the
              contention deadline, or you receive the slot.
            </>
          ),
          challengingLine: ({ bookingId, timeRange, email }) => (
            <>
              You are challenging booking <strong>#{bookingId}</strong> — {timeRange}
              {email ? ` (${email}).` : '.'}
            </>
          ),
          deadlineLine: ({ formattedDeadline }) => (
            <>
              Contention deadline: <strong>{formattedDeadline}</strong>
            </>
          ),
          expandNote: () => (
            <>
              <strong>Convert to Firm</strong> stays disabled until this contention round finishes.
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
          whoChallengesHeading: () => <>Booking challenging you</>,
          challengerSummaryLine: ({ bookingId, timeRange }) => (
            <>
              Booking #{bookingId} — {timeRange}
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
              Booking #{id} ({statusLabel})
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
        convertPurposeLabel: () => <>Purpose (optional)</>,
        convertPurposePlaceholder: 'Describe the purpose of your booking...',
        convertConflictsHeading: () => <>Conflicting bookings:</>,
        convertConflictLine: ({ id, resourceName, typeLabel, statusLabel, range }) => (
          <>
            #{id} {resourceName} — {typeLabel} ({statusLabel}) — {range}
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
    },
    docErrors: {
      invalidType: 'Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.',
      tooLarge: 'File size exceeds 5MB limit.',
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
      pencilCardTitle: ({ id }) => <>Pencil Booking #{id}</>,
      confirmLoading: 'Creating...',
      confirm: 'Confirm & Cancel Pencil Booking(s)',
      goBack: 'Go Back',
    },

    confirmContention: {
      title: () => (
        <>This pencil booking would contest an existing pencil on the same resource.</>
      ),
      subtitle: () => (
        <>
          Contention is resolved automatically: the holder must convert to a firm booking before the deadline,
          or you receive the slot.
        </>
      ),
      conflictCardTitle: ({ id }) => <>Booking #{id}</>,
      confirmLoading: 'Creating...',
      confirm: 'Confirm & start contention',
      goBack: 'Go Back',
    },

    formCard: {
      title: () => <>Create New Booking</>,
      subtitle: () => (
        <>Reserve equipment or a room at the Plant Tissue Culture Facility</>
      ),
      conflictingBookingsHeading: () => <>Conflicting bookings:</>,
      conflictLine: ({ id, resourceName, typeLabel, statusLabel, range }) => (
        <>
          #{id} {resourceName} — {typeLabel} ({statusLabel}) — {range}
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
          Their pencils remain but inactive. Once staff approves your request, those pencils will be displaced.
          If you cancel, displaced users are notified immediately, in which they can rebook.
        </>
      ),
      startTime: () => <>Start Time</>,
      endTime: () => <>End Time</>,
      purposeOptional: () => <>Purpose (optional)</>,
      purposePlaceholder: 'Describe the purpose of your booking...',
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
      onHold: () => <>On Hold (firm overlap)</>,
      contentionGroup: () => <>Contention group</>,
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
