# PTCF Reservation System Primer and General Guidelines

Draft for PTCF staff review  
Prepared: May 2, 2026

## A. Rationale

The Plant Tissue Culture Facility (PTCF) Reservation System is an online reservation management system for rooms and equipment used in plant tissue culture-related work. It is intended to make reservation requests more organized, transparent, and easier to monitor for both facility users and PTCF personnel.

The system allows users to browse available facility resources, check booking schedules, submit reservation requests, upload supporting documents when required, and monitor the progress of their bookings. By keeping reservation activity in one system, the PTCF can reduce schedule conflicts, improve communication with users, and support fairer use of shared facility resources.

This primer provides general user guidelines for regular users of the system. It does not cover staff-only or administrator-only functions.

## B. About the PTCF Reservation System

The PTCF Reservation System supports reservations for two major resource types:

| Resource Type | Description |
| --- | --- |
| Equipment | Facility equipment used for plant tissue culture work, sterilization, incubation, preparation, or related laboratory activities. |
| Rooms | Facility rooms or work areas that may be reserved for approved plant tissue culture-related activities. |

Through the system, users may:

1. View rooms and equipment registered in the system.
2. Check a facility calendar for resource availability.
3. Create pencil or firm booking requests.
4. Upload authorization documents for firm bookings.
5. Monitor booking status in the My Bookings dashboard.
6. Receive booking-related notices through the system and email.
7. Cancel, convert, or rebook eligible bookings depending on status and timing.

## C. Who May Use the System

The primer is written for regular users, including students, faculty, researchers, research assistants, laboratory technicians, external users, and other users authorized by PTCF policy.

Public self-registration creates regular user accounts only. Staff and administrator access is managed separately by authorized personnel. Regular users cannot approve bookings, manage facility resources, view analytics, or perform administrative actions.

The current system supports registration using an email address and may support Google sign-in when configured. Whether use must be limited strictly to UP Mail accounts should be confirmed with PTCF staff.

## D. Account Access

### 1. Registration

New users may create an account through the Register page. During registration, the user provides an email address, password, password confirmation, and user category.

Available user categories in the current form include:

| User Category |
| --- |
| Student |
| Faculty |
| Researcher |
| Research Assistant |
| Lab Technician |
| External |
| Others |

After registration, the user may be asked to verify the email address before logging in.

### 2. Email Verification

If email verification is required, the user should check the inbox of the registered email address and follow the verification link. If the verification email is not received, the user may use the resend verification option when available.

Users should also check spam, junk, promotions, or institutional email filtering folders.

### 3. Login

Users may log in with their registered email address and password. If Google sign-in is enabled, users may also continue with Google through the login page.

If a login session expires or the user is logged out due to inactivity, the user should log in again.

### 4. Password Reset

Users who forget their password may use the Forgot Password option. If the email address is registered, the system sends password reset instructions to that email address.

## E. Process Flow

The general reservation process is as follows:

1. Open the PTCF Reservation System.
2. Register for an account or log in to an existing account.
3. Choose either Equipment or Rooms from the navigation.
4. Browse the list of resources or use filters and search to find a resource.
5. Open the resource details page to review its description, status, and availability calendar.
6. Click Book this Equipment, Book this Room, or open the Facility Calendar and select a schedule.
7. In the booking form, select the resource type and specific resource.
8. Choose the booking type:
   - Pencil, for a tentative temporary hold.
   - Firm, for a formal request requiring staff approval.
9. Enter the start time and end time.
10. Add the purpose of the reservation.
11. Upload an authorization document if creating a firm booking, or optionally upload one for a pencil booking if it will later be converted.
12. Submit the booking.
13. If the system detects an overlap or conflict, read the notice carefully and choose whether to proceed, go back, or select another schedule.
14. After submission, open My Bookings to monitor status.
15. For firm bookings, wait for PTCF staff review and approval.
16. Check the system and email for booking updates.
17. If needed and allowed, cancel, convert to firm, or rebook through My Bookings.

## F. Rooms and Equipment Guide

The actual list of rooms and equipment may change as PTCF staff maintain the system records. Users should always refer to the live Equipment and Rooms pages for the most current information.

The current foundation data in the project includes the following sample equipment:

| Resource Type | Resource Name | Category | Description | Status |
| --- | --- | --- | --- | --- |
| Equipment | Laminar Flow Hood | Sterilization Equipment | Class II Biological Safety Cabinet for sterile tissue culture work | Available |
| Equipment | Autoclave | Sterilization Equipment | High-pressure steam sterilizer for media and glassware | Available |
| Equipment | Growth Chamber | Incubation Equipment | Temperature and light-controlled chamber for plant tissue culture | Available |

The current foundation data in the project includes the following sample rooms:

