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

const EMAIL_THEME = {
  maroon: '#8A1538',
  forest: '#00573F',
  gold: '#FFB81C',
  spotBlack: '#231F20',
  parchment: '#F8F5EF',
  card: '#FFFFFF',
  border: '#E5D8C7',
  muted: '#6F6466',
  detailSurface: '#FBFAF7',
  softGold: '#FFF2CC',
  softGreen: '#E6F0EC',
  softMaroon: '#F6E8ED',
};

const LINK_STYLE = `color:${EMAIL_THEME.maroon};font-weight:600;text-decoration:underline;text-decoration-color:${EMAIL_THEME.gold};text-underline-offset:3px;`;

function calloutStyle(tone = 'gold') {
  const tones = {
    gold: `background:${EMAIL_THEME.softGold};border:1px solid ${EMAIL_THEME.gold};color:${EMAIL_THEME.spotBlack};`,
    green: `background:${EMAIL_THEME.softGreen};border:1px solid #B8D2C8;color:${EMAIL_THEME.forest};`,
    maroon: `background:${EMAIL_THEME.softMaroon};border:1px solid #D7A7B7;color:${EMAIL_THEME.maroon};`,
  };

  return `${tones[tone] || tones.gold}border-radius:8px;padding:12px;font-size:14px;line-height:1.5;`;
}

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
<body style="margin:0;font-family:Avenir,'Avenir Next',Helvetica,Arial,sans-serif;background:${EMAIL_THEME.parchment};padding:24px;color:${EMAIL_THEME.spotBlack};">
  <div style="max-width:600px;margin:0 auto;background:${EMAIL_THEME.card};border-radius:14px;border:1px solid ${EMAIL_THEME.border};overflow:hidden;box-shadow:0 10px 30px rgba(35,31,32,0.08);">
    <div style="height:6px;background:${EMAIL_THEME.maroon};"></div>
    <div style="height:3px;background:${EMAIL_THEME.gold};"></div>
    <div style="padding:28px 32px 32px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_THEME.forest};">Plant Tissue Culture Facility</p>
    <h2 style="margin:0;color:${EMAIL_THEME.maroon};font-family:Optima,Candara,'Noto Sans',Arial,sans-serif;font-size:24px;line-height:1.2;">${E.appName}</h2>
    <h3 style="margin:20px 0 12px;color:${EMAIL_THEME.spotBlack};font-size:18px;line-height:1.35;">${title}</h3>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid ${EMAIL_THEME.border};margin:24px 0;" />
    <p style="font-size:12px;line-height:1.5;color:${EMAIL_THEME.muted};">
      ${E.automatedFooter}
    </p>
    </div>
  </div>
</body>
</html>`;
}

function bookingDetailsBlock(booking, resourceName) {
  const L = E.bookingDetailsLabels;
  const labelStyle = `padding:8px 0;color:${EMAIL_THEME.muted};width:140px;`;
  const valueStyle = `padding:8px 0;color:${EMAIL_THEME.spotBlack};`;

  return `
<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:14px;margin:18px 0;background:${EMAIL_THEME.detailSurface};border:1px solid ${EMAIL_THEME.border};border-radius:10px;padding:10px 14px;">
  <tr><td style="${labelStyle}">${L.bookingId}</td><td style="${valueStyle}font-weight:700;color:${EMAIL_THEME.maroon};">${getBookingReference(booking)}</td></tr>
  <tr><td style="${labelStyle}">${L.resource}</td><td style="${valueStyle}">${resourceName} <span style="color:${EMAIL_THEME.muted};">(${booking.resourceType})</span></td></tr>
  <tr><td style="${labelStyle}">${L.bookingType}</td><td style="${valueStyle}">${formatBookingType(booking.bookingType)}</td></tr>
  <tr><td style="${labelStyle}">${L.start}</td><td style="${valueStyle}">${formatDateTime(booking.startTime)}</td></tr>
  <tr><td style="${labelStyle}">${L.end}</td><td style="${valueStyle}">${formatDateTime(booking.endTime)}</td></tr>
  ${booking.purpose ? `<tr><td style="${labelStyle}">${L.purpose}</td><td style="${valueStyle}">${booking.purpose}</td></tr>` : ''}
