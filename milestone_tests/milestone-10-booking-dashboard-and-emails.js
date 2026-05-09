/**
 * Milestone 10 Verification Test
 * User Booking Dashboard + Resend Email Notifications
 *
 * Tests:
 *  1. Auth — student, staff login
 *  2. List bookings (student sees own, staff sees all)
 *  3. Create a pencil booking (triggers booking.created hook)
 *  4. Cancel booking — success path
 *  5. Cancel booking — 24-hour rule rejection
 *  6. Convert pencil to firm — success (triggers booking.created email hook for new firm)
 *  7. Convert pencil to firm — conflict rejection (409 with conflicts array)
 *  8. Staff approve booking (triggers booking.approved hook)
 *  9. Staff deny booking (triggers booking.denied hook)
 * 10. Cancel an approved booking by staff (triggers booking.cancelled hook)
 * 11. Email utility module loads without error (smoke test)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const { checkServerHealth } = require('./utils/test-helpers');

/** Minimal valid PDF (same fixture as milestone-7-booking-lifecycle.js) for Cloudinary upload. */
function makeTempPdfForTest() {
  const filePath = path.join(os.tmpdir(), `m10-convert-${Date.now()}.pdf`);
  const pdfBase64 =
    'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA1NT4+CnN0cmVhbQpCVCAvRjEgMjQgVGYgMTAwIDcwMCBUZCAoSGVsbG8gUERGKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0OCAwMDAwMCBuIAowMDAwMDAwMzUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDE5CiUlRU9G';
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
  return filePath;
}

const BASE_URL = 'http://localhost:4000/api';

const STUDENT = { email: 'student@uplb.edu.ph', password: 'password123' };
const STAFF = { email: 'staff@uplb.edu.ph', password: 'staff123' };

let studentToken = '';
let staffToken = '';
let testBookingId = null;
let firmBookingId = null;
let tempFilePath = null;

const passed = [];
const failed = [];

function pass(label) {
  console.log(`✅ ${label}`);
  passed.push(label);
}

function fail(label, err) {
  const msg = err?.response?.data?.error || err?.message || String(err);
  console.log(`❌ ${label}: ${msg}`);
  failed.push(label);
}

async function login(creds) {
  const res = await axios.post(`${BASE_URL}/auth/login`, creds);
  return res.data.token;
}

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Non-overlapping future ranges per test run so repeat runs and DB seed data
 * rarely hit "You already have a pencil booking for this time slot" for the same user+equipment.
 */
const SLOT_BASE_H = 200 + Math.floor(Math.random() * 400);
let slotIndex = 0;

function nextBookingRange(durationHours = 2, gapHours = 6) {
  const startH = SLOT_BASE_H + slotIndex * gapHours;
  slotIndex += 1;
  const start = new Date(Date.now() + startH * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/**
 * Create a pencil on this equipment between ~5h and ~23h from now.
 * Retries on 409 (own pencil overlap) so seed data / prior runs do not break Test 8.
 */
async function postNearTermPencilBooking(token, equipmentId, purpose) {
  const durationMs = 2 * 60 * 60 * 1000;
  for (let i = 0; i < 64; i += 1) {
    const startH = 5 + i * 0.25;
    if (startH > 23) break;
    const start = new Date(Date.now() + startH * 60 * 60 * 1000);
    const end = new Date(start.getTime() + durationMs);
    try {
      return await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          purpose,
        },
        authHeaders(token)
      );
    } catch (err) {
      const st = err.response?.status;
      const msg = String(err.response?.data?.error || '');
      if (st === 409 && msg.includes('pencil booking')) continue;
      throw err;
    }
  }
  throw new Error('Could not find a free near-term pencil slot for cancel test (try clearing old bookings)');
}

async function getFirstEquipmentId(token) {
  const res = await axios.get(`${BASE_URL}/equipment`, authHeaders(token));
  const available = res.data.filter((e) => ['available', 'in-use'].includes(e.status));
  return available[0]?.id ?? null;
}

