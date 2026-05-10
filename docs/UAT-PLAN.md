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

1. The frontend is deployed or running locally.
2. The backend API is deployed or running locally.
3. The database contains at least two rooms and two equipment records with statuses `available` or `in-use`.
4. Test accounts exist for `regular_user`, `ptcf_staff`, and `system_admin`.
5. At least one test authorization document is prepared in PDF, DOC, DOCX, JPG, or PNG format and is below 5 MB.
6. Email sending is configured, or the evaluator has access to backend/Kafka/Resend logs to verify email-triggered events.
7. Test schedules are prepared more than 72 hours in the future to avoid the 24-hour lock window except where the cutoff rule is intentionally tested.
8. At least two requester accounts are available for overlap/contention scenarios.
9. Participants are told not to use confidential real reservation data during testing.
10. The evaluator has a blank issue log and result recording sheet.

## 7. Testing Environment

| Item | Target Environment |
| --- | --- |
| Frontend | React + Vite application, deployed on Vercel or local `http://localhost:5173` |
| Backend | Express API, deployed on Render or local `http://localhost:4000/api` |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth mode where configured; local legacy auth may be used in development |
| File storage | Cloudinary for room/equipment images and authorization document uploads |
| Email delivery | Resend, with Kafka notification consumer when Kafka is enabled |
| Event processing | Kafka/Aiven or local Docker Kafka when enabled; safe degraded behavior when disabled |
| Browser | Latest Chrome, Edge, or Firefox |
| Device | Prefer laptop/desktop for staff/admin; include at least one mobile-sized screen for requester browsing if feasible |

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

## 8. UAT Procedure

1. Brief the participant on the purpose of UAT.
2. Assign the participant role and test account.
3. Ask the participant to perform each task scenario without step-by-step coaching.
4. The observer records task result, errors, hesitations, questions, and comments.
5. If the participant is blocked for more than 3 minutes, the observer may provide minimal help and mark the task as Partial or Fail depending on the outcome.
6. After all tasks, ask the participant feedback questions.
7. After all participants finish, calculate task completion rates and classify issues by severity.
8. Decide whether the system passes UAT based on the criteria in Section 9.

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
| ST-S01 | Register or log in as a requester |
| ST-S02 | Browse equipment and rooms, then locate a suitable resource |
| ST-S03 | Open a resource detail page and inspect availability |
| ST-S04 | Use the facility calendar to start a booking |
| ST-S05 | Create a pencil booking |
| ST-S06 | Create a firm booking with an authorization document |
| ST-S07 | Respond to overlap/contention confirmation prompts |
| ST-S08 | Track booking status in My Bookings |
| ST-S09 | Cancel an eligible booking |
| ST-S10 | Convert an eligible pencil booking to a firm booking |
| ST-S11 | Rebook from an eligible past booking |
| ST-S12 | Select equipment request type and complete required request details |
| ST-S13 | Validate required loan metadata for equipment loan requests |
| ST-S14 | Validate required room request details for room requests |
| ST-S15 | Validate cancellation requires a probable rebook date |
| ST-S16 | Read guidelines and identify the meaning of key statuses |
| ST-S17 | Verify that staff/admin pages are inaccessible |

### 11.2 PTCF Staff Scenarios

| Scenario ID | Scenario |
| --- | --- |
| STF-S01 | Log in and access the Staff Dashboard |
| STF-S02 | Review pending firm booking requests |
| STF-S03 | Approve a valid firm booking with optional staff remark |
| STF-S04 | Deny a firm booking with staff remark |
| STF-S05 | Verify approval cutoff behavior for bookings inside 24 hours |
| STF-S06 | Review denied-source resubmissions |
| STF-S07 | Review active conflicts/contention without manually deciding winners |
| STF-S08 | Review approved bookings using filters |
| STF-S09 | Verify room/loan request details are visible in review surfaces |
| STF-S10 | Create, edit, and delete room/equipment records |
| STF-S11 | Verify that admin-only user management is inaccessible |

### 11.3 System Administrator Scenarios

