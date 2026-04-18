const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

const STAFF_EMAIL = 'staff@uplb.edu.ph';
const STAFF_PASSWORD = 'staff123';
const STUDENT_EMAIL = 'student@uplb.edu.ph';
const STUDENT_PASSWORD = 'password123';

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return res.data.token;
}

async function testMilestone11() {
  console.log('=== MILESTONE 11 VERIFICATION TEST ===');
  console.log('Staff Dashboard: Pending Approvals + Pencil contention awareness\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    return;
  }

  let staffToken, studentToken;

  // ── Authentication ────────────────────────────────────────────────────────
  console.log('--- Authentication ---');
  try {
    staffToken = await login(STAFF_EMAIL, STAFF_PASSWORD);
    pass('Staff login successful');
  } catch (e) {
    fail('Staff login', e.message);
    console.log('\n❌ Cannot proceed without staff token');
    return;
  }

  try {
    studentToken = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
    pass('Student login successful');
  } catch (e) {
    fail('Student login', e.message);
  }

  const staffHeaders = { Authorization: `Bearer ${staffToken}` };
  const studentHeaders = { Authorization: `Bearer ${studentToken}` };

  // ── GET /bookings?status=pending_approval (staff) ─────────────────────────
  console.log('\n--- Pending Approvals Queue ---');
  let pendingBookings = [];
  try {
    const res = await axios.get(`${BASE_URL}/bookings?status=pending_approval`, {
      headers: staffHeaders,
    });
    pendingBookings = res.data;
    if (Array.isArray(res.data)) {
      pass(`Staff can fetch pending_approval bookings (${res.data.length} found)`);
    } else {
      fail('Expected array response for pending_approval bookings');
    }
  } catch (e) {
    fail('Fetch pending_approval bookings', e.response?.data?.error || e.message);
  }

  // ── GET /bookings?status=pending_approval blocked for regular user ─────────
  try {
    const res = await axios.get(`${BASE_URL}/bookings?status=pending_approval`, {
      headers: studentHeaders,
    });
    // Regular users get their own bookings — should be empty or scoped
    if (Array.isArray(res.data)) {
      pass('Regular user can call /bookings (scoped to own bookings)');
    } else {
      fail('Unexpected response for student bookings list');
    }
  } catch (e) {
    fail('Student bookings list', e.response?.data?.error || e.message);
  }

  // ── GET /bookings?status=contested (staff) ────────────────────────────────
  console.log('\n--- Contested Bookings ---');
  let contestedBookings = [];
  try {
    const res = await axios.get(`${BASE_URL}/bookings?status=contested`, {
      headers: staffHeaders,
    });
    contestedBookings = res.data;
    if (Array.isArray(res.data)) {
      pass(`Staff can fetch contested bookings (${res.data.length} found)`);
    } else {
      fail('Expected array response for contested bookings');
    }
  } catch (e) {
    fail('Fetch contested bookings', e.response?.data?.error || e.message);
  }

  // ── GET /bookings/:id/conflicts (staff) ───────────────────────────────────
  console.log('\n--- GET /bookings/:id/conflicts Endpoint ---');

  // Find a booking to test with (any booking)
  let testBookingId = null;
  try {
    const res = await axios.get(`${BASE_URL}/bookings`, { headers: staffHeaders });
    if (res.data.length > 0) {
      testBookingId = res.data[0].id;
    }
  } catch (e) {
    // ignore
  }

  if (testBookingId) {
    try {
      const res = await axios.get(`${BASE_URL}/bookings/${testBookingId}/conflicts`, {
        headers: staffHeaders,
      });
      if (Array.isArray(res.data)) {
        pass(`GET /bookings/${testBookingId}/conflicts returns array (${res.data.length} conflicts)`);
      } else {
        fail('Expected array from conflicts endpoint');
      }
    } catch (e) {
      fail(`GET /bookings/${testBookingId}/conflicts`, e.response?.data?.error || e.message);
    }

    // Regular user should be blocked (403)
    try {
      await axios.get(`${BASE_URL}/bookings/${testBookingId}/conflicts`, {
        headers: studentHeaders,
      });
      fail('Regular user should be blocked from conflicts endpoint (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Regular user blocked from conflicts endpoint (403 Forbidden)');
      } else {
        fail('Unexpected error blocking regular user', e.response?.status);
      }
    }

    // Unauthenticated should be blocked (401)
    try {
      await axios.get(`${BASE_URL}/bookings/${testBookingId}/conflicts`);
      fail('Unauthenticated request should be blocked (expected 401)');
    } catch (e) {
      if (e.response?.status === 401) {
        pass('Unauthenticated request blocked (401 Unauthorized)');
      } else {
        fail('Unexpected error for unauthenticated conflicts request', e.response?.status);
      }
    }
  } else {
    console.log('  ⚠️  No bookings found to test conflicts endpoint — skipping');
  }

  // 404 for non-existent booking
  try {
    await axios.get(`${BASE_URL}/bookings/999999/conflicts`, { headers: staffHeaders });
    fail('Expected 404 for non-existent booking conflicts');
  } catch (e) {
    if (e.response?.status === 404) {
      pass('Non-existent booking returns 404 from conflicts endpoint');
    } else {
      fail('Unexpected status for non-existent booking', e.response?.status);
    }
  }

  // ── Approve / Deny endpoints (already exist, verify still working) ────────
  console.log('\n--- Approve/Deny Endpoints (Staff Only) ---');

  // Verify approve is staff-only
  if (testBookingId) {
    try {
      await axios.patch(
        `${BASE_URL}/bookings/${testBookingId}/approve`,
        { staffRemark: 'test' },
        { headers: studentHeaders }
      );
      fail('Regular user should not be able to approve bookings (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Regular user blocked from approve endpoint (403 Forbidden)');
      } else {
        fail('Unexpected status blocking regular user from approve', e.response?.status);
      }
    }

    // Verify deny is staff-only
    try {
      await axios.patch(
        `${BASE_URL}/bookings/${testBookingId}/deny`,
        { staffRemark: 'test' },
        { headers: studentHeaders }
      );
      fail('Regular user should not be able to deny bookings (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Regular user blocked from deny endpoint (403 Forbidden)');
      } else {
        fail('Unexpected status blocking regular user from deny', e.response?.status);
      }
    }
  }

  // ── Approve a pending_approval booking if one exists ─────────────────────
  if (pendingBookings.length > 0) {
    const target = pendingBookings[0];
    try {
      const res = await axios.patch(
        `${BASE_URL}/bookings/${target.id}/approve`,
        { staffRemark: 'Approved via milestone 11 test' },
        { headers: staffHeaders }
      );
      if (res.data.booking?.status === 'approved') {
        pass(`Staff approved booking #${target.id} with staffRemark`);
      } else {
        fail('Approve did not set status to approved', res.data.booking?.status);
      }
    } catch (e) {
      fail(`Approve booking #${target.id}`, e.response?.data?.error || e.message);
    }
  } else {
    console.log('  ⚠️  No pending_approval bookings to test approve action — skipping');
  }

  // ── GET /bookings?status=queued (staff) ───────────────────────────────────
  console.log('\n--- Queued pencil bookings ---');
  try {
    const res = await axios.get(`${BASE_URL}/bookings?status=queued`, {
      headers: staffHeaders,
    });
    if (Array.isArray(res.data)) {
      pass(`Staff can fetch queued pencil bookings (${res.data.length} found)`);
    } else {
      fail('Expected array response for queued bookings');
    }
  } catch (e) {
    fail('Fetch queued bookings', e.response?.data?.error || e.message);
  }

  // Contested pencils are no longer staff-deniable; optional sanity check
  if (contestedBookings.length > 0) {
    const target = contestedBookings[0];
    if (target.bookingType === 'pencil') {
      try {
        await axios.patch(
          `${BASE_URL}/bookings/${target.id}/deny`,
          { staffRemark: 'should fail' },
          { headers: staffHeaders }
        );
        fail('Deny on contested pencil should be rejected');
      } catch (e) {
        if (e.response?.status === 400) {
          pass('Staff deny rejected for contested pencil (automated contention)');
        } else {
          fail('Unexpected deny response for contested pencil', e.response?.status);
        }
      }
    }
  } else {
    console.log('  ⚠️  No contested bookings to test deny rejection — skipping');
  }

  // ── Frontend Manual Checklist ─────────────────────────────────────────────
  console.log('\n--- Manual UI Checklist (verify in browser at http://localhost:5173) ---');
  const checks = [
    'Login as staff@uplb.edu.ph — "Staff Dashboard" link appears in nav',
    'Login as student@uplb.edu.ph — "Staff Dashboard" link is NOT visible in nav',
    'Navigate to /staff as student — redirected to /dashboard',
    'Navigate to /staff as staff — page loads with tabs',
    '"Pending Approvals" tab shows badge count matching pending_approval bookings',
    '"Pencil contention" tab shows awareness list (contested + queued)',
    'Pending Approvals: each card shows requester email, resource, time range, booking type badge',
    'Pending Approvals: "Review" button toggles inline approve/deny panel',
    'Pending Approvals: staffRemark textarea present in review panel',
    'Pending Approvals: "Approve" (green) and "Deny" (red) buttons work and refresh list',
    'Pending Approvals: auth doc link visible when booking has authorizationDocUrl',
    'Pending Approvals: empty state shown when no pending bookings',
    'Pencil contention: informational cards only (no staff approve/deny for pencils)',
    'Refresh button reloads pending and contention watch lists',
  ];
  checks.forEach((c) => console.log(`  [ ] ${c}`));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Total automated: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (failed === 0) {
    console.log('\n🎉 All automated checks passed! Complete the manual UI checklist above.');
  } else {
    console.log('\n⚠️  Some automated checks failed. Review output above.');
  }
}

testMilestone11().catch(console.error);