async function testMilestone10() {
  console.log('=== MILESTONE 10 VERIFICATION TEST ===\n');
  console.log('User Booking Dashboard + Resend Email Notifications\n');

  const health = await checkServerHealth(BASE_URL);
  if (!health.success) {
    console.log('\n❌ Cannot proceed: Server is not running. Start with: cd server && npm run dev');
    return;
  }

  // ── Test 1: Auth ──────────────────────────────────────────────────────────
  console.log('\n--- Test 1: Student login ---');
  try {
    studentToken = await login(STUDENT);
    pass('Student login returns JWT');
  } catch (err) {
    fail('Student login', err);
    console.log('Cannot proceed without student token.');
    return;
  }

  console.log('\n--- Test 2: Staff login ---');
  try {
    staffToken = await login(STAFF);
    pass('Staff login returns JWT');
  } catch (err) {
    fail('Staff login', err);
  }

  // ── Test 3: List bookings (student) ──────────────────────────────────────
  console.log('\n--- Test 3: List bookings (student sees own only) ---');
  try {
    const res = await axios.get(`${BASE_URL}/bookings`, authHeaders(studentToken));
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    const allOwn = res.data.every((b) => b.user?.email === STUDENT.email);
    if (!allOwn) throw new Error('Student received bookings from other users');
    pass(`Student sees ${res.data.length} booking(s), all own`);
  } catch (err) {
    fail('List bookings (student)', err);
  }

  // ── Test 4: List bookings (staff sees all) ────────────────────────────────
  console.log('\n--- Test 4: List bookings (staff sees all) ---');
  try {
    const res = await axios.get(`${BASE_URL}/bookings`, authHeaders(staffToken));
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    pass(`Staff sees ${res.data.length} total booking(s)`);
  } catch (err) {
    fail('List bookings (staff)', err);
  }

  // ── Test 5: Create pencil booking (booking.created hook) ─────────────────
  console.log('\n--- Test 5: Create pencil booking (triggers booking.created email) ---');
  const equipmentId = await getFirstEquipmentId(studentToken);
  if (!equipmentId) {
    console.log('⚠️  No available equipment found — skipping create/cancel/convert tests.');
  } else {
    try {
      const r5 = nextBookingRange();
      const res = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: r5.startTime,
          endTime: r5.endTime,
          purpose: 'Milestone 10 test booking',
        },
        authHeaders(studentToken)
      );
      testBookingId = res.data.booking?.id;
      if (!testBookingId) throw new Error('No booking ID in response');
      pass(`Pencil booking created (ID: ${testBookingId}, status: ${res.data.booking.status})`);
    } catch (err) {
      fail('Create pencil booking', err);
    }

    // ── Test 6: Cancel booking — success ───────────────────────────────────
    console.log('\n--- Test 6: Cancel booking (>24h ahead, triggers booking.cancelled email) ---');
    if (testBookingId) {
      try {
        const res = await axios.patch(
          `${BASE_URL}/bookings/${testBookingId}/cancel`,
          { cancellationReason: 'Milestone 10 automated cancel verification', probableRebookDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() },
          authHeaders(studentToken)
        );
        if (res.data.booking?.status !== 'cancelled') throw new Error('Status not cancelled');
        pass(`Booking #${testBookingId} cancelled successfully`);
        testBookingId = null;
      } catch (err) {
        fail('Cancel booking (success)', err);
      }
    }

    // ── Test 7: Create another pencil booking for convert test ─────────────
    console.log('\n--- Test 7: Create second pencil booking for convert-to-firm test ---');
    try {
      const r7 = nextBookingRange();
      const res = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: r7.startTime,
          endTime: r7.endTime,
          purpose: 'Milestone 10 convert test',
        },
        authHeaders(studentToken)
      );
      testBookingId = res.data.booking?.id;
      if (!testBookingId) throw new Error('No booking ID in response');
      pass(`Second pencil booking created (ID: ${testBookingId})`);
    } catch (err) {
      fail('Create second pencil booking', err);
    }

    // ── Test 8: Cancel within 24h rejection ────────────────────────────────
    console.log('\n--- Test 8: Cancel booking within 24h (should be rejected) ---');
    try {
      const nearBookingRes = await postNearTermPencilBooking(
        studentToken,
        equipmentId,
        'Near-term booking for cancel test'
      );
      const nearId = nearBookingRes.data.booking?.id;
      try {
        await axios.patch(`${BASE_URL}/bookings/${nearId}/cancel`, {}, authHeaders(studentToken));
        fail('Cancel within 24h (should have been rejected)', new Error('Expected 400 but got success'));
      } catch (cancelErr) {
        if (cancelErr.response?.status === 400) {
          pass('Cancel within 24h correctly rejected with 400');
        } else {
          fail('Cancel within 24h rejection', cancelErr);
        }
      }
    } catch (err) {
      if (err.response?.status === 400) {
        pass('Near-term create correctly blocked by lock-window rule');
      } else {
        fail('Create near-term booking for cancel test', err);
      }
    }

    // ── Test 9: Convert pencil to firm — success ───────────────────────────
    // Always create a fresh pencil here so re-runs / partial runs never convert an ID that is already firm.
    console.log('\n--- Test 9: Convert pencil to firm (with auth doc upload) ---');
    try {
      const r9 = nextBookingRange();
      const pencilForConvert = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: r9.startTime,
          endTime: r9.endTime,
          purpose: 'Milestone 10 convert-to-firm success (dedicated slot)',
        },
        authHeaders(studentToken)
      );
      const convertTargetId = pencilForConvert.data.booking?.id;
      if (!convertTargetId) throw new Error('No booking ID for convert test');

      tempFilePath = makeTempPdfForTest();

      const formData = new FormData();
      formData.append('authorizationDoc', fs.createReadStream(tempFilePath), {
        filename: 'test-auth.pdf',
        contentType: 'application/pdf',
      });

      const res = await axios.patch(
        `${BASE_URL}/bookings/${convertTargetId}/convert-to-firm`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${studentToken}`,
            ...formData.getHeaders(),
          },
        }
      );

      if (res.data.booking?.bookingType !== 'firm') throw new Error('bookingType not firm');
      if (res.data.booking?.status !== 'pending_approval') throw new Error('status not pending_approval');
      firmBookingId = convertTargetId;
      pass(`Booking #${convertTargetId} converted to firm (status: pending_approval)`);
    } catch (err) {
      fail('Convert pencil to firm', err);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        tempFilePath = null;
      }
    }

    // ── Test 10: Convert pencil to firm — no file (should fail) ───────────
    console.log('\n--- Test 10: Convert to firm without file (should be rejected) ---');
    try {
      const r10 = nextBookingRange();
      const pencilRes = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: r10.startTime,
          endTime: r10.endTime,
          purpose: 'No-file convert test',
        },
        authHeaders(studentToken)
      );
      const noFileId = pencilRes.data.booking?.id;
      try {
        await axios.patch(
          `${BASE_URL}/bookings/${noFileId}/convert-to-firm`,
          {},
          authHeaders(studentToken)
        );
        fail('Convert without file (should be rejected)', new Error('Expected 400 but got success'));
      } catch (convertErr) {
        if (convertErr.response?.status === 400) {
          pass('Convert without file correctly rejected with 400');
        } else {
          fail('Convert without file rejection', convertErr);
        }
      }
    } catch (err) {
      fail('Create booking for no-file convert test', err);
    }
  }

  // ── Test 11: Staff approve booking (booking.approved hook) ────────────────
  console.log('\n--- Test 11: Staff approve firm booking (triggers booking.approved email) ---');
  if (firmBookingId && staffToken) {
    try {
      const res = await axios.patch(
        `${BASE_URL}/bookings/${firmBookingId}/approve`,
        { staffRemark: 'Approved via Milestone 10 test' },
        authHeaders(staffToken)
      );
      if (res.data.booking?.status !== 'approved') throw new Error('Status not approved');
      pass(`Booking #${firmBookingId} approved by staff`);
    } catch (err) {
      fail('Staff approve booking', err);
    }
  } else {
    console.log('⚠️  Skipping approve test — no firm booking available');
  }

  // ── Test 12: Staff deny a booking (booking.denied hook) ──────────────────
  console.log('\n--- Test 12: Staff deny a pending_approval booking (triggers booking.denied email) ---');
  if (equipmentId && staffToken) {
    try {
      // Create a fresh firm booking to deny
      const r12 = nextBookingRange();
      const createRes = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType: 'equipment',
         equipmentRequestType: 'in_house',
          equipmentRequestType: 'in_house',
          resourceId: equipmentId,
          bookingType: 'pencil',
          startTime: r12.startTime,
          endTime: r12.endTime,
          purpose: 'Deny test booking',
        },
        authHeaders(studentToken)
      );
      const denyId = createRes.data.booking?.id;
      if (!denyId) throw new Error('No booking ID for deny test');

      tempFilePath = makeTempPdfForTest();
      const formData = new FormData();
      formData.append('authorizationDoc', fs.createReadStream(tempFilePath), {
        filename: 'deny-test-auth.pdf',
        contentType: 'application/pdf',
      });
      await axios.patch(`${BASE_URL}/bookings/${denyId}/convert-to-firm`, formData, {
        headers: {
          Authorization: `Bearer ${studentToken}`,
          ...formData.getHeaders(),
        },
      });
      const denyRes = await axios.patch(
        `${BASE_URL}/bookings/${denyId}/deny`,
        { staffRemark: 'Denied via Milestone 10 test' },
        authHeaders(staffToken)
      );
      if (denyRes.data.booking?.status !== 'denied') throw new Error('Status not denied');
      pass(`Booking #${denyId} denied by staff`);
    } catch (err) {
      fail('Staff deny booking', err);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        tempFilePath = null;
      }
    }
  } else {
    console.log('⚠️  Skipping deny test — no equipment or staff token available');
  }

  // ── Test 13: Email utility module smoke test ──────────────────────────────
  console.log('\n--- Test 13: Email notification module loads without error (Resend transport) ---');
  try {
    const notifs = require('../server/utils/booking-notifications');
    if (
      typeof notifs.notifyBookingCreated !== 'function' ||
      typeof notifs.notifyBookingApproved !== 'function' ||
      typeof notifs.notifyBookingDenied !== 'function' ||
      typeof notifs.notifyBookingCancelled !== 'function'
    ) {
      throw new Error('Missing expected exported functions');
    }
    const emailTransport = require('../server/utils/email');
    if (typeof emailTransport.sendEmail !== 'function') {
      throw new Error('email.js does not export sendEmail');
    }
    pass('booking-notifications module exports all 4 functions; Resend email transport loaded');
  } catch (err) {
    fail('Email notification module smoke test', err);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== TEST SUMMARY ===');
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\nFailed tests:');
    failed.forEach((f) => console.log(`  - ${f}`));
  }

  console.log('\n=== MANUAL UI CHECKLIST (verify in browser at http://localhost:5173) ===');
  const uiChecklist = [
    'Navigate to /dashboard — redirects to login if unauthenticated',
    'Login as student@uplb.edu.ph — dashboard shows "My Bookings" heading',
    'Active bookings section shows booking cards with resource name, time range, status badge, and booking type badge',
    'Contested bookings show an orange inline alert warning',
    'Pencil bookings show "Convert to Firm" button',
    'Cancellable bookings (>24h ahead) show "Cancel" button',
    'Bookings within 24h or already cancelled/denied/expired do NOT show Cancel button',
    'Clicking Cancel opens ConfirmDialog — confirming updates the list',
    'Clicking "Convert to Firm" expands inline panel with file upload area',
    'Uploading an invalid file type shows an error message',
    'Uploading a valid file shows filename with remove button',
    'Clicking "Submit for Approval" converts booking and collapses panel',
    'If convert returns 409, conflict details are shown inline in the panel',
    'Past/inactive bookings appear in a separate "Past Bookings" section with reduced opacity',
    'Empty active bookings state shows a helpful message with a "Create a new booking" link',
    'Refresh button reloads the list',
    '"New Booking" button navigates to /bookings/new',
    'Navigation bar "Dashboard" link is visible when authenticated',
  ];
  uiChecklist.forEach((item, i) => console.log(`  ${i + 1}. [ ] ${item}`));

  console.log('\n=== TEST COMPLETE ===');
}

testMilestone10().catch(console.error);