| Scenario ID | Scenario |
| --- | --- |
| ADM-S01 | Log in and access Admin Panel |
| ADM-S02 | View booking event analytics |
| ADM-S03 | Verify Admin Panel tabs: Analytics, Audit Trail, and Users |
| ADM-S04 | Apply analytics date range filters |
| ADM-S05 | Export analytics CSV and verify report structure |
| ADM-S06 | View Audit Trail entries with category/search/expand behaviors |
| ADM-S07 | Search users and inspect role counts |
| ADM-S08 | Change a user role |
| ADM-S09 | Attempt self-protected role/delete actions |
| ADM-S10 | Delete a non-self test user |
| ADM-S11 | Confirm admin can access staff-level functions |

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
| ST-09 | Create a firm booking with document | Resource is available/in-use; valid auth document is ready; schedule starts more than 24 hours later | On Booking Form, select Firm; upload document; set start/end time and purpose; submit | Booking is created with `pending_approval` status; document is accepted; booking appears in My Bookings Active |  |  |
| ST-10 | Validate firm document requirement | User is on Booking Form | Select Firm; do not upload or reuse an authorization document; submit | System blocks submission and shows that authorization document is required |  |  |
| ST-11 | Validate 24-hour lock window | Prepared schedule starts within 24 hours | Attempt to create pencil or firm booking inside lock window | System rejects creation with clear lock-window message |  |  |
| ST-12 | Validate equipment request type selection | Requester is creating an equipment booking | Select resource type `equipment`; toggle `in_house` and `loan`; observe conditional fields | `in_house` and `loan` are selectable; loan-only fields appear only when `loan` is selected |  |  |
| ST-13 | Validate required loan metadata | Requester is creating `equipment` + `loan` booking | Leave one or more loan fields empty and submit; then complete all loan fields and submit | Incomplete `loan` submission is rejected with validation message; complete metadata submission succeeds |  |  |
| ST-14 | Validate required room request details | Requester is creating `room` booking | Leave one or more required room fields empty and submit; then complete all and submit | Incomplete room request is rejected; complete room request submits successfully |  |  |
| ST-15 | Handle own pencil overlap confirmation | User already has an active pencil booking for same resource/time | Create a firm booking overlapping own active pencil; read confirmation; confirm | System explains own overlap; on confirmation, firm request is created and own overlapping pencil is cancelled when applicable |  |  |
| ST-16 | Handle foreign pencil overlap/contention | Two requester accounts and overlapping pencil data are prepared | As second requester, create overlapping pencil booking; read contention notice; confirm or cancel | System explains defender/challenger contention; confirmed booking reflects contention role/status; cancel returns user to form |  |  |
| ST-17 | View My Bookings filters and status groups | Requester has active and/or past bookings | Open My Bookings; switch Active/Past tabs; search; filter by status/resource type; change sort | Correct bookings appear under expected status groups; no unrelated user bookings are visible |  |  |
| ST-18 | Validate cancel requires probable rebook date | Requester owns active booking that has not started | From My Bookings, open Cancel; submit without probable rebook date; submit with invalid date; then submit with valid date | Missing/invalid probable rebook date is rejected; valid date allows cancellation and moves booking to Past |  |  |
| ST-19 | Convert eligible pencil to firm | Requester owns eligible pencil; auth document is ready or already attached | Open Convert panel; enter/update purpose; upload document if needed; submit | Pencil becomes firm request with `pending_approval`; requester receives success message; challenger conversion is blocked if applicable |  |  |
| ST-20 | Rebook eligible past booking | Requester has cancelled, denied, expired, displaced, or completed booking with `canRebook` eligibility | Open Past tab; click Rebook; adjust schedule/purpose if needed; submit | Booking form is prefilled from source booking; new booking is created; previous attempt relationship/change summary appears for staff review |  |  |
| ST-21 | Read guidelines | Guidelines page is available | Open Guidelines; find booking types, authorization document rules, and status guide | Participant can correctly explain Pencil, Firm, Pending Approval, Approved, Denied, On Hold, Displaced |  |  |
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

| Participant ID | Role | Test Case ID | Result (Pass/Partial/Fail/Not Tested) | Time Taken | Assistance Given? | Issue ID | Notes/Observed Behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 |  |  |  |  |  |  |  |
| P02 |  |  |  |  |  |  |  |
| P03 |  |  |  |  |  |  |  |

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

## 18. Notes For Academic Write-Up

For the capstone paper, UAT may be described as a role-based acceptance test conducted with representative users of the PTCF Reservation System. The evaluation should report:

1. Participant profile by role.
2. Number of UAT tasks executed.
3. Task completion rate.
4. Major issues found and how they were addressed.
5. Qualitative participant feedback.
6. Whether the system satisfied requester, staff, and administrator acceptance criteria.

The UAT results should be discussed separately from SUS results. UAT establishes whether users can complete required workflows, while SUS measures perceived usability after participants have used the system.
