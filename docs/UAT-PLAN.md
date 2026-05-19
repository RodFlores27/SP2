# User Acceptance Testing Plan

Project: PTCF Room and Equipment Reservation Management System  
Prepared for: UPLB ICropS Plant Tissue Culture Facility evaluation  
Prepared date: May 4, 2026

## 1. UAT Overview

This User Acceptance Testing (UAT) plan verifies whether the PTCF Reservation System supports the real reservation workflows expected by facility users, PTCF staff, and system administrators.

The plan is based on inspection of the project documentation, React client routes and pages, Express server routes and controllers, and the existing milestone test suite. The system currently includes public resource browsing, authenticated booking creation, a booking calendar, user booking management, staff approval workflows, resource management, administrator user management, and Kafka-backed analytics/recent event reporting.

UAT is intended to answer the following question:

> Can intended users complete the actual PTCF reservation tasks correctly, with acceptable clarity, control, and confidence?

SUS or other usability survey instruments may be administered after these UAT tasks, but they are not part of the UAT pass/fail decision.

## 2. UAT Objectives

The objectives of UAT are to:

1. Confirm that students/requesters can browse resources, check availability, submit bookings, and track booking status.
2. Confirm that PTCF staff can review firm booking requests, approve or deny requests, understand contention/on-hold cases, and manage room/equipment records.
3. Confirm that system administrators can view analytics/recent booking event summaries and manage user roles/accounts.
4. Confirm that role-based access control prevents regular users from accessing staff/admin functions.
5. Confirm that critical booking rules are understandable to users and enforced by the system.
6. Collect observed issues, participant feedback, and improvement recommendations before final deployment or defense.

## 3. Testing Scope

### 3.1 Included In Scope

The following implemented features are included:

| Area | Included Features |
| --- | --- |
| Authentication | Register, login, email verification/resend flow, Google OAuth when configured, forgot password, reset password, logout, inactivity/session expiry handling |
| Public browsing | Equipment list, room list, guidelines page, public calendar availability |
| Resource details | Equipment detail, room detail, embedded availability calendar, Book this Equipment/Room buttons |
| Booking creation | Pencil booking, firm booking, purpose, date/time selection, resource selection, authorization document upload, calendar/detail prefill, conflict notices |
| Booking rules | 24-hour lock window, firm authorization document requirement, firm vs firm rejection, pencil vs firm rejection, same-user overlap confirmation, foreign pencil overlap confirmation, 1v1 contention, on-hold, displaced, expired, completed |
| My Bookings | Active/past booking tabs, status grouping, search/filter/sort, cancel eligible booking, convert eligible pencil to firm, view authorization document, rebook eligible past booking |
| Staff dashboard | Pending approvals, denied-source resubmissions, active conflicts, approved bookings, filters, review details, staff remarks, approve, deny |
| Resource management | Staff/admin create, edit, delete rooms and equipment, including image upload/removal where available |
| Admin panel | Analytics counts, recent booking lifecycle events, user list, search, role changes, delete user, self-protection rules |
| Notifications evidence | Email receipt or test email/log evidence for booking lifecycle and auth flows where the test environment supports it |

### 3.2 Out Of Scope

The following are not UAT targets, though they may be covered by technical tests:

| Area | Reason |
| --- | --- |
| Full penetration testing | Should be handled as security testing, not UAT |
| Load/performance testing | Requires separate tooling and success metrics |
| Kafka internals | Milestone tests already verify event publishing, notification, audit, and analytics consumers |
| Direct database validation by participants | Not appropriate for non-technical UAT users |
| Backend-only audit log endpoint internals | Direct API contract/internal DB checks are not participant-facing UAT tasks; use Admin Panel Audit Trail for UI validation |
| Browser/device matrix testing | Can be done separately as compatibility testing |

## 4. User Roles

