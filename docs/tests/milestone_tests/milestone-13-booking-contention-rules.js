const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const RESEARCHER1_EMAIL = 'researcher1@uplb.edu.ph';
const RESEARCHER2_EMAIL = 'researcher2@uplb.edu.ph';
const STUDENT_EMAIL = 'student@uplb.edu.ph';
const ADMIN_EMAIL = 'admin@uplb.edu.ph';
const PASSWORD = 'password123';
const ADMIN_PASSWORD = 'admin123';
const TEST_AUTH_DOC_URL = 'https://res.cloudinary.com/demo/milestone-13-test.pdf';

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

function section(title, description) {
  console.log(`\n--- ${title} ---`);
  if (description) console.log(`    ${description}`);
}

function printSummary() {
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Total automated: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    failed === 0
      ? '\n🎉 All booking-contention checks passed.'
      : '\n⚠️  Some booking-contention checks failed. Review the scenario output above.'
  );
}

function abortTest() {
  printSummary();
  process.exitCode = 1;
}

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return res.data.token;
}

function addHours(d, h) {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}

async function createBooking(headers, payload) {
  const res = await axios.post(`${BASE_URL}/bookings`, payload, { headers });
  return res.data.booking;
}

function buildBookingPayload(resourceType, resourceId, fields) {
  return {
    resourceType,
    resourceId,
    ...(resourceType === 'equipment' ? { equipmentRequestType: 'in_house' } : {}),
    ...fields,
  };
}

function cancellationPayload() {
  return {
    cancellationReason: 'Milestone 13 automated contention verification cleanup',
    probableRebookDate: addHours(new Date(), 24 * 14).toISOString(),
  };
}

async function getBooking(id, headers) {
  const res = await axios.get(`${BASE_URL}/bookings/${id}`, { headers });
  return res.data;
}

async function pickResource() {
  const [eqRes, rmRes] = await Promise.all([
    axios.get(`${BASE_URL}/equipment`),
    axios.get(`${BASE_URL}/rooms`)
  ]);
  const eq = Array.isArray(eqRes.data) ? eqRes.data.find((e) => ['available', 'in-use'].includes(e.status)) : null;
  const rm = Array.isArray(rmRes.data) ? rmRes.data.find((r) => ['available', 'in-use'].includes(r.status)) : null;
  if (eq) return { resourceType: 'equipment', resourceId: eq.id };
  if (rm) return { resourceType: 'room', resourceId: rm.id };
  throw new Error('No bookable resource found');
}

