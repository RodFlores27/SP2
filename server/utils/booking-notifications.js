const { sendEmail } = require('./email');
const { email: E } = require('../messages/bookingMessages');

function getFrontendUrl() {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.SUPABASE_AUTH_REDIRECT_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      return url.origin.replace(/\/$/, '');
    } catch {
      return String(raw).replace(/\/+$/, '');
    }
  }

  return 'http://localhost:5173';
}

const FRONTEND_URL = getFrontendUrl();

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBookingType(type) {
  return type === 'firm' ? 'Firm' : 'Pencil';
}

function getBookingReference(booking) {
  return booking?.referenceCode || (booking?.id != null ? `#${booking.id}` : 'n/a');
}

function baseEmailWrapper(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; background: #f9fafb; padding: 24px; color: #111;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="margin-top: 0; color: #1e3a5f;">${E.appName}</h2>
    <h3 style="color: #374151;">${title}</h3>
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 12px; color: #9ca3af;">
      ${E.automatedFooter}
    </p>
  </div>
</body>
</html>`;
}

function bookingDetailsBlock(booking, resourceName) {
  const L = E.bookingDetailsLabels;
  return `
<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
  <tr><td style="padding: 6px 0; color: #6b7280; width: 140px;">${L.bookingId}</td><td style="padding: 6px 0; font-weight: 600;">${getBookingReference(booking)}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">${L.resource}</td><td style="padding: 6px 0;">${resourceName} <span style="color:#9ca3af;">(${booking.resourceType})</span></td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">${L.bookingType}</td><td style="padding: 6px 0;">${formatBookingType(booking.bookingType)}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">${L.start}</td><td style="padding: 6px 0;">${formatDateTime(booking.startTime)}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">${L.end}</td><td style="padding: 6px 0;">${formatDateTime(booking.endTime)}</td></tr>
  ${booking.purpose ? `<tr><td style="padding: 6px 0; color: #6b7280;">${L.purpose}</td><td style="padding: 6px 0;">${booking.purpose}</td></tr>` : ''}
</table>`;
}

/**
 * booking.created — sent to the booking owner after a successful create.
 */
async function notifyBookingCreated(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const isPencil = booking.bookingType === 'pencil';
  const isDefender = booking.contentionRole === 'defender';
  const isChallenger = booking.contentionRole === 'challenger';
  const C = E.created;

  let statusNote = '';
  if (isDefender) {
    statusNote = `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:12px;font-size:14px;color:#92400e;">
      ${C.defenderNote}
    </p>`;
  } else if (isChallenger) {
    statusNote = `<p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;font-size:14px;color:#1e40af;">
      ${C.challengerNote}
    </p>`;
  } else if (isPencil) {
    statusNote = `<p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;font-size:14px;color:#1e40af;">
      ${C.pencilTentativeNote}
    </p>`;
  } else {
    statusNote = `<p style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:12px;font-size:14px;color:#78350f;">
      ${C.firmPendingNote}
    </p>`;
  }

  const html = baseEmailWrapper(
    C.title,
    `<p>${C.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${statusNote}
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">${C.viewDashboard}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: C.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.approved — sent to the booking owner after staff approves.
 */
async function notifyBookingApproved(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const A = E.approved;
  const html = baseEmailWrapper(
    A.title,
    `<p>${A.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.staffRemark ? `<p><strong>${A.staffRemarkLabel}</strong> ${booking.staffRemark}</p>` : ''}
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">${A.viewDashboard}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: A.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.denied — sent to the booking owner after staff denies.
 */
async function notifyBookingDenied(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const D = E.denied;
  const html = baseEmailWrapper(
    D.title,
    `<p>${D.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.staffRemark ? `<p><strong>${D.reasonLabel}</strong> ${booking.staffRemark}</p>` : ''}
    <p>${D.contactFacility}</p>
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">${D.createNew}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: D.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.cancelled — sent to the booking owner after cancellation.
 */
async function notifyBookingCancelled(booking, resourceName, cancelledBy) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const X = E.cancelled;
  const byStaff = cancelledBy && cancelledBy !== booking.userId;
  const note = byStaff
    ? `<p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
        ${X.staffCancelledNote}
      </p>`
    : '';

  const html = baseEmailWrapper(
    X.title,
    `<p>${X.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${note}
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">${X.createNew}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: X.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.expired — auto-expired pencil (lifetime) or firm pending (missed staff approval deadline).
 */
async function notifyBookingExpired(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const isFirm = booking.bookingType === 'firm';
  const X = E.expired;
  const title = isFirm ? X.firmTitle : X.pencilTitle;
  const body = isFirm
    ? `<p>${X.firmBody}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
      ${X.firmCallout}
    </p>`
    : `<p>${X.pencilBody}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
      ${X.pencilCallout}
    </p>`;

  const html = baseEmailWrapper(title, `${body}
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">${X.createNew}</a></p>`);

  await sendEmail({
    to: recipientEmail,
    subject: X.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.expiring_soon — sent as a warning before a pencil booking expires.
 * @param {number} hoursLeft - 48 or 24
 */
async function notifyBookingExpiringSoon(booking, resourceName, hoursLeft) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const S = E.expiringSoon;
  const urgency = hoursLeft <= 24 ? 'high' : 'medium';
  const bannerStyle = urgency === 'high'
    ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'
    : 'background:#fff7ed;border:1px solid #fed7aa;color:#92400e;';

  const html = baseEmailWrapper(
    S.title({ hours: hoursLeft }),
    `<p>${S.body({ hours: hoursLeft })}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${bannerStyle}border-radius:6px;padding:12px;font-size:14px;">
      ${S.callout}
    </p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;font-weight:600;">${S.convertCta}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: S.subject({ bookingLabel: getBookingReference(booking), hours: hoursLeft }),
    html,
  });
}

/**
 * Pencil contention started — notify defender and challenger.
 * @param {Object} params - { defender: Booking, challenger: Booking }
 */
async function notifyContentionStarted({ defender, challenger }, resourceName) {
  const deadlineStr = formatDateTime(defender.contentionDeadlineAt);
  if (!defender?.user?.email || !challenger?.user?.email) return;

  const C = E.contentionStarted;
  const tz = C.timezoneNote;

  const defenderHtml = baseEmailWrapper(
    C.defenderTitle,
    `<p>${C.defenderBody}</p>
    ${bookingDetailsBlock(defender, resourceName)}
    <p><strong>${C.defenderResolveBy}</strong> ${deadlineStr} ${tz}</p>
    <p>${C.defenderAction}</p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">${C.defenderDashboard}</a></p>`
  );

  const challengerHtml = baseEmailWrapper(
    C.challengerTitle,
    `<p>${C.challengerBody}</p>
    ${bookingDetailsBlock(challenger, resourceName)}
    <p><strong>${C.challengerResolvesBy}</strong> ${deadlineStr} ${tz}</p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">${C.challengerDashboard}</a></p>`
  );

  await sendEmail({
    to: defender.user.email,
    subject: C.defenderSubject({ bookingLabel: getBookingReference(defender) }),
    html: defenderHtml
  });
  await sendEmail({
    to: challenger.user.email,
    subject: C.challengerSubject({ bookingLabel: getBookingReference(challenger) }),
    html: challengerHtml
  });
}

/**
 * An approved firm booking was cancelled — notify users whose pencils were displaced by that firm.
 */
async function notifyDisplacedUsersSlotReopened(displacedBooking, firmBooking, resourceName) {
  const recipientEmail = displacedBooking.user?.email;
  if (!recipientEmail) return;

  const R = E.displacedSlotReopened;
  const html = baseEmailWrapper(
    R.title,
    `<p>${R.body}</p>
    <p><strong>${R.yourBookingLabel}</strong> (for reference):</p>
    ${bookingDetailsBlock(displacedBooking, resourceName)}
    <p><strong>${R.firmCancelledLabel}</strong> ${getBookingReference(firmBooking)}</p>
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">${R.tryAgain}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: R.subject({ firmBookingLabel: getBookingReference(firmBooking) }),
    html
  });
}

module.exports = {
  notifyBookingCreated,
  notifyBookingApproved,
  notifyBookingDenied,
  notifyBookingCancelled,
  notifyBookingExpired,
  notifyBookingExpiringSoon,
  notifyContentionStarted,
  notifyDisplacedUsersSlotReopened,
};
