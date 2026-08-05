# Release Hardening Checklist (Step 4)

Use this before demo/release deployments.

## 1) Runtime configuration
- Ensure backend startup logs contain no `[runtime] Config error`.
- Resolve any `[runtime] Warning` unless intentionally accepted.
- Confirm Kafka startup logs show producer and notification consumer connected (or explicitly accepted degraded mode).
- Confirm latest DB migrations are applied, including `NotificationDeliveries`.

## 2) Required environment groups
- Auth: `AUTH_PROVIDER`, Supabase keys/URLs (if using Supabase auth).
- Database: `DATABASE_URL` or complete `DB_*` values.
- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- Uploads: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Frontend links in emails: `FRONTEND_URL` (or `CLIENT_URL` fallback).

## 3) Operational rules sanity
- Equipment create requires `equipmentRequestType` (`in_house`/`loan`).
- Lead-time rules enforced:
  - equipment in-house: 2 days
  - equipment loan: 7 days
  - room: 7 days
- Cancel cutoff rules enforced:
  - equipment in-house: 2 hours
  - equipment loan: 24 hours
  - room: 24 hours
- Deny action requires non-empty staff remark.

## 4) Notification sanity
- Approve room booking sends approval email including payment/damage notice.
- Cancel booking requires reason + probable rebook date and includes them in notification.
- Duplicate/replay sanity: same Kafka `eventId` should not send duplicate email to the same recipient+notification type.
- Failure/retry sanity: if provider send fails transiently, notification consumer should fail fast and retry via Kafka; verify eventual `NotificationDeliveries.status=sent`.

## 5) Data/reset sanity
- Run migrations before seed/reset.
- If using demo reset, run `reset:mvp-demo` and verify seeded room/equipment codes follow current format.