| Role | System Account Type | Main Responsibilities In UAT |
| --- | --- | --- |
| Student/requester | `regular_user` | Browse resources, view calendar, create pencil/firm bookings, upload documents, monitor status, cancel, convert, rebook |
| PTCF staff | `ptcf_staff` | Review pending firm bookings, approve/deny with remarks, inspect authorization documents, understand conflicts, manage resources |
| System administrator | `system_admin` | Access Admin Panel, view analytics and Audit Trail, manage users and roles, access staff features |

Public self-registration creates regular user accounts only. Staff and administrator roles must be assigned by an existing system administrator.

## 5. Participant Criteria

### 5.1 Recommended Participants

| Participant Group | Recommended Count | Rationale |
| --- | ---: | --- |
| Students/requesters | 5 to 8 | Enough to observe common booking, browsing, and status-tracking problems |
| PTCF staff | 2 to 3 | Enough to validate approval decisions, resource management, and staff dashboard fit |
| System administrator or staff manager | 1 to 2 | Enough to validate role/account management and analytics review |

Minimum acceptable academic UAT sample:

- 3 student/requester participants
- 1 PTCF staff participant
- 1 admin/staff manager participant

### 5.2 Participant Requirements

Participants should:

1. Be potential or actual users of PTCF rooms/equipment, or staff who understand the reservation workflow.
2. Be able to use a web browser on desktop or mobile.
3. Have an assigned test account or be allowed to create a test account.
4. Understand that the test uses prepared scenarios and may not represent an official reservation.
5. Agree that observations and feedback may be summarized anonymously in the capstone evaluation.

## 6. Preconditions

Before conducting UAT:

1. The frontend is deployed and reachable online from participant devices.
2. The backend API is deployed and reachable online from participant devices.
3. The database contains at least two rooms and two equipment records with statuses `available` or `in-use`.
4. Test accounts exist for `regular_user`, `ptcf_staff`, and `system_admin`.
5. At least one test authorization document is prepared in PDF, DOC, DOCX, JPG, or PNG format and is below 5 MB.
6. Email sending is configured, or the evaluator has access to backend/Kafka/Resend logs to verify email-triggered events.
7. Test schedules are prepared more than 72 hours in the future to avoid the 24-hour lock window except where the cutoff rule is intentionally tested.
8. At least two requester accounts are available for overlap/contention scenarios.
9. Participants are told not to use confidential real reservation data during testing.
10. The evaluator has a blank issue log and result recording sheet.
11. A dedicated production UAT window is announced to participants (date, start/end time, and support contact).
12. A production-safe reset/cleanup method is prepared for test data created during UAT.
13. Each participant receives a unique test account or a controlled shared account schedule to avoid session overlap.
14. A fallback communication channel (Messenger, SMS, or email) is prepared for remote troubleshooting.

## 7. Testing Environment

| Item | Target Environment |
| --- | --- |
| Frontend | React + Vite application on hosted production URL (Vercel) |
| Backend | Express API on hosted production URL (Render) |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth mode with production redirect URLs and test accounts |
| File storage | Cloudinary for room/equipment images and authorization document uploads |
| Email delivery | Resend, with Kafka notification consumer when Kafka is enabled |
| Event processing | Kafka/Aiven or local Docker Kafka when enabled; safe degraded behavior when disabled |
| Browser | Latest Chrome, Edge, or Firefox |
| Device | Participant-owned devices (desktop/laptop/mobile) with stable internet connection |

Record the actual environment used:

| Field | Value |
| --- | --- |
| Test date |  |
| Frontend URL |  |
| Backend API URL |  |
| Database/environment |  |
| Auth mode |  |
| Kafka enabled? |  |
| Email enabled? |  |
| Browser/device |  |
| Facilitator |  |
| Support contact during test |  |
| UAT window (start-end) |  |

### 7.1 Remote Production UAT Session Setup

Use this setup for remote execution:

1. Share one UAT packet link to participants containing: UAT task sheet, test account credentials, and submission form.
2. Require participants to confirm their role and account before starting.
3. Instruct participants to execute only UAT test bookings and avoid real confidential booking data.
4. Keep a live support channel open for login/password/reset or connectivity blockers.
5. Capture all timestamps in one timezone (recommended: `Asia/Manila`) for consistent evidence.