| Resource Type | Resource Name | Location | Capacity | Description | Status |
| --- | --- | --- | --- | --- | --- |
| Room | Culture Room A | ICropS Building, 2nd Floor | 8 people | Primary tissue culture laboratory with laminar flow hoods | Available |
| Room | Preparation Room | ICropS Building, 2nd Floor | 4 people | Media preparation and sterilization area | Available |

Resource statuses may include:

| Resource Status | Meaning for Users |
| --- | --- |
| Available | The resource is generally available for booking, subject to schedule rules and staff review. |
| In Use | The resource is active in facility operations but may still be bookable for future schedules, subject to availability and PTCF policy. |
| Maintenance | The resource should not be booked while under maintenance. |
| Unavailable | The resource is not currently open for booking. |

The current implementation allows booking only when a resource status is Available or In Use.

## G. Booking Types

### 1. Pencil Booking

A pencil booking is a tentative reservation. It temporarily holds a time slot but does not serve as final approval to use the resource.

Use a pencil booking when:

1. The schedule is still tentative.
2. The user needs to hold a possible slot before submitting formal documentation.
3. The user may later convert the booking to a firm request.

A pencil booking may expire or be displaced based on system rules.

### 2. Firm Booking

A firm booking is a formal reservation request. It requires an authorization document and must be approved by PTCF staff before it is considered approved.

Use a firm booking when:

1. The schedule is ready for formal review.
2. The required authorization document is available.
3. The user needs staff approval for the reservation.

A firm booking is not final immediately after submission. It remains Pending Approval until PTCF staff approve or deny it.

## H. General Booking Rules

1. New bookings can only be created up to 7 days in advance.
2. New bookings cannot be created if the start time is within 24 hours.
3. Pencil bookings expire at the earlier of:
   - 3 days after the pencil booking is created; or
   - 24 hours before the scheduled start time.
4. Firm bookings require an authorization document.
5. Firm bookings are submitted for staff approval and are not final until approved.
6. Staff must approve a firm booking while the start time is still more than 24 hours away.
7. A firm booking still pending inside the 24-hour pre-start window expires automatically.
8. Firm bookings cannot overlap other active firm bookings on the same resource and time.
9. Pencil bookings cannot be created over active firm blockers.
10. Pencil bookings may overlap other users' pencil bookings, but this may start a contention process.
11. A user cannot create overlapping pencil bookings for the same resource and time under the same account.
12. A firm request may cause overlapping pencil bookings to be placed on hold while waiting for staff decision.
13. If a firm request is approved, overlapping active or on-hold pencil bookings may be displaced.
14. If a firm request is denied or cancelled, affected on-hold pencil bookings may be restored or re-evaluated by the system.

## I. Overlaps, Contention, and On-Hold Bookings

### 1. Overlapping Pencil Bookings

When a user creates a pencil booking that overlaps another user's pencil booking for the same resource, the system may start contention.

Contention is a one-on-one process between:

| Role | Meaning |
| --- | --- |
| Defender | The existing pencil holder who currently has priority for the slot. |
| Challenger | The new pencil holder trying to take the overlapping slot. |

The defender must convert the pencil booking to a firm booking before the contention deadline to keep priority. If the defender does not convert in time, the challenger may receive the slot and the defender may be displaced.

The current system allows only one challenger for a slot at a time. If a slot is already in active contention between two users, another user must choose a different time or check again after the contention deadline.

### 2. Contention Deadline

The contention deadline is automatically calculated by the system. It is the earliest applicable time among:

1. 24 hours after contention starts.
2. 24 hours before the defender booking start time.
3. The defender pencil booking's expiry time.

This deadline is shown in booking notices when applicable.

### 3. On-Hold Pencil Bookings

A pencil booking may become On Hold when it is temporarily blocked by an overlapping firm booking request.

An on-hold pencil booking:

1. Is still visible to the user.
2. Does not actively block other users from requesting the same time.
3. May become active again if the blocking firm request is denied or cancelled.
4. May be displaced if the blocking firm request is approved.

Users with on-hold bookings should monitor My Bookings and email notices.

## J. Booking Status Guide

| Status | Meaning for Users | Usual User Action |
| --- | --- | --- |
| Penciled | A tentative booking is active. It may expire or be challenged. | Monitor the deadline or convert to firm if the reservation should proceed. |
| On hold | A pencil booking is temporarily blocked by an overlapping firm request. | Wait for system update, cancel, or consider another schedule. |
| Pending approval | A firm booking has been submitted and is waiting for PTCF staff decision. | Wait for approval or denial. Monitor email and My Bookings. |
| Approved | A firm booking has been approved by PTCF staff. | Follow facility instructions for actual use of the resource. |
| Denied | A firm request was not approved by staff. | Review staff remarks if available and submit a new request if appropriate. |
| Cancelled | The booking was cancelled by the user or an authorized staff member. | Rebook if still needed and allowed. |
| Expired | The booking lapsed because it was not completed or approved within the required time. | Create a new booking if still needed. |
| Displaced | A pencil booking lost the slot because another booking took priority. | Rebook if the system allows it, or wait for a slot reopening notice. |
| Completed | An approved booking has passed its scheduled end time. | Rebook only if another reservation is needed. |

