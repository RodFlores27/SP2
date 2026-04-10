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
  const isContested = booking.status === 'contested';

  let statusNote = '';
  if (isContested) {
    statusNote = `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:12px;font-size:14px;color:#92400e;">
      ⚠️ Your booking is currently <strong>contested</strong> because it overlaps with another booking for the same resource. A staff member will review and resolve the conflict.
    </p>`;
  } else if (isPencil) {
    statusNote = `<p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;font-size:14px;color:#1e40af;">
      ℹ️ Your pencil booking is <strong>tentative</strong>. It will expire in 3 days unless converted to a firm booking.
    </p>`;
  } else {
    statusNote = `<p style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:12px;font-size:14px;color:#78350f;">
      ⏳ Your firm booking has been submitted and is <strong>pending staff approval</strong>.
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

module.exports = {
  notifyBookingCreated,
  notifyBookingApproved,
  notifyBookingDenied,
  notifyBookingCancelled,
};