### 7.2 Production Test Account Matrix

Use a prepared matrix and rotate accounts by role if needed:

| Participant ID | Role | Test Account Email | Assigned Window | Status |
| --- | --- | --- | --- | --- |
| P01 |  |  |  |  |
| P02 |  |  |  |  |
| P03 |  |  |  |  |

## 8. UAT Procedure

1. Brief the participant on the purpose of UAT and confirm they are using the production UAT links.
2. Assign the participant role and test account from the account matrix.
3. Ask the participant to perform each task scenario without step-by-step coaching.
4. The observer records task result, errors, hesitations, timestamps, questions, and comments.
5. If the participant is blocked for more than 3 minutes, the observer may provide minimal help and mark the task as Partial or Fail depending on the outcome.
6. Capture evidence while remote: screenshots, short screen recordings, or logs for key pass/fail moments.
7. After all tasks, ask the participant feedback questions.
8. After all participants finish, calculate task completion rates and classify issues by severity.
9. Run post-session production cleanup/reset for UAT-created test records.
10. Decide whether the system passes UAT based on the criteria in Section 9.

### 8.1 Post-Session Production Cleanup Checklist

After each remote UAT batch:

1. Archive collected evidence and responses before data cleanup.
2. Cancel or close test bookings that should not remain active in production.
3. Remove disposable test users if they were created for UAT only.
4. Reset seeded demo data only if your reset procedure is approved for the current environment.
5. Re-run a smoke check on login, booking creation, and staff approval paths after cleanup.

### 8.2 Hybrid Execution Model (Recommended)

To reduce facilitator load while keeping reliable results:

1. Run 1 to 2 live pilot sessions first to validate task wording, account readiness, and evidence format.
2. After pilot fixes, run most participants asynchronously using the same production UAT packet.
3. Keep the facilitator on-call only for blocker support, not full-time observation.
4. Require each async participant to submit evidence for critical checkpoints before a task can be marked Pass.

### 8.3 Async Participant Submission Rules

For asynchronous runs, each participant must submit:

1. Start time and end time per task block.
2. Screenshot evidence for each critical milestone step.
3. Exact error text (or screenshot) for each failed/partial step.
4. Final summary comments for clarity and usability concerns.

If required evidence is missing, mark the task as `Partial` or `Not Tested` until clarified.

## 9. Pass, Fail, And Partial Criteria

### 9.1 Task-Level Criteria

| Result | Definition |
| --- | --- |
| Pass | Participant completes the task independently or with only normal reading of on-screen instructions; system result is correct |
| Partial | Participant completes the task with minor assistance, retry, or workaround; no data loss or security issue occurs |
| Fail | Participant cannot complete the task, reaches an incorrect system state, encounters a crash, or violates role/security expectations |
| Not Tested | Task was skipped because the role, environment, or prepared data was unavailable |

### 9.2 Overall UAT Acceptance Criteria

The system passes UAT when:

1. All critical booking workflows pass for at least one participant in the relevant role.
2. At least 80 percent of all executed test cases are marked Pass.
3. No unresolved Major issue remains in authentication, booking creation, approval, cancellation, or role-based access.
4. Staff participants confirm that the approval/rejection workflow is acceptable for real PTCF use.
5. Requester participants can submit and monitor bookings without facilitator intervention for the core workflow.
6. Admin participants can complete Analytics range filtering, CSV export, and Audit Trail review without facilitator intervention.

## 10. Issue Severity Guide

| Severity | Description | Examples |
| --- | --- | --- |
| Minor | Cosmetic, wording, layout, or small clarity issue that does not prevent completion | Confusing label, minor alignment issue, participant wants clearer helper text |
| Moderate | Causes delay, mistake, or workaround but does not break a critical workflow | Participant cannot find filter, error message unclear, staff needs help locating pending requests |
| Major | Blocks a critical task, causes wrong booking state, exposes unauthorized access, or risks data integrity | Regular user reaches Admin Panel, firm booking approves inside lock window, booking saves wrong date/time, authorization upload impossible |

## 11. Task Scenarios