Some screens may show contention through defender or challenger notices rather than a separate booking status.

## K. Managing My Bookings

The My Bookings dashboard shows the user's active and past bookings.

### 1. Active Bookings

Active bookings may include penciled, on-hold, pending approval, and approved bookings. Users should review active booking cards for deadlines, status messages, staff remarks, and available actions.

### 2. Past Bookings

Past bookings may include cancelled, denied, expired, displaced, and completed bookings. Eligible past bookings may show a rebook option.

### 3. Cancelling a Booking

Users may cancel eligible bookings from My Bookings. The system does not allow cancellation once a booking is already in a terminal status such as cancelled, denied, expired, displaced, or completed.

For firm bookings, cancellation is blocked once the scheduled start time has begun or passed.

### 4. Converting a Pencil Booking to Firm

Eligible pencil bookings may be converted to firm from My Bookings. Conversion requires an authorization document unless one is already attached.

The system does not allow conversion when:

1. The booking is already firm.
2. The booking is cancelled, denied, expired, displaced, or completed.
3. The booking start time is within 24 hours.
4. The booking overlaps another firm booking.
5. The user is the challenger in an active contention round.

In a contention round, the defender may convert to firm to keep the slot.

### 5. Rebooking

The system may allow users to rebook from past bookings with these statuses:

| Rebook Source Status |
| --- |
| Cancelled |
| Denied |
| Expired |
| Displaced |
| Completed |

Rebooking creates a new booking attempt based on the previous booking. The same resource type and resource are retained. Users may need to choose a new schedule or update the purpose and authorization document as needed.

For displaced bookings, rebooking may be blocked while the firm booking that caused the displacement is still pending or approved.

## L. Authorization Documents

Authorization documents are required for firm bookings and for converting eligible pencil bookings to firm. Users should upload one consolidated endorsement letter that contains the required authorization for their affiliation.

The required signatory or authorization source is based on the user's affiliation:

| User Affiliation | Required Signatory or Authorization |
| --- | --- |
| Within ICrops | Adviser or Advisory Committee signature |
| Within CAFS, but outside ICrops | Division or Institute Head signature, with a "Noted by" section |
| Outside CAFS | College or Department Head signature, with a "Noted by" section |
| External users | Institution or agency authorization |

Accepted file types are:

| File Type |
| --- |
| PDF |
| DOC |
| DOCX |
| JPG |
| PNG |

Maximum file size: 5 MB.

Users should make sure the endorsement letter is clear, consolidated into one file, and signed or authorized by the appropriate office before submitting a firm booking request. PTCF staff approval is still required after the booking is submitted.

## M. Notifications and Staff Approval

The system may send email notices for important account and booking events, including:

1. Account verification.
2. Password reset.
3. Booking submission.
4. Firm booking approval.
5. Firm booking denial.
6. Booking cancellation.
7. Booking expiration.
8. Pencil booking expiring soon.
9. Contention started.
10. Displaced slot reopening.

Users should monitor both the registered email inbox and the My Bookings dashboard. Email notices are helpful, but users remain responsible for checking their reservation status.

## N. Important Reminders

1. Submit reservation requests early, but within the allowed 7-day advance window. The system blocks new bookings within 24 hours before the start time.
2. A pencil booking is tentative and can expire.
3. A firm booking requires an authorization document and staff approval.
4. A pending firm booking is not yet approved.
5. Firm requests must be approved before the 24-hour pre-start cutoff.
6. Check the facility calendar before submitting a booking.
7. Read all overlap, contention, and on-hold notices before proceeding.
8. Upload only accepted file types and keep files under 5 MB.
9. Review staff remarks if a firm booking is denied.
10. Use the rebook option only when the system makes it available.
11. Contact PTCF staff for facility policy questions, document requirements, or resource-specific restrictions.
12. Contact technical support for login, verification, upload, or system access issues.

## O. Frequently Asked Questions

### 1. What is the PTCF Reservation System?

It is a web application for requesting reservations of PTCF rooms and equipment. Users can browse resources, check schedules, submit bookings, upload documents, and track booking status.

### 2. Who can use the system?

The system is for authorized facility users with regular user accounts. Staff and administrator accounts are managed separately.

