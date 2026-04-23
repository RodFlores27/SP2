const { sendEmail } = require('./email');

const APP_NAME = 'PTCF Reservation System';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ptcf.vercel.app';

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

function baseEmailWrapper(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; background: #f9fafb; padding: 24px; color: #111;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="margin-top: 0; color: #1e3a5f;">${APP_NAME}</h2>
    <h3 style="color: #374151;">${title}</h3>
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 12px; color: #9ca3af;">
      This is an automated message from the PTCF Reservation System. Please do not reply to this email.
    </p>
  </div>
</body>
</html>`;
}

function bookingDetailsBlock(booking, resourceName) {
  return `
<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
  <tr><td style="padding: 6px 0; color: #6b7280; width: 140px;">Booking ID</td><td style="padding: 6px 0; font-weight: 600;">#${booking.id}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">Resource</td><td style="padding: 6px 0;">${resourceName} <span style="color:#9ca3af;">(${booking.resourceType})</span></td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">Booking Type</td><td style="padding: 6px 0;">${formatBookingType(booking.bookingType)}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">Start</td><td style="padding: 6px 0;">${formatDateTime(booking.startTime)}</td></tr>
  <tr><td style="padding: 6px 0; color: #6b7280;">End</td><td style="padding: 6px 0;">${formatDateTime(booking.endTime)}</td></tr>
  ${booking.purpose ? `<tr><td style="padding: 6px 0; color: #6b7280;">Purpose</td><td style="padding: 6px 0;">${booking.purpose}</td></tr>` : ''}
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
  const isQueued = booking.contentionRole === 'queued';

  let statusNote = '';
  if (isQueued) {
    statusNote = `<p style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:12px;font-size:14px;color:#5b21b6;">
      ⏳ Your pencil booking is <strong>queued</strong> behind an earlier contention on this resource. You will be notified when your turn starts.
    </p>`;
  } else if (isDefender) {
    statusNote = `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:12px;font-size:14px;color:#92400e;">
      ⚠️ Your pencil booking is being <strong>challenged</strong>. Another user is challenging your slot. Convert to a firm booking before the contention deadline to keep the reservation.
    </p>`;
  } else if (isPencil) {
    statusNote = `<p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;font-size:14px;color:#1e40af;">
      ℹ️ Your pencil booking is <strong>tentative</strong>. It expires at the earlier of 3 days from creation or 24 hours before the scheduled start unless converted to a firm booking.
    </p>`;
  } else {
    statusNote = `<p style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:12px;font-size:14px;color:#78350f;">
      ⏳ Your firm booking has been submitted and is <strong>pending staff approval</strong>.
      Staff must approve it <strong>at least 24 hours before</strong> the scheduled start. If it is still pending inside that window, it will expire automatically.
    </p>`;
  }

  const html = baseEmailWrapper(
    'Booking Submitted',
    `<p>Your booking has been received. Here are the details:</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${statusNote}
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">View your bookings →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Submitted`,
    html,
  });
}

/**
 * booking.approved — sent to the booking owner after staff approves.
 */
async function notifyBookingApproved(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const html = baseEmailWrapper(
    'Booking Approved',
    `<p>Great news! Your booking has been <strong style="color:#16a34a;">approved</strong> by PTCF staff.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.staffRemark ? `<p><strong>Staff remark:</strong> ${booking.staffRemark}</p>` : ''}
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">View your bookings →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Approved`,
    html,
  });
}

/**
 * booking.denied — sent to the booking owner after staff denies.
 */
async function notifyBookingDenied(booking, resourceName) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const html = baseEmailWrapper(
    'Booking Denied',
    `<p>Unfortunately, your booking has been <strong style="color:#dc2626;">denied</strong> by PTCF staff.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${booking.staffRemark ? `<p><strong>Reason:</strong> ${booking.staffRemark}</p>` : ''}
    <p>If you have questions, please contact the PTCF facility directly.</p>
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">Create a new booking →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Denied`,
    html,
  });
}

/**
 * booking.cancelled — sent to the booking owner after cancellation.
 */