### 11.1 Student/Requester Scenarios

| Scenario ID | Scenario |
| --- | --- |
| ST-S01 | Log in as a requester using the account provided to you |
| ST-S02 | Browse equipment and rooms, use search/filter options, then choose one resource |
| ST-S03 | Open the selected equipment/room detail page and check availability |
| ST-S04 | Start a booking from the facility calendar or from the "Book Now" action |
| ST-S05 | Create a pencil booking with complete request details for the selected resource type |
| ST-S06 | Create a firm booking with the provided authorization document sample. Make sure it does not overlap your previously created pencil booking. |
| ST-S07 | Verify that your new firm booking appears in "Pending Approval" in My Bookings |
| ST-S08 | An already approved firm booking example is provided in your account. Check it in My Bookings |
| ST-S09 | Create a pencil booking with a schedule that overlaps another user's pencil booking. This will start a contention episode |
| ST-S10 | Check your new booking in My Bookings and see it that is tagged as challenger |
| ST-S11 | Check the already prepared defender booking state in My Bookings to understand the defender side of contention |
| ST-S12 | End contention by converting your defender pencil to firm and verify the result |
| ST-S13 | Track booking status updates in My Bookings and use search/filter options to locate specific bookings |
| ST-S14 | Cancel an eligible booking |
| ST-S15 | Find the cancelled booking in My Bookings (Past) and rebook it |
| ST-S16 | Check your email inbox for booking notifications and verify subject, timestamp, and action match |


For `ST-S09`, `ST-S10`, `ST-S11`, and `ST-S12`, use either setup option:
1. Participants select an existing pencil booking that is not theirs, then create a pencil booking with a schedule that overlaps that booking to trigger contention.
2. Facilitator pre-seeds defender bookings per user, then assigns challengers to create pencil bookings with schedules that overlap those bookings.

### 11.2 PTCF Staff Scenarios

| Scenario ID | Scenario |
| --- | --- |
| STF-S01 | Log in using the account provided to you and access the Staff Dashboard under "Manage" Tab |
| STF-S02 | Review pending firm booking requests under "Pending Approvals"|
| STF-S03 | Approve a valid firm booking with optional staff remark. Find the approved booking under "Approved Bookings". You can use the filters to help you find it. |
| STF-S04 | Deny a firm booking with staff remark |
| STF-S05 | Review bookings under "Resubmissions" |
| STF-S06 | Explore the Staff Dashboard filters/search options in Pending, Resubmissions, and Approved views |
| STF-S07 | Review "Active Conflicts" (no manual decision action expected). Check how they are displayed in the calendar. |
| STF-S08 | Review approved bookings and view booking details |
| STF-S09 | Open Calendar, switch to Agenda view, and check Agenda filter options and resulting entries |
| STF-S10 | Go to "Equipment" or "Room". Create, edit, or delete room/equipment records |

### 11.3 System Administrator Scenarios

| Scenario ID | Scenario |
| --- | --- |
| ADM-S01 | Log in using the account provided to you and access Admin Panel under the "Manage" Tab  |
| ADM-S02 | Open Analytics and review booking event summaries |
| ADM-S03 | Apply analytics date range filters and see resulting data counts |
| ADM-S04 | Under Analytics, choose a non-all date range, export CSV, open it in any spreadsheet application and check the results inside the file. |
| ADM-S05 | Under Audit Trail, use category/search filters and expand selected entries |
| ADM-S06 | Under Users tab, review role summaries and use search/filter features |
| ADM-S07 | Change a user role and confirm the change is reflected after refresh or re-login |
| ADM-S08 | Confirm that recent admin actions (e.g. "User Role Changed") appear in Audit Trail with matching actor, action, time, and target details |
| ADM-S09 | Under Manage tab, access some staff-level functions under staff dashboard. Just explore. |
| ADM-S10 | In Equipments/Rooms pages, confirm create/edit/delete features are visible for admin access (execution optional) |

## 12. Detailed UAT Test Cases

### 12.1 Student/Requester Test Cases

