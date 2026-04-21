const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

const ADMIN_EMAIL = 'admin@uplb.edu.ph';
const ADMIN_PASSWORD = 'admin123';
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

async function testMilestone12() {
  console.log('=== MILESTONE 12 VERIFICATION TEST ===');
  console.log('Scheduled Jobs (node-cron) + Admin Panel\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    return;
  }

  let adminToken, staffToken, studentToken;

  // ── Authentication ────────────────────────────────────────────────────────
  console.log('--- Authentication ---');
  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('Admin login successful');
  } catch (e) {
    fail('Admin login', e.message);
    console.log('\n❌ Cannot proceed without admin token');
    return;
  }

  try {
    staffToken = await login(STAFF_EMAIL, STAFF_PASSWORD);
    pass('Staff login successful');
  } catch (e) {
    fail('Staff login', e.message);
  }

  try {
    studentToken = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
    pass('Student login successful');
  } catch (e) {
    fail('Student login', e.message);
  }

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const staffHeaders = staffToken ? { Authorization: `Bearer ${staffToken}` } : null;
  const studentHeaders = studentToken ? { Authorization: `Bearer ${studentToken}` } : null;

  // ── GET /admin/users ───────────────────────────────────────────────────────
  console.log('\n--- GET /admin/users ---');
  let users = [];
  try {
    const res = await axios.get(`${BASE_URL}/admin/users`, { headers: adminHeaders });
    users = res.data;
    if (Array.isArray(res.data) && res.data.length > 0) {
      pass(`Admin can list users (${res.data.length} users found)`);
      const hasExpectedFields = res.data[0].hasOwnProperty('email') &&
        res.data[0].hasOwnProperty('accountType') &&
        res.data[0].hasOwnProperty('userCategory');
      if (hasExpectedFields) {
        pass('User objects have expected fields (email, accountType, userCategory)');
      } else {
        fail('User objects missing expected fields');
      }
    } else {
      fail('Expected non-empty array from GET /admin/users');
    }
  } catch (e) {
    fail('GET /admin/users', e.response?.data?.error || e.message);
  }

  // Staff cannot access admin users
  if (staffHeaders) {
    try {
      await axios.get(`${BASE_URL}/admin/users`, { headers: staffHeaders });
      fail('Staff should not access /admin/users (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Staff blocked from /admin/users (403 Forbidden)');
      } else {
        fail('Unexpected status for staff on /admin/users', e.response?.status);
      }
    }
  }

  // Student cannot access admin users
  if (studentHeaders) {
    try {
      await axios.get(`${BASE_URL}/admin/users`, { headers: studentHeaders });
      fail('Student should not access /admin/users (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Student blocked from /admin/users (403 Forbidden)');
      } else {
        fail('Unexpected status for student on /admin/users', e.response?.status);
      }
    }
  }

  // Unauthenticated
  try {
    await axios.get(`${BASE_URL}/admin/users`);
    fail('Unauthenticated request should be blocked (expected 401)');
  } catch (e) {
    if (e.response?.status === 401) {
      pass('Unauthenticated request blocked (401)');
    } else {
      fail('Unexpected status for unauthenticated /admin/users', e.response?.status);
    }
  }

  // ── PATCH /admin/users/:id/role ────────────────────────────────────────────
  console.log('\n--- PATCH /admin/users/:id/role ---');

  // Find a regular_user to promote
  const regularUser = users.find(
    (u) => u.accountType === 'regular_user' && u.email !== ADMIN_EMAIL
  );

  if (regularUser) {
    try {
      const res = await axios.patch(
        `${BASE_URL}/admin/users/${regularUser.id}/role`,
        { accountType: 'ptcf_staff' },
        { headers: adminHeaders }
      );
      if (res.data.user?.accountType === 'ptcf_staff') {
        pass(`Admin promoted user #${regularUser.id} (${regularUser.email}) to ptcf_staff`);
      } else {
        fail('Role update did not reflect in response', res.data.user?.accountType);
      }

      // Restore original role
      await axios.patch(
        `${BASE_URL}/admin/users/${regularUser.id}/role`,
        { accountType: 'regular_user' },
        { headers: adminHeaders }
      );
      pass(`Restored user #${regularUser.id} back to regular_user`);
    } catch (e) {
      fail(`Promote user #${regularUser.id}`, e.response?.data?.error || e.message);
    }
  } else {
    console.log('  ⚠️  No regular_user found to test role promotion — skipping');
  }

  // Admin cannot change own role
  const adminUser = users.find((u) => u.email === ADMIN_EMAIL);
  if (adminUser) {
    try {
      await axios.patch(
        `${BASE_URL}/admin/users/${adminUser.id}/role`,
        { accountType: 'regular_user' },
        { headers: adminHeaders }
      );
      fail('Admin should not be able to change own role (expected 400)');
    } catch (e) {
      if (e.response?.status === 400) {
        pass('Admin blocked from changing own role (400)');
      } else {
        fail('Unexpected status for self-role-change', e.response?.status);
      }
    }
  }

  // Invalid role value
  if (regularUser) {
    try {
      await axios.patch(
        `${BASE_URL}/admin/users/${regularUser.id}/role`,
        { accountType: 'superuser' },
        { headers: adminHeaders }
      );
      fail('Invalid role should return 400');
    } catch (e) {
      if (e.response?.status === 400) {
        pass('Invalid accountType rejected (400)');
      } else {
        fail('Unexpected status for invalid role', e.response?.status);
      }
    }
  }

  // Non-existent user
  try {
    await axios.patch(
      `${BASE_URL}/admin/users/999999/role`,
      { accountType: 'ptcf_staff' },
      { headers: adminHeaders }
    );
    fail('Non-existent user should return 404');
  } catch (e) {
    if (e.response?.status === 404) {
      pass('Non-existent user returns 404 on role update');
    } else {
      fail('Unexpected status for non-existent user role update', e.response?.status);
    }
  }

  // ── DELETE /admin/users/:id ────────────────────────────────────────────────
  console.log('\n--- DELETE /admin/users/:id ---');

  // Admin cannot delete themselves
  if (adminUser) {
    try {
      await axios.delete(`${BASE_URL}/admin/users/${adminUser.id}`, {
        headers: adminHeaders,
      });
      fail('Admin should not be able to delete own account (expected 400)');
    } catch (e) {
      if (e.response?.status === 400) {
        pass('Admin blocked from deleting own account (400)');
      } else {
        fail('Unexpected status for self-delete', e.response?.status);
      }
    }
  }

  // Non-existent user
  try {
    await axios.delete(`${BASE_URL}/admin/users/999999`, { headers: adminHeaders });
    fail('Non-existent user should return 404 on delete');
  } catch (e) {
    if (e.response?.status === 404) {
      pass('Non-existent user returns 404 on delete');
    } else {
      fail('Unexpected status for non-existent user delete', e.response?.status);
    }
  }

  // Staff blocked from delete
  if (staffHeaders) {
    try {
      await axios.delete(`${BASE_URL}/admin/users/1`, { headers: staffHeaders });
      fail('Staff should not be able to delete users (expected 403)');
    } catch (e) {
      if (e.response?.status === 403) {
        pass('Staff blocked from DELETE /admin/users/:id (403)');
      } else {
        fail('Unexpected status for staff on delete', e.response?.status);
      }
    }
  }

  // ── Booking notifications module ───────────────────────────────────────────
  console.log('\n--- Booking Notifications Module ---');
  try {
    const notifications = require('../server/utils/booking-notifications');
    const required = [
      'notifyBookingCreated',
      'notifyBookingApproved',
      'notifyBookingDenied',
      'notifyBookingCancelled',
      'notifyBookingExpired',
      'notifyBookingExpiringSoon',
    ];
    const missing = required.filter((fn) => typeof notifications[fn] !== 'function');
    if (missing.length === 0) {
      pass('All 6 notification functions exported (including expired + expiringSoon)');
    } else {
      fail('Missing notification functions', missing.join(', '));
    }
  } catch (e) {
    console.log('  ⚠️  Cannot require server module from test — skipping module check');
  }

  // ── Cron job file exists ───────────────────────────────────────────────────
  console.log('\n--- Cron Job File ---');
  try {
    const fs = require('fs');
    const path = require('path');
    const cronPath = path.join(__dirname, '../server/jobs/booking-expiry.js');
    if (fs.existsSync(cronPath)) {
      pass('server/jobs/booking-expiry.js exists');
      const content = fs.readFileSync(cronPath, 'utf8');
      if (content.includes('node-cron') || content.includes('cron.schedule')) {
        pass('Cron job file uses node-cron');
      } else {
        fail('Cron job file does not reference node-cron');
      }
      if (content.includes('expired') && content.includes('expiryAt')) {
        pass('Expiry job logic present (status=expired, expiryAt check)');
      } else {
        fail('Expiry job logic missing');
      }
      if (content.includes('completed') && content.includes('approved') && content.includes('endTime')) {
        pass('Completed status job present (approved firm past endTime)');
      } else {
        fail('Completed booking job logic missing');
      }
      if (content.includes('notifyBookingExpiringSoon')) {
        pass('Warning email logic present (notifyBookingExpiringSoon)');
      } else {
        fail('Warning email logic missing');
      }
    } else {
      fail('server/jobs/booking-expiry.js not found');
    }
  } catch (e) {
    fail('Error checking cron job file', e.message);
  }

  // ── Manual UI Checklist ────────────────────────────────────────────────────
  console.log('\n--- Manual UI Checklist (verify in browser at http://localhost:5173) ---');
  const checks = [
    'Login as admin@uplb.edu.ph — "Admin Panel" link appears in nav',
    'Login as staff@uplb.edu.ph — "Admin Panel" link is NOT visible',
    'Login as student@uplb.edu.ph — "Admin Panel" link is NOT visible',
    'Navigate to /admin as student — redirected to /dashboard',
    'Navigate to /admin as staff — redirected to /dashboard',
    'Navigate to /admin as admin — page loads with user list',
    'Admin Panel: stats cards show counts for Regular User, PTCF Staff, System Admin',
    'Admin Panel: user list shows email, role badge, user category, joined date',
    'Admin Panel: search by email filters the list in real time',
    'Admin Panel: role dropdown changes role on select (confirm with refresh)',
    'Admin Panel: own row has disabled role dropdown and disabled delete button',
    'Admin Panel: delete button opens ConfirmDialog with user email in message',
    'Admin Panel: confirming delete removes user from list',
    'Admin Panel: Refresh button reloads user list',
    'Admin Panel: error banner shown on API failure',
    'Server console shows "[cron] Booking expiry jobs scheduled" on startup',
    'Server console shows "[cron:expire]" log when expiry job runs (check after 15min or test manually)',
  ];
  checks.forEach((c) => console.log(`  [ ] ${c}`));

  // ── Summary ────────────────────────────────────────────────────────────────
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

testMilestone12().catch(console.error);
