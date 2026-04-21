# Booking system rules (staff and administrators)

This document describes how reservations behave in the PTCF Room and Equipment system, in everyday language. It is meant for **facility staff**, **system administrators**, and anyone explaining the rules to users. **Pencil–pencil contention (defender, challenger, queue, timer):** read **Section 5** first. For technical transition IDs and implementation detail, see [`booking-transition-catalog-seed.md`](booking-transition-catalog-seed.md).

---

## 1. Two kinds of reservation

| Kind | Plain meaning | Needs staff approval? |
|------|----------------|------------------------|
| **Pencil** | A **soft hold** on a time slot. It reserves the slot tentatively and can expire or be bumped by rules below. | No |
| **Firm** | A **formal request** to use the facility for that window. It is treated as a real scheduling commitment once approved. | **Yes** (status *Pending approval* until you approve or deny) |

There is **no separate “confirmed” status**. An approved firm booking is **Approved**.

---

## 2. The 24-hour lock window

These rules use **wall-clock time** relative to the booking **start time**:

- **New bookings** (pencil or firm) **cannot be created** if the start time is **within 24 hours** of now (or in the past).
- **Firm** bookings in *Pending approval* or *Approved* **cannot be cancelled** inside that same **24 hours before start** window.

Pencil cancellations are **not** blocked by this 24-hour rule (only firm cancellations are, as above).

---

## 3. Pencil lifetime and reminders

- A pencil has an **expiry time** computed as the **earlier** of: **three days after it was created**, or **24 hours before the slot starts**.
- After expiry, the system can mark the pencil **Expired** (and related contention logic may run).
- Users may receive **warning emails** before a pencil expires, when applicable.

---

## 4. What can overlap what?

**Same room or equipment, overlapping times:**

| Situation | Result |
|-----------|--------|
| **Firm** overlaps **another firm** (pending or approved) | The new booking is **rejected**. Two firms cannot share the same window. |
| **Pencil** overlaps a **firm** (pending or approved) | The pencil is **rejected**. Firm blocks the slot. |
| **Firm** overlaps someone else’s **pencils** | The firm request **can still be submitted**. Those pencils are **not** removed at submit time. If you **approve** the firm, overlapping pencils are handled as in **Section 7**. |
| **Pencil** overlaps **another user’s pencil** | The system enters **contention** (see **Section 5**). The user must confirm they accept contention when submitting. |

**Same person, same slot:**

- Users cannot place a second **pencil** on top of their own pencil for the same window (unless the workflow explicitly replaces it, such as when submitting a new pencil that cancels the overlapping own pencil as part of that action).
- **Firm** submissions that would overlap the user’s own pencil may require confirmation; behavior is enforced in the app.

---

## 5. Pencil–pencil contention (automatic)

When two **different users** pencil the **same resource** for **overlapping times**, the system runs an **automated** process. **Staff do not pick a winner** for pencil-versus-pencil disputes.

**Roles (helpful vocabulary):**

- **Defender** — The pencil that was **first in line** for that overlap (the one being “challenged”).
- **Challenger** — The **newer** overlapping pencil that triggered the contest.
- **Contested** — The defender’s booking is marked this way while the episode is open.
- **Queued** — Additional overlapping pencils may wait **in line** behind the current pair.

**Timer:**

- Each open contest has a **resolution deadline**. It is the **earliest** of: **24 hours from when the contest opened**, **24 hours before the slot starts**, and the **defender’s pencil expiry** (and similarly bounded for the challenger’s pencil where rules apply).
- When the deadline passes without the defender winning by conversion (below), the **challenger wins** and the system promotes the next waiter, and so on.

**Staff role here:** None, except general support and explaining the process. **Do not** treat pencil contention like a staff approval queue.

**What users now see in My Bookings (for explanations/support):**

- **Defender (`contested`)** and **queued** cards show a short summary first, with a **View details** toggle for deeper context.
- **Active challenger** cards now show a dedicated top alert that combines:
  - what is happening (automatic challenger flow and fairness timer),
  - who they are currently contesting (overlap sequence / "battle plan"),
  - the **current step deadline** for the holder being challenged.
- On challenger cards, **Convert to Firm** is intentionally disabled until the overlap sequence clears.

---

## 6. Converting a pencil to firm

