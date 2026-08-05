# UP Visual Identity Reskin Brief

## Purpose

Use this brief as the source of truth for reskinning the PTCF Project frontend with a University of the Philippines inspired visual identity. The work should make the app feel aligned with UP while preserving the PTCF booking system's existing behavior, routes, data flows, accessibility, and verification discipline.

This is a frontend visual reskin only unless a build issue requires a small supporting fix.

## Project Context

- Project: PTCF Room and Equipment Reservation Management System for the Plant Tissue Culture Facility
- Frontend: React 19, Vite 8, React Router v7
- Styling: Tailwind CSS v4, shadcn/ui, Radix UI
- Forms: React Hook Form and Zod
- Main frontend path: `client/src`
- Global stylesheet: `client/src/index.css`
- Calendar styling: `client/src/components/BookingCalendar.rbc.css`
- Shared UI primitives: `client/src/components/ui`

Follow `AGENTS.md` before doing substantive work.

## Authorization Boundary

The UP Seal and the Oblation must not be used.

Do not:

- Add the UP Seal or Oblation as an image, icon, background, watermark, badge, loading mark, or decorative element.
- Trace, recreate, approximate, silhouette, stylize, or abstract either symbol.
- Use placeholder shapes that imply the seal or Oblation.
- Use Padayon or any official UP logotype asset unless separately authorized and provided.

Use text-only institutional styling.

## Color Source

Use Pantone Solid Coated-V5 sRGB/HEX values for screen UI. These came from Pantone Connect access and should be treated as the web color source for this reskin.

The Visual Identity Guidebook's CMYK values are print-production references and should not be used as the web token values.

## Core Web Tokens

```css
--up-maroon: #8A1538;       /* PANTONE 1955 C, Solid Coated-V5, sRGB 138 21 56 */
--up-forest-green: #00573F; /* PANTONE 7484 C, Solid Coated-V5, sRGB 0 87 63 */
--up-gold: #FFB81C;         /* PANTONE 1235 C, Solid Coated-V5, sRGB 255 184 28 */
--up-spot-black: #231F20;   /* Neutral Spot Black UI approximation */
--up-white: #FFFFFF;
```

HSL equivalents for the current shadcn/Tailwind variable format:

```css
--up-maroon-hsl: 342.05 73.58% 31.18%;
--up-forest-green-hsl: 163.45 100% 17.06%;
--up-gold-hsl: 41.23 100% 55.49%;
--up-spot-black-hsl: 345 6.06% 12.94%;
--up-white-hsl: 0 0% 100%;
```

Pantone source details:

- PANTONE 1955 C: Library PANTONE Solid Coated-V5, Page 64, HEX `#8A1538`, sRGB `138 21 56`, LAB `31.45 49.96 14.09`, CMYK `0 100 43 43`.
- PANTONE 7484 C: Library PANTONE Solid Coated-V5, Page 227, HEX `#00573F`, sRGB `0 87 63`, LAB `31.68 -30.46 6.21`, CMYK `92 8 75 58`.
- PANTONE 1235 C: Library PANTONE Solid Coated-V5, Page 9, HEX `#FFB81C`, sRGB `255 184 28`, LAB `80.67 20.69 79.10`, CMYK `0 25 94 0`.

## Color Usage

- UP Maroon is the primary institutional color.
- Forest Green is the complementary institutional color.
- Gold is an accent only. Use it for small highlights, borders, badges, dividers, or emphasis.
- Spot Black or near-black neutrals should carry most text and serious UI surfaces.
- White and restrained neutrals may be used for surfaces, cards, borders, disabled states, and layout clarity.
- Do not introduce unrelated brand colors.
- Semantic colors for errors, warnings, success, and booking statuses may remain distinct when needed for usability, but they should be visually restrained and separated from brand tokens.
- Do not use gold as small body text on white.
- Preserve WCAG AA contrast.

## Tailwind and shadcn Rules

This project uses Tailwind CSS v4 CSS-first customization.

Required:

- Keep `@import "tailwindcss";`.
- Keep theme customization in `client/src/index.css` using `@theme` and CSS variables.
- Use the existing shadcn CSS variable pattern.
- Prefer updating `:root` tokens and shared primitives before editing page-by-page classes.
- Use tokens such as `bg-primary`, `text-primary`, `border-border`, `ring-ring`, `bg-card`, and `text-muted-foreground` where appropriate.

