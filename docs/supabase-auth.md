# Supabase Auth, Google OAuth, and Email Setup

This project can run in two auth modes:

- `AUTH_PROVIDER=legacy`: local password hashes and legacy JWT login.
- `AUTH_PROVIDER=supabase`: Supabase Auth owns passwords, sessions, refresh tokens, password reset, email verification, and OAuth identity.

In Supabase mode, the local `Users` table remains the app profile and role source of truth. `Users.supabaseAuthId` maps a Supabase Auth UUID to the local integer `Users.id` used by bookings, audit logs, and analytics.

Public self-registration only creates `regular_user` profiles. Staff and system admin roles must be assigned by an existing admin after the account exists.

## Local Environment

Backend values live in `server/.env`.

```env
AUTH_PROVIDER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PASSWORD_RESET_REDIRECT_URL=http://localhost:5173/reset-password
SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173

RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@mail.yourdomain.dev
```

Only the backend should use `SUPABASE_SERVICE_ROLE_KEY`. Never expose it in the React client.

After changing `.env`, restart the backend because environment variables are read on startup.

## Supabase Dashboard Setup

In Supabase, open the project referenced by `SUPABASE_URL`.

1. Go to **Authentication > URL Configuration**.
2. Set the site URL for local development:

```txt
http://localhost:5173
```

3. Add allowed redirect URLs:

```txt
http://localhost:5173/oauth/callback
http://localhost:5173/reset-password
```

4. For production, also add deployed frontend URLs:

```txt
https://your-production-domain.com/oauth/callback
https://your-production-domain.com/reset-password
```

5. Go to **Authentication > Sign In / Providers**.
6. Enable **Email** for password registration and reset.
7. Enable **Google** after completing the Google Cloud setup below.

GitHub and Microsoft OAuth are intentionally not exposed in the UI or backend provider allow-list for this iteration.

## Google OAuth Setup

Google login is a Supabase Auth OAuth flow. The app calls `POST /api/auth/oauth/start`, Supabase redirects to Google, and the user returns to `/oauth/callback`.

### Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Go to **Google Auth Platform** or **APIs & Services > OAuth consent screen**.
4. Configure the consent screen:
   - App name: `PTCF Reservation System`
   - User support email: your email
   - Developer contact email: your email
   - User type: `External` for normal Gmail testing, unless this is restricted to a Workspace organization
5. If the app is in **Testing**, add test Google accounts under **Test users**. To allow any Google account, publish the app to **In production**.
6. Go to **Clients** or **APIs & Services > Credentials**.
7. Create an OAuth client:
   - Application type: `Web application`
   - Name: `PTCF Web Client`
8. Add authorized JavaScript origins:

```txt
http://localhost:5173
```

9. Add the Supabase callback URL as an authorized redirect URI:

```txt
https://your-project-ref.supabase.co/auth/v1/callback
```

Use the exact callback URL shown in Supabase under **Authentication > Sign In / Providers > Google**.

10. Copy the generated Google Client ID and Client Secret.

### Supabase Google Provider

In **Supabase > Authentication > Sign In / Providers > Google**:

```txt
Enable Sign in with Google: On
Client IDs: Google OAuth Client ID
Client Secret: Google OAuth Client Secret
Skip nonce checks: Off
Allow users without an email: Off
Callback URL: leave as Supabase shows it
```

Save the provider settings.

To verify Google is enabled without exposing secrets:

```bash
curl -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/auth/v1/settings"
```

In the JSON response, `external.google` must be `true`.

If Google is disabled, the app blocks the OAuth attempt before redirecting and returns a setup message. Supabase itself may return:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

## Resend and Supabase Auth Email Setup

There are two email paths in this project:

- App/booking emails use `server/utils/email.js` and `RESEND_API_KEY`.
- Supabase Auth emails use Supabase's configured email provider.

Setting `RESEND_API_KEY` in `server/.env` is not enough for Supabase Auth verification and password reset emails. Supabase must be configured with custom SMTP.

### Resend Domain

Use a verified sending domain in Resend, not the shared `onboarding@resend.dev` sender for real testing. The shared sender can work, but it is more likely to land in spam.

Recommended sender:

```txt
noreply@mail.yourdomain.dev
```

Current example used during setup:

```txt
noreply@mail.rodflores.dev
```

### DNS Records

In Resend, add a domain such as:

```txt
mail.yourdomain.dev
```

Then add the DNS records Resend provides at your domain registrar or DNS host. The exact values come from Resend and must be copied exactly.

Typical records include:

```txt
DKIM TXT/CNAME records: provided by Resend
SPF TXT record: provided by Resend if needed
DMARC TXT record: recommended
```

A basic DMARC starter record for the mail subdomain is:

```txt
Type: TXT
Name: _dmarc.mail
Value: v=DMARC1; p=none;
```

Wait until Resend shows the domain status as **Verified** before using it in Supabase.

### Supabase SMTP Settings

In **Supabase > Authentication > Emails > SMTP Settings**:

```txt
Enable custom SMTP: On

Sender email address: noreply@mail.yourdomain.dev
Sender name: PTCF Reservation System

Host: smtp.resend.com
Port number: 465
Minimum interval per user: 60

Username: resend
Password: your Resend API key
```

The password is the Resend API key, not the Resend account password.

After saving, Supabase Auth signup, verification resend, password reset, and recovery emails should route through Resend SMTP.

### Email Troubleshooting

`Email rate exceeded` usually means Supabase Auth is still using the built-in email sender or the project hit an auth email limit. Configure custom SMTP through Resend to avoid the low built-in sending limits.

