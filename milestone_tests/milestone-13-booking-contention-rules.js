const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const RESEARCHER1_EMAIL = 'researcher1@uplb.edu.ph';
const RESEARCHER2_EMAIL = 'researcher2@uplb.edu.ph';
const STUDENT_EMAIL = 'student@uplb.edu.ph';
const PASSWORD = 'password123';

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

function addHours(d, h) {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}

async function createBooking(headers, payload) {
  const res = await axios.post(`${BASE_URL}/bookings`, payload, { headers });
  return res.data.booking;
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
  console.log('=== MILESTONE 13 — Strict 1v1 contention rules ===\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Server is not running');
    return;
  }

  let t1;
  let t2;
  let t3;
  try {
    t1 = await login(RESEARCHER1_EMAIL, PASSWORD);
    t2 = await login(RESEARCHER2_EMAIL, PASSWORD);
    t3 = await login(STUDENT_EMAIL, PASSWORD);
    pass('Login three users');
  } catch (e) {
    fail('Login', e.response?.data?.error || e.message);
    return;
  }

  const h1 = { Authorization: `Bearer ${t1}` };
  const h2 = { Authorization: `Bearer ${t2}` };
  const h3 = { Authorization: `Bearer ${t3}` };

  let resourceType;
  let resourceId;
  try {
    const picked = await pickResource();
    resourceType = picked.resourceType;
    resourceId = picked.resourceId;
    pass(`Using ${resourceType} id=${resourceId}`);
  } catch (e) {
    fail('Pick resource', e.message);
    return;
  }

  // choose a far slot + shifting offset to reduce collision chance across repeated runs
  const baseStart = addHours(new Date(), 120 + (Date.now() % 17));
  const startA = baseStart;
  const endA = addHours(startA, 2);
  const startB = addHours(startA, 1);
  const endB = addHours(startB, 2);
  const startC = addHours(startA, 1.25);
  const endC = addHours(startC, 1.5);

  let bookingAId;
  let bookingBId;

  try {
    const resA = await createBooking(h1, {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startA.toISOString(),
        endTime: endA.toISOString(),
        purpose: 'M13 strict-1v1 base'
      });
    bookingAId = resA.id;
    pass('User1 creates base pencil');
  } catch (e) {
    fail('Create base pencil', e.response?.data?.error || e.message);
    return;
  }

  try {
    const resB = await createBooking(h2, {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startB.toISOString(),
        endTime: endB.toISOString(),
        purpose: 'M13 strict-1v1 challenger'
      });
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
    return;
  }

  try {
    await createBooking(h3, {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startC.toISOString(),
        endTime: endC.toISOString(),
        purpose: 'M13 third entrant should be blocked'
      });
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
    await axios.patch(`${BASE_URL}/bookings/${bookingBId}/cancel`, {}, { headers: h2 });
    const aAfter = await getBooking(bookingAId, h1);
    if (aAfter.status === 'penciled' && aAfter.contentionRole == null) {
      pass('Challenger cancel releases defender back to free pencil');
    } else {
      fail('Defender not released after challenger cancel', `status=${aAfter.status} role=${aAfter.contentionRole}`);
    }
  } catch (e) {
    fail('Cancel challenger', e.response?.data?.error || e.message);
  }

  // -------------------------------------------------------------------------
  // Extended scenarios for on_hold + rebuild behavior
  // -------------------------------------------------------------------------
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
    const d = await createBooking(h1, {
      resourceType,
      resourceId,
      bookingType: 'pencil',
      startTime: startD.toISOString(),
      endTime: endD.toISOString(),
      purpose: 'M13 extended defender candidate'
    });
    bookingDId = d.id;

    const e = await createBooking(h2, {
      resourceType,
      resourceId,
      bookingType: 'pencil',
      startTime: startE.toISOString(),
      endTime: endE.toISOString(),
      purpose: 'M13 extended challenger'
    });
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

  // Create firm by same user as challenger (requires confirmOverlapOwn) and ensure
  // defender/challenger are auto-dissolved + moved to on_hold when firm-blocked.
  try {
    const firm = await createBooking(h2, {
      resourceType,
      resourceId,
      bookingType: 'firm',
      startTime: startFirm.toISOString(),
      endTime: endFirm.toISOString(),
      purpose: 'M13 extended firm overlap auto-resolve',
      confirmOverlapOwn: true
    });
    firmFId = firm.id;

    const dAfterFirm = await getBooking(bookingDId, h1);
    const eAfterFirm = await getBooking(bookingEId, h2);
    if (dAfterFirm.status === 'on_hold' && dAfterFirm.contentionRole == null) {
      pass('Extended: defender becomes on_hold after overlapping firm is created');
    } else {
      fail('Extended: defender on_hold mismatch', `status=${dAfterFirm.status} role=${dAfterFirm.contentionRole}`);
    }
    if (eAfterFirm.status === 'cancelled' || eAfterFirm.status === 'on_hold' || eAfterFirm.status === 'penciled') {
      pass('Extended: challenger resolved when own-overlap firm is created');
    } else {
      fail('Extended: challenger resolution unexpected', `status=${eAfterFirm.status}`);
    }
  } catch (e) {
    fail('Extended: create firm over active contention', e.response?.data?.error || e.message);
  }

  // While D is on_hold (non-blocking), create another pencil that overlaps D but not firm.
  try {
    const j = await createBooking(h3, {
      resourceType,
      resourceId,
      bookingType: 'pencil',
      startTime: startJ.toISOString(),
      endTime: endJ.toISOString(),
      purpose: 'M13 extended free pencil while defender is on_hold'
    });
    bookingJId = j.id;
    pass('Extended: created overlapping free pencil while other pencil is on_hold');
  } catch (e) {
    fail('Extended: create free pencil while on_hold exists', e.response?.data?.error || e.message);
  }

  // Cancel firm -> on_hold should re-evaluate and (if earliest created) become defender.
  try {
    await axios.patch(`${BASE_URL}/bookings/${firmFId}/cancel`, {}, { headers: h2 });
    const dAfterCancel = await getBooking(bookingDId, h1);
    const jAfterCancel = await getBooking(bookingJId, h3);

    if (dAfterCancel.contentionRole === 'defender' && jAfterCancel.contentionRole === 'challenger') {
      pass('Extended: on_hold re-evaluation starts new 1v1 and earliest-created booking becomes defender');
    } else {
      fail(
        'Extended: re-evaluated role assignment mismatch',
        `D(role=${dAfterCancel.contentionRole},status=${dAfterCancel.status}) J(role=${jAfterCancel.contentionRole},status=${jAfterCancel.status})`
      );
    }
  } catch (e) {
    fail('Extended: cancel firm and trigger on_hold re-evaluation', e.response?.data?.error || e.message);
  }

  console.log('\n=== TEST SUMMARY ===');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

testMilestone13().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