- Only the **defender** (the contested pencil holder) may **convert to firm** during an open contest, not the challenger.
- A booking that is only **Queued** cannot be converted until it is an active pencil in the right state; the app enforces this.
- A booking flagged as **active challenger** shows **Convert to Firm** as disabled; the user must wait for current contention steps to resolve.
- Conversion requires an **authorization document** upload (handled through the system).
- When the defender converts, the open contest is **closed** and the **challenger** and **waitlisted** pencils are returned to normal **penciled** flow (they may re-enter contention with each other if their slots still overlap). They are **not** marked **Displaced** at that moment.

After conversion, the firm booking is **Pending approval** until staff act. **If you approve** that firm, overlapping pencils (including former challenger and queue members in that window) are then **displaced**, same as for any other approved firm (**Section 7**). **If you deny** it, those users keep their pencils as active holds (unless something else applies, such as expiry).

---

## 7. Displacement

**Displacement** means a pencil (or queued slot) **loses the slot** because a **firm** booking **takes priority**:

- When staff **approve** a firm booking, any **active pencil** (or queued item) that **overlaps** that firm’s time on the same resource is marked **Displaced** and linked to the firm booking that caused it. This is the **only** moment those users are displaced for that firm—including when the firm started as a **defender convert-to-firm** from a contention episode.
- Submitting or converting to a firm in **Pending approval** does **not** by itself displace other users’ pencils; it only requests the slot until you approve.

**Displaced** is a **terminal** outcome for that pencil row (like cancelled or expired): it stops competing for the slot.

**Rebooking:** Users may start a **new** booking after displacement, but if the displacing firm is still **pending or approved**, the system may **block** an immediate rebook of that displaced lineage until that situation changes (users see messaging in the app).

---

## 8. Staff actions on firm bookings

**Approve**

- Only for **Firm** + **Pending approval**.
- Approving runs displacement cleanup for overlapping pencils and open contests on that resource, as designed.

**Deny**

- Only for **Firm** + **Pending approval**.
- Denied firm bookings do not displace pencils.

**Important:** **Deny** does **not** apply to pencil **Contested** state as a workflow. Contested pencils are **not** firm requests awaiting your deny action.

---

## 9. Cancellation

- **Cancelled** bookings are final for that row.
- **Firm** pending or approved: **cannot cancel** inside **24 hours before start** (see **Section 2**).
- When a booking involved in a contest is cancelled, the system **reopens or rewires** contention according to automated rules (who was defender vs challenger, waitlist, overlaps). Staff do not manually reassign those steps.

If an **approved firm** is cancelled, users whose bookings were **displaced** by that firm may be **notified** that the slot situation may have changed.

---

## 10. Status glossary (user-visible)

| Status | Short explanation |
|--------|-------------------|
| **Penciled** | Active soft hold; subject to expiry and overlap rules. |
| **Contested** | Pencil is the **defender** in an open automated contest. |
| **Contesting** (calendar hint) | Same as penciled for the database, but the calendar highlights the **challenger** for clarity. |
| **Queued** | Waiting behind others in the same contention episode. |
| **Pending approval** | Firm request submitted; **staff** must approve or deny. |
| **Approved** | Firm booking is confirmed for scheduling. |
| **Denied** | Firm request rejected by staff. |
| **Cancelled** | User or staff cancelled an active booking. |
| **Expired** | Pencil ran past its expiry time or lost via automated contention/expiry paths. |
| **Displaced** | Pencil removed in favor of an overlapping **approved** **firm** (includes firms that were converted from pencil and then approved). |

---

## 11. Practical checklist for staff

1. **Approvals tab:** Work **firm** bookings in *Pending approval*. Check authorization documentation per facility policy.
2. **Do not** expect to “resolve” pencil–pencil overlaps manually; explain the **timer** and **defender / challenger** roles if users ask.
3. **Explain displacement** when users are bumped: it happens on your **approval** of a firm (including one that came from **convert-to-firm** after a contest), not when the request is only pending.
4. **24-hour rule:** Remind users they cannot **create** last-minute bookings or **cancel approved/pending firms** right before the slot.
5. If the database is **re-seeded** or reset for demos, everyone may need to **log in again**; old sessions can stop working.

---

## 12. Related documents

| Document | Audience |
|----------|----------|
| [`booking-transition-catalog-seed.md`](booking-transition-catalog-seed.md) | Developers and technical testers (state transitions, IDs, changelog) |
| [`AGENTS.md`](../AGENTS.md) | Project index for developers |

If this plain-language guide and the live app ever disagree, **the running system and `AGENTS.md` business notes take precedence** until the documentation is updated.