| ID | Test Case | Preconditions | Steps | Expected Outcome | Result | Issue ID |
| --- | --- | --- | --- | --- | --- | --- |
| ST-01 | Register a requester account | Participant has unused test email; email delivery or verification bypass is available | Open Register; enter email, password, confirm password, and user category; submit; verify email if required | Account is created as regular user; success or verification instruction appears; user can later log in |  |  |
| ST-02 | Log in as requester | Requester test account exists | Open Login; enter email and password; submit | User is redirected to the authenticated area; navigation shows Book Now and My Bookings; staff/admin links are hidden |  |  |
| ST-03 | Recover password | Requester account exists; email delivery/log access is available | Open Forgot Password; enter email; submit; open reset link if available; set new password | Reset request succeeds; reset page accepts matching new password; user can log in with new password |  |  |
| ST-04 | Browse and filter equipment | At least two equipment records exist | Open Equipment; search by name/category/description; filter by status/category; clear filters | Matching equipment appears; empty states are understandable; clear filters restores list |  |  |
| ST-05 | Browse and filter rooms | At least two room records exist | Open Rooms; search by name/location/description; filter by status/location; clear filters | Matching rooms appear; capacity, status, and location are visible |  |  |
| ST-06 | Inspect resource detail and availability | User is logged in; resource is available or in-use | Open one equipment or room detail; inspect description/status; view embedded calendar; click Book this Equipment/Room | Detail data is clear; calendar loads availability; booking form opens with resource prefilled |  |  |
| ST-07 | Use facility calendar to start booking | User is logged in; calendar has resource data | Open Calendar; select resource type and specific resource; click/drag an available schedule | Booking form opens with selected date/time and resource query parameters prefilled |  |  |
| ST-08 | Create a pencil booking | Resource is available/in-use; schedule starts more than 24 hours later | On Booking Form, select resource, Pencil, start/end time, purpose; submit | Booking is created with `penciled` status; success message shows booking reference/status; booking appears in My Bookings Active |  |  |
| ST-09 | Create a firm booking with complete details | Resource is available/in-use; valid authorization document is ready; schedule starts more than 24 hours later | On Booking Form, select Firm; upload authorization document; set start/end time and purpose; submit | Firm booking is submitted successfully with `pending_approval` status and appears in My Bookings Active |  |  |
| ST-11 | Submit equipment booking using in-house and loan request types | Requester is creating an equipment booking | Create one booking with `in_house`; create another with `loan` and complete loan details; submit each | Both request types can be submitted successfully; selected request type and details are preserved in booking records |  |  |
| ST-12 | Submit room booking with complete room request details | Requester is creating a room booking | Complete participant count, equipment needs, setup requirements, and program details; submit | Room booking is submitted successfully and room request details are visible in booking review/history |  |  |
| ST-15 | Handle own pencil overlap confirmation | User already has an active pencil booking for same resource/time | Create a firm booking overlapping own active pencil; read confirmation; confirm | System explains own overlap; on confirmation, firm request is created and own overlapping pencil is cancelled when applicable |  |  |
| ST-16 | Handle foreign pencil overlap/contention | Two requester accounts and overlapping pencil data are prepared | As second requester, create overlapping pencil booking; read contention notice; confirm or cancel | System explains defender/challenger contention; confirmed booking reflects contention role/status; cancel returns user to form |  |  |
| ST-17 | View My Bookings filters and status groups | Requester has active and/or past bookings | Open My Bookings; switch Active/Past tabs; search; filter by status/resource type; change sort | Correct bookings appear under expected status groups; no unrelated user bookings are visible |  |  |
| ST-18 | Cancel an eligible booking with complete details | Requester owns active booking that has not started | From My Bookings, open Cancel; set probable rebook date; submit | Cancellation succeeds and booking moves to Past with cancellation metadata shown |  |  |
| ST-19 | Convert eligible pencil to firm | Requester owns eligible pencil; auth document is ready or already attached | Open Convert panel; enter/update purpose; upload document if needed; submit | Pencil becomes firm request with `pending_approval`; requester receives success message; challenger conversion is blocked if applicable |  |  |
| ST-20 | Rebook eligible past booking | Requester has cancelled, denied, expired, displaced, or completed booking with `canRebook` eligibility | Open Past tab; click Rebook; adjust schedule/purpose if needed; submit | Booking form is prefilled from source booking; new booking is created; previous attempt relationship/change summary appears for staff review |  |  |
| ST-22 | Verify restricted access | User is logged in as regular requester | Attempt to open `/staff` and `/admin` directly | User is redirected away from restricted pages; no staff/admin data is exposed |  |  |