async function notifyBookingCancelled(booking, resourceName, cancelledBy) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const byStaff = cancelledBy && cancelledBy !== booking.userId;
  const note = byStaff
    ? `<p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
        ℹ️ This booking was cancelled by a staff member.
      </p>`
    : '';

  const html = baseEmailWrapper(
    'Booking Cancelled',
    `<p>Your booking has been <strong>cancelled</strong>.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    ${note}
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">Create a new booking →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Cancelled`,
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
  const title = isFirm ? 'Firm Request Expired' : 'Pencil Booking Expired';
  const body = isFirm
    ? `<p>Your <strong>firm</strong> booking request has <strong style="color:#dc2626;">expired</strong> because staff did not approve it at least <strong>24 hours before</strong> the scheduled start.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
      Submit a new request with enough lead time for staff review if you still need the slot.
    </p>`
    : `<p>Your pencil booking has <strong style="color:#dc2626;">expired</strong> because it was not converted to a firm booking in time.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:14px;color:#991b1b;">
      Pencil bookings must be converted to firm bookings within 3 days of creation (and before other pencil expiry rules). This booking has been automatically expired.
    </p>`;

  const html = baseEmailWrapper(title, `${body}
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">Create a new booking →</a></p>`);

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Expired`,
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

  const urgency = hoursLeft <= 24 ? 'high' : 'medium';
  const bannerStyle = urgency === 'high'
    ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'
    : 'background:#fff7ed;border:1px solid #fed7aa;color:#92400e;';

  const html = baseEmailWrapper(
    `Pencil Booking Expiring in ${hoursLeft} Hours`,
    `<p>Your pencil booking is expiring in <strong>${hoursLeft} hours</strong>. Convert it to a firm booking to keep your reservation.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p style="${bannerStyle}border-radius:6px;padding:12px;font-size:14px;">
      To secure this booking, upload your authorization document and convert it to a firm booking before it expires.
    </p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;font-weight:600;">Convert to Firm Booking →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} Expires in ${hoursLeft}h — Action Required`,
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

  const defenderHtml = baseEmailWrapper(
    'Your pencil booking is being challenged',
    `<p>Another user has placed an overlapping pencil booking for the same resource. A contention timer is running.</p>
    ${bookingDetailsBlock(defender, resourceName)}
    <p><strong>Resolve by:</strong> ${deadlineStr} (Asia/Manila)</p>
    <p>To keep this slot, convert your booking to a <strong>firm</strong> booking and upload your authorization document before the deadline.</p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">Open your dashboard →</a></p>`
  );

  const challengerHtml = baseEmailWrapper(
    'You started a pencil contention',
    `<p>Your overlapping pencil booking is now challenging the current holder. If they do not convert to firm in time, you will take the slot.</p>
    ${bookingDetailsBlock(challenger, resourceName)}
    <p><strong>Contention resolves by:</strong> ${deadlineStr} (Asia/Manila)</p>
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">View your booking →</a></p>`
  );

  await sendEmail({
    to: defender.user.email,
    subject: `[PTCF] Booking #${defender.id} — being challenged`,
    html: defenderHtml
  });
  await sendEmail({
    to: challenger.user.email,
    subject: `[PTCF] Booking #${challenger.id} — contention started`,
    html: challengerHtml
  });
}

/**
 * User is FIFO-queued behind an active contention.
 */
async function notifyBookingQueuedForContention(booking, resourceName, position) {
  const recipientEmail = booking.user?.email;
  if (!recipientEmail) return;

  const html = baseEmailWrapper(
    'You are in a contention queue',
    `<p>Your pencil booking is <strong>queued</strong> (position <strong>${position}</strong>) until earlier challenges on this resource finish.</p>
    ${bookingDetailsBlock(booking, resourceName)}
    <p><a href="${FRONTEND_URL}/dashboard" style="color:#2563eb;">View your booking →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Booking #${booking.id} — queued for contention`,
    html
  });
}

/**
 * An approved firm booking was cancelled — notify users whose pencils were displaced by that firm.
 */
async function notifyDisplacedUsersSlotReopened(displacedBooking, firmBooking, resourceName) {
  const recipientEmail = displacedBooking.user?.email;
  if (!recipientEmail) return;

  const html = baseEmailWrapper(
    'Time slot may be available again',
    `<p>A firm booking that previously displaced your pencil booking has been <strong>cancelled</strong>. The time window may be open again on a first-come, first-served basis.</p>
    <p><strong>Your displaced pencil booking</strong> (for reference):</p>
    ${bookingDetailsBlock(displacedBooking, resourceName)}
    <p><strong>Firm booking cancelled:</strong> #${firmBooking.id}</p>
    <p><a href="${FRONTEND_URL}/bookings/new" style="color:#2563eb;">Try booking again →</a></p>`
  );

  await sendEmail({
    to: recipientEmail,
    subject: `[PTCF] Slot notice — firm booking #${firmBooking.id} cancelled`,
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
  notifyBookingQueuedForContention,
  notifyDisplacedUsersSlotReopened,
};