</table>`;
}

function contentionResolutionReasonText(resolutionReason, recipientRole) {
  const isRecipientActor = recipientRole === 'defender';

  switch (resolutionReason) {
    case 'defender_cancelled':
      return isRecipientActor
        ? 'You cancelled your booking, so the contention ended.'
        : 'The other booking holder cancelled their booking.';
    case 'challenger_cancelled':
      return recipientRole === 'challenger'
        ? 'You cancelled your booking, so the contention ended.'
        : 'The other booking holder cancelled their booking.';
    case 'defender_missed_deadline':
      return recipientRole === 'defender'
        ? 'You did not convert your booking to a firm request before the contention deadline.'
        : 'The other booking holder did not convert to a firm request before the contention deadline.';
    case 'challenger_expired':
      return recipientRole === 'challenger'
        ? 'Your booking expired during the contention episode.'
        : 'The other booking holder’s booking expired during the contention episode.';
    case 'defender_expired_boundary':
      return recipientRole === 'defender'
        ? 'Your booking reached its expiry boundary before it was converted to a firm request.'
        : 'The other booking holder’s booking reached its expiry boundary before it was converted to a firm request.';
    case 'defender_converted_to_firm':
      return recipientRole === 'defender'
        ? 'You converted your booking to a firm request before the contention deadline.'
        : 'The other booking holder converted their booking to a firm request before the contention deadline.';
    default:
      return 'The contention episode reached its resolution.';
  }
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
    statusNote = `<p style="${calloutStyle('maroon')}">
      ${C.defenderNote}
    </p>`;
  } else if (isChallenger) {
    statusNote = `<p style="${calloutStyle('green')}">
      ${C.challengerNote}
    </p>`;
  } else if (isPencil) {
    statusNote = `<p style="${calloutStyle('gold')}">
      ${C.pencilTentativeNote}
    </p>`;
  } else {
    statusNote = `<p style="${calloutStyle('gold')}">
      ${C.firmPendingNote}
    </p>`;
  }

  const html = baseEmailWrapper(
    C.title,
    `<p>${C.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${statusNote}
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${C.viewDashboard}</a></p>`
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
  const roomPaymentBlock =
    booking.resourceType === 'room'
      ? `<p style="${calloutStyle('gold')}"><strong>${A.roomPaymentTitle}</strong><br/>${A.roomPaymentBody}</p>`
      : '';
  const html = baseEmailWrapper(
    A.title,
    `<p>${A.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.staffRemark ? `<p><strong>${A.staffRemarkLabel}</strong> ${booking.staffRemark}</p>` : ''}
    ${roomPaymentBlock}
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${A.viewDashboard}</a></p>`
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
    <p><a href="${FRONTEND_URL}/bookings/new" style="${LINK_STYLE}">${D.createNew}</a></p>`
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
    ? `<p style="${calloutStyle('maroon')}">
        ${X.staffCancelledNote}
      </p>`
    : '';

  const html = baseEmailWrapper(
    X.title,
    `<p>${X.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.cancellationReason ? `<p><strong>${X.reasonLabel}</strong> ${booking.cancellationReason}</p>` : ''}
    ${booking.probableRebookDate ? `<p><strong>${X.probableRebookDateLabel}</strong> ${formatDateTime(booking.probableRebookDate)}</p>` : ''}
    ${note}
    <p><a href="${FRONTEND_URL}/bookings/new" style="${LINK_STYLE}">${X.createNew}</a></p>`
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
    <p style="${calloutStyle('maroon')}">
      ${X.firmCallout}
    </p>`
    : `<p>${X.pencilBody}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${calloutStyle('maroon')}">
      ${X.pencilCallout}
    </p>`;

  const html = baseEmailWrapper(title, `${body}
    <p><a href="${FRONTEND_URL}/bookings/new" style="${LINK_STYLE}">${X.createNew}</a></p>`);

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
  const bannerStyle = urgency === 'high' ? calloutStyle('maroon') : calloutStyle('gold');

  const html = baseEmailWrapper(
    S.title({ hours: hoursLeft }),
    `<p>${S.body({ hours: hoursLeft })}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${bannerStyle}">
      ${S.callout}
    </p>
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${S.convertCta}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: S.subject({ bookingLabel: getBookingReference(booking), hours: hoursLeft }),
    html,
  });
}

/**
 * booking.on_hold — sent when a pencil is newly parked behind a firm blocker.
 */
