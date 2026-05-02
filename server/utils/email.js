const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@ptcf.uplb.edu.ph';
const FROM_NAME = 'PTCF Reservation';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Send a transactional email via Resend.
 * Failures are logged but do not throw — callers should not fail on email errors.
 */
async function sendEmail({ to, subject, html, text, throwOnError = false }) {
  if (!resend) {
    const message = `[email] RESEND_API_KEY not set — skipping email to: ${to}`;
    console.warn(message);
    if (throwOnError) throw new Error(message);
    return false;
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
      if (throwOnError) throw new Error(error.message || 'Resend rejected email');
      return false;
    }

    console.log(`[email] Email sent to ${to} — "${subject}"`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
    if (throwOnError) throw err;
    return false;
  }
}

module.exports = { sendEmail };