async function testMilestone13() {
  console.log('=== MILESTONE 13 VERIFICATION TEST ===');
  console.log('Booking Contention Rules: strict 1v1 conflicts, firm displacement, and recovery');
  console.log('This test creates isolated future bookings and verifies their lifecycle.\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    failed++;
    abortTest();
    return;
  }

  section('Authentication', 'Signing in the three booking participants and approving administrator.');
  let t1;
  let t2;
  let t3;
  let adminToken;
  try {
    t1 = await login(RESEARCHER1_EMAIL, PASSWORD);
    t2 = await login(RESEARCHER2_EMAIL, PASSWORD);
    t3 = await login(STUDENT_EMAIL, PASSWORD);
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('Login three users and an admin');
  } catch (e) {
    fail('Login', e.response?.data?.error || e.message);
    abortTest();
    return;
  }

  const h1 = { Authorization: `Bearer ${t1}` };
  const h2 = { Authorization: `Bearer ${t2}` };
  const h3 = { Authorization: `Bearer ${t3}` };
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  section('Resource Setup', 'Selecting an available resource and preparing a future time slot.');
  let resourceType;
  let resourceId;
  try {
    const picked = await pickResource();
    resourceType = picked.resourceType;
    resourceId = picked.resourceId;
    pass(`Using ${resourceType} id=${resourceId}`);
  } catch (e) {
    fail('Pick resource', e.message);
    abortTest();
    return;
  }

  // Choose a far, randomized future slot to avoid persistent bookings from prior runs.
  const baseStart = addHours(new Date(), 120 + Math.floor(Math.random() * (24 * 30)));
  const startA = baseStart;
  const endA = addHours(startA, 2);
  const startB = addHours(startA, 1);
  const endB = addHours(startB, 2);
  const startC = addHours(startA, 1.25);
  const endC = addHours(startC, 1.5);

  let bookingAId;
  let bookingBId;

  section('Scenario 1 — Strict 1v1 Pencil Contention', 'Create a defender and challenger, block a third entrant, then release the defender.');
  try {
    const resA = await createBooking(h1, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startA.toISOString(),
      endTime: endA.toISOString(),
      purpose: 'M13 strict-1v1 base'
    }));
    bookingAId = resA.id;
    pass('User1 creates base pencil');
  } catch (e) {
    fail('Create base pencil', e.response?.data?.error || e.message);
    abortTest();
    return;
  }

  try {
    const resB = await createBooking(h2, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startB.toISOString(),
      endTime: endB.toISOString(),
      purpose: 'M13 strict-1v1 challenger',
      confirmContention: true
    }));
    bookingBId = resB.id;
    const a = await getBooking(bookingAId, h1);
    const b = await getBooking(bookingBId, h2);
    if (a.contentionRole === 'defender' && b.contentionRole === 'challenger' && b.challengingBookingId === a.id) {
      pass('1v1 contention starts: defender/challenger set correctly');
    } else {
      fail('Unexpected 1v1 roles', `A=${a.contentionRole} B=${b.contentionRole} B->${b.challengingBookingId}`);
    }
  } catch (e) {
    fail('Create challenger pencil', e.response?.data?.error || e.message);
    abortTest();
    return;
  }

  try {
    await createBooking(h3, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startC.toISOString(),
      endTime: endC.toISOString(),
      purpose: 'M13 third entrant should be blocked',
      confirmContention: true
    }));
    fail('Expected hard reject on third overlapping entry');
  } catch (e) {
    if (e.response?.status === 409 && e.response?.data?.code === 'ACTIVE_CONTENTION_LOCKED') {
      pass('Third overlapping entry hard-rejected with ACTIVE_CONTENTION_LOCKED');
    } else {
      fail('Third entrant rejection mismatch', e.response?.data?.error || e.message);
    }
  }

  // challenger cancels -> both should be free pencils (defender released)
  try {
    await axios.patch(`${BASE_URL}/bookings/${bookingBId}/cancel`, cancellationPayload(), { headers: h2 });
    const aAfter = await getBooking(bookingAId, h1);
    if (aAfter.status === 'penciled' && aAfter.contentionRole == null) {
      pass('Challenger cancel releases defender back to free pencil');
    } else {
      fail('Defender not released after challenger cancel', `status=${aAfter.status} role=${aAfter.contentionRole}`);
    }
  } catch (e) {
    fail('Cancel challenger', e.response?.data?.error || e.message);
  }

  section(
    'Scenario 2 — Firm Approval and Displacement',
    'Create a second contention, approve an overlapping firm booking, then confirm the resulting lifecycle.'
  );
  const startD = addHours(baseStart, 24);
  const endD = addHours(startD, 8); // 8AM-4PM style long pencil
  const startE = addHours(startD, 1); // challenger window
  const endE = addHours(startD, 4);
  const startFirm = addHours(startD, 3); // overlaps D and E
  const endFirm = addHours(startD, 6);
  const startJ = addHours(startD, 0.5); // overlaps D only, not firm
  const endJ = addHours(startD, 2.5);

  let bookingDId;
  let bookingEId;
  let firmFId;
  let bookingJId;

  try {
    const d = await createBooking(h1, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startD.toISOString(),
      endTime: endD.toISOString(),
      purpose: 'M13 extended defender candidate'
    }));
    bookingDId = d.id;

    const e = await createBooking(h2, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startE.toISOString(),
      endTime: endE.toISOString(),
      purpose: 'M13 extended challenger',
      confirmContention: true
    }));
    bookingEId = e.id;

    const dAfter = await getBooking(bookingDId, h1);
    const eAfter = await getBooking(bookingEId, h2);
    if (dAfter.contentionRole === 'defender' && eAfter.contentionRole === 'challenger') {
      pass('Extended: 1v1 established before firm overlap hook');
    } else {
      fail('Extended: expected defender/challenger before firm', `D=${dAfter.contentionRole} E=${eAfter.contentionRole}`);
    }
  } catch (e) {
    fail('Extended: setup defender/challenger', e.response?.data?.error || e.message);
  }

  // Create and approve a firm booking so it displaces the foreign active pencil.
  try {
    const firm = await createBooking(h2, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'firm',
      startTime: startFirm.toISOString(),
      endTime: endFirm.toISOString(),
      purpose: 'M13 extended firm overlap auto-resolve',
      authorizationDocUrl: TEST_AUTH_DOC_URL,
      confirmOverlapOwn: true,
      confirmOverlapForeign: true
    }));
    firmFId = firm.id;
    await axios.patch(
      `${BASE_URL}/bookings/${firmFId}/approve`,
      { staffRemark: 'Milestone 13 automated firm-blocker verification' },
      { headers: adminHeaders }
    );

    const dAfterFirm = await getBooking(bookingDId, h1);
    const eAfterFirm = await getBooking(bookingEId, h2);
    if (dAfterFirm.status === 'displaced' && dAfterFirm.contentionRole == null) {
      pass('Extended: defender is displaced after the overlapping firm is approved');
    } else {
      fail('Extended: defender displacement mismatch', `status=${dAfterFirm.status} role=${dAfterFirm.contentionRole}`);
    }
    if (eAfterFirm.status === 'cancelled' || eAfterFirm.status === 'on_hold' || eAfterFirm.status === 'penciled') {
      pass('Extended: challenger resolved when own-overlap firm is created');
    } else {
      fail('Extended: challenger resolution unexpected', `status=${eAfterFirm.status}`);
    }
  } catch (e) {
    fail('Extended: create firm over active contention', e.response?.data?.error || e.message);
  }

  // A displaced pencil is non-blocking, so another user can book D's former slot.
  try {
    const j = await createBooking(h3, buildBookingPayload(resourceType, resourceId, {
      bookingType: 'pencil',
      startTime: startJ.toISOString(),
      endTime: endJ.toISOString(),
      purpose: 'M13 extended free pencil while defender is on_hold'
    }));
    bookingJId = j.id;
    pass('Extended: created free pencil while displaced booking exists');
  } catch (e) {
    fail('Extended: create free pencil while displaced booking exists', e.response?.data?.error || e.message);
  }

  // Cancelling a firm does not revive a displaced booking.
  try {
    await axios.patch(`${BASE_URL}/bookings/${firmFId}/cancel`, cancellationPayload(), { headers: h2 });
    const dAfterCancel = await getBooking(bookingDId, h1);
    const jAfterCancel = await getBooking(bookingJId, h3);

    if (dAfterCancel.status === 'displaced' && jAfterCancel.status === 'penciled' && jAfterCancel.contentionRole == null) {
      pass('Extended: firm cancellation leaves the displaced booking terminal and new pencil free');
    } else {
      fail(
        'Extended: post-cancellation lifecycle mismatch',
        `D(role=${dAfterCancel.contentionRole},status=${dAfterCancel.status}) J(role=${jAfterCancel.contentionRole},status=${jAfterCancel.status})`
      );
    }
  } catch (e) {
    fail('Extended: cancel approved firm', e.response?.data?.error || e.message);
  }

  printSummary();
  if (failed > 0) process.exitCode = 1;
}

testMilestone13().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