`Error sending recovery email` means Supabase tried to send through SMTP but the SMTP handoff failed. Check:

- The sender email is on a verified Resend domain.
- SMTP host is `smtp.resend.com`.
- Port is `465`.
- Username is `resend`.
- Password is a valid Resend API key.
- Resend logs show the attempted message.
- Supabase Auth logs show the underlying SMTP error.

If emails still land in spam, avoid `onboarding@resend.dev`, use the verified domain sender, and keep SPF/DKIM/DMARC records valid. New domains can still take time to build reputation.

## Demo Account Sync

In Supabase mode, dummy accounts must exist in Supabase Auth. The local `Users` rows alone are not enough.

Run this after seeding or resetting local users:

```bash
cd server
npm run sync:supabase-auth
```

The sync script creates or updates Supabase Auth users for local seeded users, confirms their emails, sets demo passwords, and links `Users.supabaseAuthId`.

Default demo credentials:

```txt
student@uplb.edu.ph     password123
staff@uplb.edu.ph       staff123
admin@uplb.edu.ph       admin123
researcher1@uplb.edu.ph password123
researcher2@uplb.edu.ph password123
```

For any other local user, the script uses:

```env
SUPABASE_DEMO_DEFAULT_PASSWORD=password123
```

You do not need to run the sync every time the app starts. Run it when:

- Local demo users are reseeded or reset.
- Demo emails or passwords change.
- A fresh Supabase project is used.
- Supabase Auth users were deleted.
- `Users.supabaseAuthId` values are missing or stale.

`npm run reset:mvp-demo` clears the local app tables and, when `AUTH_PROVIDER=supabase`, deletes all Supabase Auth users in the configured Supabase project. After reseeding local users, run `npm run sync:supabase-auth` to recreate and relink the demo Supabase Auth accounts.

To clear only Supabase Auth users without wiping local app tables:

```bash
cd server
npm run clear:supabase-auth
```

Production clears require:

```powershell
$env:ALLOW_MVP_DEMO_RESET="1"
```

## Account Deletion and Re-Registration

Admin account deletion soft-deletes the local `Users` row. The Supabase Auth user is intentionally left in Supabase so audit and auth history are preserved.

When a deleted user tries to log in before re-registering, the API returns:

```txt
This account was deleted. Register again to reactivate it, or contact an administrator if this was a mistake.
```

When the same email registers again:

- Password registration restores the old soft-deleted local `Users` row instead of creating a new profile. If the Supabase Auth account already exists, the API sends a password reset email instead of overwriting the password with the service role.
- Google OAuth also restores the old soft-deleted local `Users` row instead of creating a new profile.
- Existing bookings stay attached because the same local `Users.id` is restored.

If a duplicate local profile was created before this restore behavior existed, inspect the duplicate rows before deleting or merging them. Preserve the row that owns the historical bookings.

## Request Flow

In Supabase password mode:

1. `POST /api/auth/login` calls Supabase `signInWithPassword`.
2. The backend returns the Supabase access token and refresh token.
3. The React app sends the access token as `Authorization: Bearer <token>`.
4. Backend middleware validates the token with Supabase `auth.getUser(token)`.
5. The middleware finds the local `Users` row by `supabaseAuthId`.
6. Existing role checks continue to use `Users.accountType`.

In Google OAuth mode:

1. Frontend calls `POST /api/auth/oauth/start` with `provider: "google"`.
2. Backend verifies the Google provider is enabled in Supabase.
3. Supabase redirects the browser to Google.
4. Google returns to `/oauth/callback`.
5. Frontend calls `POST /api/auth/oauth/exchange`.
6. Backend maps the Supabase OAuth user to a local `Users` row.

First-time OAuth users are created as:

```txt
accountType: regular_user
userCategory: external
```

You can later promote roles through existing admin flows.

## Password Reset

Supabase password reset is wired through the backend so the service-role key stays server-only.

1. The user opens `/forgot-password`.
2. The client calls `POST /api/auth/password-reset-request`.
3. The backend calls Supabase `resetPasswordForEmail`.
4. Supabase emails a reset link through the configured SMTP provider.
5. The user lands on `/reset-password`.
6. The client submits the new password to `POST /api/auth/password` with the recovery access token.
7. The backend validates the token, maps it to `Users.supabaseAuthId`, and updates the Supabase Auth password.

## Email Verification

Registration keeps verification in Supabase Auth:

1. Registering with `POST /api/auth/register` creates a Supabase Auth user.
2. Supabase sends the verification email through the configured SMTP provider.
3. If a user needs another link, call `POST /api/auth/email-verification/resend`.

The API response is generic to avoid account enumeration.

## Verification

Run the Supabase Auth verification test:

```bash
npm run test:supabase-auth
```

The test does not send a real reset email by default to avoid rate-limit surprises. To opt in:

```powershell
$env:SUPABASE_AUTH_SEND_RESET_EMAIL_TEST='true'
npm run test:supabase-auth
```

## Security Notes

- Do not use Supabase `user_metadata` for staff/admin authorization.
- Keep roles in `Users.accountType` unless a later backend-only migration moves them to Supabase `app_metadata`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` backend-only.
- Public self-registration must only create `regular_user` profiles. Staff/admin access is granted through admin role management.
- Password reset responses are generic so the endpoint does not reveal whether an email is registered.
- Verification resend responses are generic so the endpoint does not reveal account state.
- `npm run reset:mvp-demo` clears both local app rows and Supabase Auth users when `AUTH_PROVIDER=supabase`. Run `npm run sync:supabase-auth` after reseeding to recreate and relink demo users.
