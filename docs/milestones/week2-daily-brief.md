# Week 2 — Core Booking UI + Calendar + Notifications

**Dates:** Apr 6 – Apr 12, 2026  
**Theme:** Frontend-heavy week. Connect all backend work to visible UI. End of week = MVP.

---

## Daily Milestone Breakdown

### Milestone 8 — Calendar View (Mon Apr 6, Day 8)

**Tag:** Frontend  
**Status:** ✅ Complete (completed Apr 8)

- Calendar view: React Big Calendar hooked to availability API
- Block out confirmed/firm bookings
- Show pencil bookings in muted style

---

### Milestone 9 — Booking Creation Form (Tue Apr 7, Day 9)

**Tag:** Frontend  
**Status:** ✅ Complete (core Apr 8; UX polish Apr 10)

- Booking creation form: time slot picker, resource selector, booking type toggle (pencil/firm), doc upload field
- Submit → POST /bookings
- **Wrap-up:** Calendar month view uses "+N more" popup without clipped events; dismissing the popup does not trigger a stray slot booking; second click on the same "+N more" closes only. Firm booking conflict errors list **resource name** and human-readable type/status (e.g. `Firm (Pending Approval)`).

---

### Milestone 10 — User Booking Dashboard + SendGrid (Wed Apr 8, Day 10)

**Tags:** Frontend, Backend

**Frontend:**

- User booking dashboard: my bookings list, status badges, cancel button, convert-to-firm button
- Show conflict alerts inline

**Backend:**

- SendGrid integration: transactional emails for `booking.created`, `booking.approved`, `booking.denied`, `booking.cancelled`

---

### Milestone 11 — Staff Dashboard (Thu Apr 9, Day 11)

**Tag:** Frontend

- Staff dashboard: pending approvals queue, approve/deny UI with comment field
- Conflict resolution view (contested bookings side-by-side)

---

### Milestone 12 — Scheduled Job + Admin Panel (Fri Apr 10, Day 12)

**Tags:** Backend, Frontend

**Backend:**

- Scheduled job (node-cron): auto-expire pencil bookings past `expiry_at`
- Send 48hr and 24hr warning emails

**Frontend:**

- Admin panel: user list, role promotion (regular → staff), account management

---

### Milestone 13 — Full Deployment Push + Polish (Sat Apr 11, Day 13)

**Tags:** Deploy, Frontend

**Deploy:**

- Full deployment push: Render backend live, Vercel frontend live, Supabase DB connected
- Smoke test the full booking flow end-to-end on staging URL

**Frontend:**

- Bug fixes from smoke test
- Polish UI: empty states, loading spinners, error messages

---

### Milestone 14 — MVP Presentation + Buffer (Sun Apr 12, Day 14)

**Tags:** Client, Buffer

- Present MVP to PTCF staff/contact
- Walk through: register → browse resources → create booking → staff approves → email received
- Collect feedback notes
- ✅ MVP milestone. Buffer day if Day 13 deploy had blockers.

---

## Week 2 Summary Table

| Milestone | Day | Date   | Focus                                                 | Tags              | Status               |
| --------- | --- | ------ | ----------------------------------------------------- | ----------------- | -------------------- |
| 8         | 8   | Apr 6  | Calendar view (React Big Calendar + availability API) | Frontend          | ✅ Complete          |
| 9         | 9   | Apr 7  | Booking creation form                                 | Frontend          | ✅ Complete          |
| 10        | 10  | Apr 8  | User booking dashboard + SendGrid emails              | Frontend, Backend | —                    |
| 11        | 11  | Apr 9  | Staff dashboard + conflict resolution view            | Frontend          | —                    |
| 12        | 12  | Apr 10 | node-cron expiry job + admin panel                    | Backend, Frontend | —                    |
| 13        | 13  | Apr 11 | Full deploy push + smoke test + UI polish             | Deploy, Frontend  | —                    |
| 14        | 14  | Apr 12 | MVP presentation to PTCF                              | Client, Buffer    | —                    |

---

## Notes

- Update the Status column as milestones are completed.
- When a milestone slips to the next day, note it here so the AI briefing document stays accurate.
- Add a `week3-daily-brief.md` when Week 3 planning image is available.