### 12.2 PTCF Staff Test Cases

| ID | Test Case | Preconditions | Steps | Expected Outcome | Result | Issue ID |
| --- | --- | --- | --- | --- | --- | --- |
| STF-01 | Log in as PTCF staff | Staff account exists | Log in; open navigation Manage menu; select Staff Dashboard | Staff Dashboard loads; Admin Panel link is hidden unless account is also system admin |  |  |
| STF-02 | Review pending approvals | At least one firm booking is `pending_approval` | Open Staff Dashboard; use Pending Approvals tab; search/filter by resource type, requester category, start window, and sort; open `View Details` on a booking | Pending firm requests display booking reference, requester, schedule, resource, status, and authorization document. `View Details` shows purpose, room/loan request details, rebook change summary (when applicable), and history timeline. |  |  |
| STF-03 | Approve valid firm booking | Pending firm starts more than 24 hours later | Open booking review area; optionally enter staff remark; click Approve | Booking becomes `approved`; approved staff/time are recorded; it appears in Approved Bookings; overlapping pencils are displaced when applicable |  |  |
| STF-04 | Deny firm booking | Pending firm exists | Open booking review area; enter reason or staff remark; click Deny | Booking becomes `denied`; denied staff/time and remark are recorded; affected on-hold pencils are rebuilt when applicable |  |  |
| STF-05 | Verify approval cutoff behavior | Pending firm starts within 24 hours | Open the pending booking in Staff Dashboard | Approve is disabled or blocked; message explains 24-hour approval cutoff; Deny remains available if applicable |  |  |
| STF-06 | Review authorization document | Pending or approved firm has document URL | Click View Authorization Doc | Document preview or link opens; staff can return to dashboard without losing context |  |  |
| STF-07 | Review denied-source resubmission | A requester rebooked from a denied booking | Open Resubmissions tab/queue; inspect `View Details`, previous denial context, and change summary | Staff can see source denied context, changed fields (schedule, purpose, document), room/loan request details, and history timeline before deciding approve/deny. |  |  |
| STF-08 | Review active conflicts | Two requester pencil bookings are in active contention | Open Active conflicts tab; inspect defender/challenger cards | Dashboard shows contention window, defender/challenger summary cards (email, reference, status, request type, and time ranges), defender deadline chip, and overlap window; no approve/deny controls are offered for pencil contention. |  |  |
| STF-09 | Review approved bookings | At least one approved booking exists | Open Approved Bookings; filter by resource type, requester category, approved date range, staff remark, and approver; open `View Details` | Correct approved bookings appear; approved by/at and authorization document are visible. `View Details` shows purpose, room/loan request details, history timeline, and cancellation metadata when present. |  |  |
| STF-10 | Verify request-type details are visible in staff review | Pending/approved bookings include room and loan request types | Open `View Details` in Pending, Resubmissions, and Approved tabs | Staff can view room request details (participant count/equipment/setup/program) and equipment loan details (reason/workflow/transport) in review surfaces |  |  |
| STF-11 | Create equipment record | Staff is logged in; test image optional | Open Equipment; click Add Equipment; enter name, category, description, status, optional image; save | New equipment appears in list/detail; status badge and image behavior are correct |  |  |
| STF-12 | Edit equipment record | Test equipment exists | Edit equipment; update category/status/description/image; save | Equipment data updates; filters/detail reflect changes |  |  |
| STF-13 | Delete equipment record | Test equipment is safe to delete | Click delete; confirm | Equipment is removed or no longer appears; confirmation prevents accidental deletion |  |  |
| STF-14 | Create room record | Staff is logged in; test image optional | Open Rooms; click Add Room; enter name, location, capacity, description, status, optional image; save | New room appears in list/detail; capacity/location/status are visible |  |  |
| STF-15 | Edit room record | Test room exists | Edit room; update location/capacity/status/description/image; save | Room data updates; filters/detail reflect changes |  |  |
| STF-16 | Delete room record | Test room is safe to delete | Click delete; confirm | Room is removed or no longer appears; confirmation prevents accidental deletion |  |  |
| STF-17 | Verify admin restriction | Staff is not system admin | Attempt to open `/admin` directly | Staff user is redirected away; admin user list/analytics are not exposed |  |  |