async function notifyBookingOnHold(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const H = E.onHold;
  const html = baseEmailWrapper(
    H.title,
    `<p>${H.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${calloutStyle('gold')}">
      ${H.callout}
    </p>
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${H.viewDashboard}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: H.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.displaced — sent when a pencil loses the slot.
 */
async function notifyBookingDisplaced(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const D = E.displaced;
  const html = baseEmailWrapper(
    D.title,
    `<p>${D.body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${calloutStyle('maroon')}">
      ${D.callout}
    </p>
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${D.viewDashboard}</a></p>
    <p><a href="${FRONTEND_URL}/bookings/new" style="${LINK_STYLE}">${D.createNew}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: D.subject({ bookingLabel: getBookingReference(booking) }),
    html,
  });
}

/**
 * booking.contention_resolved — sent to each participant when a 1v1 episode ends.
 */
async function notifyContentionResolved(booking, counterpartyBooking, resourceName, payload = {}) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const outcome = payload.recipientOutcome || 'active';
  const recipientRole = payload.recipientContentionRole || null;
  const R = E.contentionResolved;

  let title = R.activeTitle;
  let body = R.activeBody;
  let callout = R.activeCallout;
  let ctaHref = `${FRONTEND_URL}/dashboard`;
  let ctaLabel = R.viewDashboard;
  let calloutTone = 'gold';

  if (outcome === 'on_hold') {
    title = R.onHoldTitle;
    body = R.onHoldBody;
    callout = R.onHoldCallout;
  } else if (outcome === 'displaced') {
    title = R.displacedTitle;
    body = R.displacedBody;
    callout = R.displacedCallout;
    ctaHref = `${FRONTEND_URL}/bookings/new`;
    ctaLabel = R.createNew;
    calloutTone = 'maroon';
  } else if (outcome === 'cancelled') {
    title = R.cancelledTitle;
    body = R.cancelledBody;
    callout = R.cancelledCallout;
    ctaHref = `${FRONTEND_URL}/bookings/new`;
    ctaLabel = R.createNew;
    calloutTone = 'maroon';
  } else if (outcome === 'expired') {
    title = R.expiredTitle;
    body = R.expiredBody;
    callout = R.expiredCallout;
    ctaHref = `${FRONTEND_URL}/bookings/new`;
    ctaLabel = R.createNew;
    calloutTone = 'maroon';
  } else if (booking.bookingType === 'firm' && booking.status === 'pending_approval') {
    title = R.firmPendingTitle;
    body = R.firmPendingBody;
    callout = R.firmPendingCallout;
  } else if (outcome === 'active' && booking.bookingType === 'pencil') {
    ctaHref = `${FRONTEND_URL}/dashboard`;
    ctaLabel = R.convertCta;
  }

  const reasonText = contentionResolutionReasonText(payload.resolutionReason, recipientRole);
  const counterpartyBlock = counterpartyBooking
    ? `<p><strong>Other booking in this contention:</strong> ${getBookingReference(counterpartyBooking)}</p>`
    : '';

  const html = baseEmailWrapper(
    title,
    `<p>${body}</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${counterpartyBlock}
    <p><strong>${R.reasonLabel}</strong> ${reasonText}</p>
    <p style="${calloutStyle(calloutTone)}">
      ${callout}
    </p>
    <p><a href="${ctaHref}" style="${LINK_STYLE}">${ctaLabel}</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: R.subject({ bookingLabel: getBookingReference(booking), outcome }),
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
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${C.defenderDashboard}</a></p>`
  );

  const challengerHtml = baseEmailWrapper(
    C.challengerTitle,
    `<p>${C.challengerBody}</p>
    ${bookingDetailsBlock(challenger, resourceName)}
    <p><strong>${C.challengerResolvesBy}</strong> ${deadlineStr} ${tz}</p>
    <p><a href="${FRONTEND_URL}/dashboard" style="${LINK_STYLE}">${C.challengerDashboard}</a></p>`
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
    <p><a href="${FRONTEND_URL}/bookings/new" style="${LINK_STYLE}">${R.tryAgain}</a></p>`
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
  notifyBookingOnHold,
  notifyBookingDisplaced,
  notifyContentionResolved,
  notifyContentionStarted,
  notifyDisplacedUsersSlotReopened,
};