### 3. Do I need a UP Mail account?

The system currently supports registration with an email address and may support Google sign-in when configured. Whether use is strictly limited to UP Mail accounts is a policy item for PTCF staff confirmation.

### 4. What is the difference between a pencil booking and a firm booking?

A pencil booking is a tentative temporary hold. A firm booking is a formal request that requires one consolidated endorsement letter and PTCF staff approval.

### 5. Why do I need an endorsement letter?

The endorsement letter supports the formal review of firm booking requests and confirms that the request is authorized by the appropriate adviser, committee, office, institution, or agency. The required signatory depends on the user's affiliation, as described in the Authorization Documents section.

### 6. Why can't I book a slot within 24 hours?

The system enforces a 24-hour lock window. New bookings, firm conversion, and firm staff approval are not allowed once the schedule is within 24 hours of the start time.

### 7. Why can't I book a slot more than 7 days away?

The system only accepts new bookings up to 7 days in advance. Choose a start time within the next 7 days.

### 8. What does Pending Approval mean?

Pending Approval means a firm booking has been submitted and is waiting for PTCF staff decision. It is not yet approved.

### 9. What happens if my firm booking is not approved before the 24-hour cutoff?

The firm request expires automatically if it remains pending inside the 24-hour pre-start window.

### 10. What does On Hold mean?

On Hold means a pencil booking is temporarily blocked by an overlapping firm booking request. If the firm request is denied or cancelled, the pencil may be restored or re-evaluated. If the firm request is approved, the pencil may be displaced.

### 11. What does Displaced mean?

Displaced means a pencil booking lost the slot because another booking took priority, usually after a firm booking was approved or after a contention deadline was missed.

### 12. What should I do if my pencil booking is being challenged?

If you are the defender and you want to keep the slot, convert your pencil booking to firm before the contention deadline. You will need an authorization document.

### 13. What should I do if I am the challenger?

Wait for the contention to resolve. The defender has the opportunity to convert to firm before the deadline. A challenger cannot convert to firm during an active contention round.

### 14. Can I cancel a booking?

Yes, if the booking is eligible for cancellation. Bookings already cancelled, denied, expired, displaced, or completed cannot be cancelled again. Firm bookings cannot be cancelled once the scheduled start time has begun or passed.

### 15. Can I rebook a past booking?

The system may allow rebooking from cancelled, denied, expired, displaced, or completed bookings. Rebooking is still subject to the same booking rules, availability, and conflict checks.

### 16. Why can't I convert my pencil booking to firm?

Conversion may be blocked because the booking is not eligible, the start time is within 24 hours, the booking overlaps a firm booking, an authorization document is missing, or the user is the challenger in an active contention.

### 17. What file types are accepted for authorization documents?

The system accepts PDF, DOC, DOCX, JPG, and PNG files up to 5 MB.

### 18. What should I do if I did not receive a verification email?

Check the registered email inbox, spam or junk folder, and institutional filtering folders. Use the resend verification option if available. If the issue continues, contact technical support.

### 19. What should I do if my session expires?

Log in again. If the issue persists, contact technical support.

### 20. How will I know if my booking is approved?

The booking status will show as Approved in My Bookings, and the system may also send an email notification.

### 21. Who should I contact for questions?

Contact PTCF staff for reservation policy, document requirements, resource availability, or facility use concerns. Contact technical support for system access, login, email verification, or file upload issues.

## P. Contact and Support

The following details should be finalized by PTCF staff before publishing this primer:

| Concern | Contact |
| --- | --- |
| Reservation policy and facility use | To be confirmed by PTCF staff |
| Endorsement letter questions | PTCF staff |
| Technical support | To be confirmed by project owner or system administrator |
| Office or facility location | To be confirmed by PTCF staff |
| Contact number | To be confirmed by PTCF staff |

## Q. Items for Confirmation

The following items should be reviewed with the PTCF staff client before the document is published:

1. Whether UP Mail is strictly required for all users.
2. Whether external users are allowed to register and reserve resources.
3. Official PTCF contact email address.
4. Official technical support email address.
5. Office or facility location to display in the primer.
6. Contact number to display in the primer.
7. Official operating hours of the Plant Tissue Culture Facility.
8. Resource-specific operating hours or restrictions.
9. Final official list of rooms and equipment.
10. Whether fees, payment documents, or billing steps apply to any reservation.
11. Whether PTCF staff will provide a required endorsement letter template or sample format.
12. Whether users must present an approved booking confirmation before using the facility.
13. Whether cancellation has additional policy consequences outside the system.
14. Whether there should be a required lead time longer than the system's 24-hour technical cutoff.
15. Whether the primer should include screenshots or photos of PTCF rooms and equipment.