### 12.3 System Administrator Test Cases

| ID | Test Case | Preconditions | Steps | Expected Outcome | Result | Issue ID |
| --- | --- | --- | --- | --- | --- | --- |
| ADM-01 | Log in as system admin | System admin account exists | Log in; open Manage menu; select Admin Panel | Admin Panel loads with `Analytics`, `Audit Trail`, and `Users` tabs |  |  |
| ADM-02 | Verify Admin Panel tabs | Admin is on Admin Panel | Switch across Analytics, Audit Trail, and Users tabs | All tabs load expected content and maintain stable navigation state |  |  |
| ADM-03 | View analytics | Booking lifecycle events exist or test events are generated | Open Analytics tab; click Refresh | Total events and counts by event type, status, resource type, and booking type load correctly |  |  |
| ADM-04 | Apply analytics range filters | Analytics data spans multiple dates | In Analytics tab, test `all`, `today`, `last_7_days`, `last_30_days`, and `custom` ranges | Counts and totals update according to selected range; custom range validates start/end date behavior |  |  |
| ADM-05 | Export analytics CSV | Analytics data exists | Click Export CSV from Analytics tab | CSV downloads successfully and includes report header, summary, grouped counts, and bookings-by-resource sections |  |  |
| ADM-06 | Review Audit Trail entries | Audit logs exist | Open Audit Trail tab; filter by category; search by actor/target/terms; expand one booking event and one user role event | Filter/search/expand behavior works; expanded rows show meaningful booking/user audit detail fields |  |  |
| ADM-07 | Search users and inspect counts | Multiple users exist | Open Users tab; review role count cards; search by email | User list filters correctly; user email, category, role, and joined date are understandable |  |  |
| ADM-08 | Promote/demote test user role | Non-self regular or staff test user exists | Change user role using role dropdown; confirm role change | Role changes to selected value; user gains/loses corresponding navigation/access after re-login or refresh |  |  |
| ADM-09 | Prevent self role change | Admin is viewing own row | Attempt to change own role | Role control is disabled or system rejects action; admin remains system admin |  |  |
| ADM-10 | Delete non-self test user | Disposable test user exists | Click delete icon; confirm | Account is removed from user list; deletion confirmation prevents accidental action |  |  |
| ADM-11 | Prevent self deletion | Admin is viewing own row | Attempt to delete own account | Delete action is disabled or rejected; account remains active |  |  |
| ADM-12 | Access staff-level functions | Admin is logged in | Open Staff Dashboard; inspect pending approvals/approved bookings | Admin can use staff dashboard because `system_admin` is staff-authorized |  |  |
| ADM-13 | Manage resources as admin | Admin is logged in | Create/edit/delete a test room or equipment record | Admin can perform same resource management actions as staff |  |  |

## 13. UAT Result Recording Table

Use one row per participant per test case.

| Participant ID | Role | Test Case ID | Session Mode (Live/Async) | Result (Pass/Partial/Fail/Not Tested) | Time Taken | Assistance Given? | Evidence Link/Screenshot Ref | Issue ID | Notes/Observed Behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 |  |  |  |  |  |  |  |  |  |
| P02 |  |  |  |  |  |  |  |  |  |
| P03 |  |  |  |  |  |  |  |  |  |

## 14. Issue Log