Forbidden:

- Do not add `tailwind.config.js`.
- Do not add Tailwind v3 directives such as `@tailwind base`, `@tailwind components`, or `@tailwind utilities`.
- Do not scatter raw brand hex values throughout components.

## Typography

Use CSS font stacks only unless licensed font files already exist in the project.

Suggested stacks:

```css
--font-heading: Optima, Candara, "Noto Sans", system-ui, sans-serif;
--font-body: Avenir, "Avenir Next", Helvetica, Arial, sans-serif;
--font-formal: Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif;
```

Guidance:

- Use Optima-style stacks for titles and headings.
- Use Avenir/Helvetica-style stacks for general app UI and body copy.
- Use Palatino-style stacks only for formal/document-like blocks if helpful.
- Do not import or redistribute proprietary fonts unless the project already has licensed assets.

## Visual Direction

The interface should feel:

- Formal
- Clean
- Trustworthy
- Academic
- Appropriate for a Filipino public-university context
- Useful for a low-volume facility reservation system

Avoid:

- Generic purple/blue SaaS theming
- Loud decorative gradients
- Unofficial UP-like symbols
- Overly playful or marketing-heavy visuals
- Visual changes that make booking states harder to scan

## High-Risk UI Areas

Reskin these carefully because they carry meaning:

- `client/src/components/BookingStatusBadge.jsx`
- `client/src/components/StatusBadge.jsx`
- `client/src/components/bookingCalendarUtils.js`
- `client/src/components/BookingCalendar.jsx`
- `client/src/components/BookingCalendar.rbc.css`
- `client/src/components/my-bookings/ActiveBookingCard.jsx`
- `client/src/pages/BookingForm.jsx`
- `client/src/pages/Dashboard.jsx`
- `client/src/pages/StaffDashboard.jsx`
- `client/src/pages/AdminPanel.jsx`

Do not collapse all statuses into UP Maroon/Green/Gold if that reduces usability. Booking statuses must remain distinguishable.

Suggested mapping:

- Approved and completed: Forest Green family.
- Pending approval and on hold: Gold-derived accessible tint family.
- Denied and destructive: Maroon/destructive family.
- Cancelled, expired, displaced: Neutral family.
- Penciled, contested, challenger, and defender: keep distinct enough for quick scanning.

## Implementation Order

1. Read `AGENTS.md`, this brief, and directly relevant frontend files.
2. Produce a short plan before editing.
3. Update `client/src/index.css` with UP tokens, shadcn variables, and typography.
4. Update shared UI primitives and navigation.
5. Update status badges, booking cards, alert blocks, and calendar styling.
6. Sweep major pages for generic blue/slate/purple styling and replace with tokenized UP-aligned styling.
7. Keep `client/src/components/GoogleIcon.jsx` provider colors unchanged.
8. Verify lint and build.

## Acceptance Checks

- No UP Seal or Oblation appears anywhere.
- No imitation of the UP Seal or Oblation appears anywhere.
- `tailwind.config.js` is not created.
- Tailwind v3 directives are not introduced.
- The app still routes correctly through equipment, rooms, calendar, booking form, dashboard, staff dashboard, admin panel, login/register, password reset, and OAuth callback.
- Booking status colors remain understandable.
- Calendar month, week, day, and agenda views remain readable.
- Mobile navigation still works.
- Focus states remain visible.
- Text contrast passes WCAG AA for normal UI usage.
- Raw brand hex values are centralized as much as practical.

## Verification Commands

From `client`:

```bash
npm run lint
npm run build
```

Optional visual verification:

```bash
npm run dev
```

Inspect:

- Equipment list and detail pages
- Room list and detail pages
- Calendar month/week/day/agenda views
- Booking form
- My Bookings dashboard
- Staff Dashboard
- Admin Panel
- Login, Register, Forgot Password, Reset Password

## Milestone Context

Treat the reskin as Milestone 20: UP Visual Identity Reskin.

Sync & Seal is not required unless explicitly requested after the visual reskin is reviewed.
