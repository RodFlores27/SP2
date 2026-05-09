# Email Testing Checklist

Use this checklist after deploying backend and frontend changes. All app-triggered emails should come from the configured Resend sender (`RESEND_FROM_EMAIL`).

## Before Testing

- Run latest backend migrations (includes `NotificationDeliveries` table for notification idempotency ledger).
- Confirm the backend has `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL`, `CLIENT_URL`, `SUPABASE_AUTH_REDIRECT_URL`, and `SUPABASE_PASSWORD_RESET_REDIRECT_URL`.
- Confirm the frontend has `VITE_API_URL` pointing to the production backend.
- Confirm Kafka is running and the notification consumer is connected when testing booking lifecycle emails.
- Confirm Supabase redirect URLs include:

```txt
https://your-frontend-domain.com/oauth/callback
https://your-frontend-domain.com/reset-password
https://your-frontend-domain.com/login?verified=1
```

## Auth Emails

- Register a fresh manual account.
  Expected email: `[PTCF] Confirm your account`.
  Expected click result: lands on `/login?verified=1` and shows "Your email has been verified. Please log in."

- Use "Resend verification email" after registration or after an unverified login attempt.
  Expected email: `[PTCF] Confirm your account`.
  Expected sender: Resend sender, not Supabase default sender.

- Use "Forgot your password?"
  Expected email: `[PTCF] Reset your password`.
  Expected click result: lands on `/reset-password` with a recovery token.

- Re-register a deleted manual account.
  Expected email: `[PTCF] Restore your account password` if the Supabase Auth user still exists.
  Expected click result: lands on `/reset-password` with a recovery token.

## Booking Emails

- Create a normal pencil booking.
  Expected event: `booking.created`.
  Expected email: booking submitted with pencil tentative note.

- Simulate or wait for the 48-hour pencil expiry warning.
  Expected event: `booking.expiring_soon` with `hoursLeft=48`.
  Expected email: pencil booking expiring in 48 hours.

- Simulate or wait for the 24-hour pencil expiry warning.
  Expected event: `booking.expiring_soon` with `hoursLeft=24`.
  Expected email: pencil booking expiring in 24 hours.

- Let a pencil booking auto-expire.
  Expected event: `booking.expired`.
  Expected email: pencil booking expired.

- Create a normal firm booking.
  Expected event: `booking.created`.
  Expected email: booking submitted with firm pending approval note.

- Have staff approve one firm booking.
  Expected event: `booking.approved`.
  Expected email: booking approved.

- Have staff deny one firm booking.
  Expected event: `booking.denied`.
  Expected email: booking denied.

- Cancel one booking as the owner.
  Expected event: `booking.cancelled`.
  Expected email: booking cancelled.

- Cancel one booking as staff.
  Expected event: `booking.cancelled`.
  Expected email: booking cancelled with staff-cancelled note.

- Create overlapping pencil bookings between two users to trigger contention.
  Expected event: `booking.contention_started`.
  Expected emails: one defender email and one challenger email.

- Trigger a defender-unwinnable contention (firm overlap safety path).
  Expected event: `booking.contention_resolved` with `resolutionReason=unwinnable_defender_firm_overlap`.
  Expected email: contention-ended email with explicit firm-overlap resolution reason text (not generic fallback).

- Let an approved firm displace a pencil, then cancel that firm.
  Expected event: `booking.displaced_slot_reopened`.
  Expected email: time slot may be available again.

- Let a firm request expire without approval.
  Expected event: `booking.expired`.
  Expected email: firm request expired.

## Troubleshooting

- If auth emails do not arrive, check Render logs for `[email]` messages and Resend delivery logs.
- If booking emails do not arrive, check Kafka consumer logs first, then Resend logs.
- Check `NotificationDeliveries` rows for the target `eventId` + recipient:
  - `status=sent` means delivery completed.
  - `status=failed` means send failed and should be retried by Kafka reprocessing.
  - duplicate/replayed events should not create a second `sent` row for the same `eventId + notificationType + recipientEmail`.
- If confirmation clicks go to `/equipment`, add `/login?verified=1` to Supabase allowed redirect URLs and redeploy the frontend fallback route.
- If emails show raw database booking IDs, confirm the backend with `referenceCode` email changes is deployed.