| Issue ID | Date Found | Role | Test Case ID | Severity | Description | Actual Result | Expected Result | Screenshot/Reference | Recommended Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-001 |  |  |  |  |  |  |  |  |  | Open |
| UAT-002 |  |  |  |  |  |  |  |  |  | Open |

## 15. Participant Feedback Questions

Ask these after the task set. These are qualitative UAT questions and may be followed by SUS.

### 15.1 Requester Feedback

1. Which task was easiest to complete?
2. Which task was hardest or most confusing?
3. Were the differences between Pencil and Firm booking clear?
4. Were booking status labels such as Pending Approval, On Hold, Displaced, and Approved understandable?
5. Were conflict, overlap, or contention messages clear enough to help you decide what to do?
6. Was the authorization document requirement clear?
7. What information did you expect to see but could not find?
8. Would you be comfortable using this system for an actual PTCF reservation? Why or why not?

### 15.2 Staff Feedback

1. Does the Staff Dashboard support how you would review real PTCF booking requests?
2. Are the pending approval details sufficient for approval or denial?
3. Are staff remarks, authorization documents, previous attempts, and rebook changes easy to inspect?
4. Are filters and sorting useful for prioritizing requests near the 24-hour cutoff?
5. Are contention and on-hold explanations aligned with how staff should communicate with users?
6. Are the room/equipment management fields sufficient for PTCF records?
7. What would slow down daily staff use?
8. What must be improved before official use?

### 15.3 Admin Feedback

1. Are the user management actions clear and safe?
2. Are role labels and consequences understandable?
3. Are analytics filters and CSV export useful and understandable for reporting needs?
4. Is the Audit Trail easy to use for searching and interpreting booking and user role events?
5. What additional administrative information would help system monitoring?
6. Are self-protection restrictions clear enough?

## 16. Post-UAT Summary Template

Use this section after testing is complete.

### 16.1 Participant Summary

| Role | Number Invited | Number Completed | Notes |
| --- | ---: | ---: | --- |
| Student/requester |  |  |  |
| PTCF staff |  |  |  |
| System administrator |  |  |  |
| Total |  |  |  |

### 16.2 Task Completion Summary

| Role | Test Cases Executed | Passed | Partial | Failed | Not Tested | Pass Rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Student/requester |  |  |  |  |  |  |
| PTCF staff |  |  |  |  |  |  |
| System administrator |  |  |  |  |  |  |
| Overall |  |  |  |  |  |  |

### 16.3 Issue Summary

| Severity | Count | Summary |
| --- | ---: | --- |
| Major |  |  |
| Moderate |  |  |
| Minor |  |  |

### 16.4 Key Findings

1. 
2. 
3. 

### 16.5 Improvements Applied Or Recommended

| Issue ID | Improvement | Applied Before Final? | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

### 16.6 UAT Decision

UAT decision: Passed / Conditionally Passed / Failed

Decision basis:

1. 
2. 
3. 

Remaining risks:

1. 
2. 
3. 

## 17. Evidence To Attach

Attach or reference the following evidence in the capstone appendix or evaluation section:

1. Completed participant task sheets.
2. Completed UAT result recording table.
3. Issue log with screenshots where applicable.
4. Sample booking confirmation/status screenshots.
5. Staff approval/denial screenshots.
6. Admin analytics/user management screenshots.
7. Email or event-log evidence for booking lifecycle notifications where available.
8. Final UAT summary and decision.
9. Remote participant submission form exports (or equivalent response sheets).
10. Production cleanup log (what was reset, by whom, and when).

## 18. Notes For Academic Write-Up

For the capstone paper, UAT may be described as a role-based acceptance test conducted with representative users of the PTCF Reservation System. The evaluation should report:

1. Participant profile by role.
2. Number of UAT tasks executed.
3. Task completion rate.
4. Major issues found and how they were addressed.
5. Qualitative participant feedback.
6. Whether the system satisfied requester, staff, and administrator acceptance criteria.

The UAT results should be discussed separately from SUS results. UAT establishes whether users can complete required workflows, while SUS measures perceived usability after participants have used the system.
