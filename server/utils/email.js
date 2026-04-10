const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@ptcf.uplb.edu.ph';
const FROM_NAME = 'PTCF Reservation System';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Send a transactional email via Resend.
 * Failures are logged but do not throw — callers should not fail on email errors.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to:', to);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });

    if (error) {
      console.error('[email] Resend rejected email:', error);
      return;
    }

    console.log(`[email] Email sent to ${to} — "${subject}"`);
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
  }
}

module.exports = { sendEmail };
