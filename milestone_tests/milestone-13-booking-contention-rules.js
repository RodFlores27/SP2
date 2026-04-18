const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

const RESEARCHER1_EMAIL = 'researcher1@uplb.edu.ph';
const RESEARCHER2_EMAIL = 'researcher2@uplb.edu.ph';
const PASSWORD = 'password123';
const STAFF_EMAIL = 'staff@uplb.edu.ph';
const STAFF_PASSWORD = 'staff123';

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

async function testMilestone13() {
  console.log('=== MILESTONE 13 — Automated pencil contention + displacement rules ===\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Server is not running');
    return;
  }

  let t1;
  let t2;
  let staffToken;
  try {
    t1 = await login(RESEARCHER1_EMAIL, PASSWORD);
    t2 = await login(RESEARCHER2_EMAIL, PASSWORD);
    staffToken = await login(STAFF_EMAIL, STAFF_PASSWORD);
    pass('Login researcher1, researcher2, staff');
  } catch (e) {
    fail('Login', e.response?.data?.error || e.message);
    return;
  }

  const h1 = { Authorization: `Bearer ${t1}` };
  const h2 = { Authorization: `Bearer ${t2}` };
  const staffHeaders = { Authorization: `Bearer ${staffToken}` };

  let resourceType = 'room';
  let resourceId = 1;
  let lockResourceType = 'room';
  let lockResourceId = 1;
  try {
    const eqRes = await axios.get(`${BASE_URL}/equipment`);
    const rmRes = await axios.get(`${BASE_URL}/rooms`);
    const bookableEq = Array.isArray(eqRes.data)
      ? eqRes.data.find((e) => ['available', 'in-use'].includes(e.status))
      : null;
    const bookableRoom = Array.isArray(rmRes.data)
      ? rmRes.data.find((r) => ['available', 'in-use'].includes(r.status))
      : null;
    if (bookableEq) {
      resourceType = 'equipment';
      resourceId = bookableEq.id;
      const altEq = eqRes.data.find(
        (e) => e.id !== resourceId && ['available', 'in-use'].includes(e.status)
      );
      if (altEq) {
        lockResourceType = 'equipment';
        lockResourceId = altEq.id;
      } else if (bookableRoom) {
        lockResourceType = 'room';
        lockResourceId = bookableRoom.id;
      }
    } else if (bookableRoom) {
      resourceType = 'room';
      resourceId = bookableRoom.id;
      const altRoom = rmRes.data.find(
        (r) => r.id !== resourceId && ['available', 'in-use'].includes(r.status)
      );
      lockResourceType = 'room';
      lockResourceId = altRoom ? altRoom.id : bookableRoom.id;
    }
    pass(`Using ${resourceType} id=${resourceId} for contention test`);
  } catch (e) {
    fail('Resolve bookable resource', e.message);
    return;
  }

  /** Avoid colliding with leftover pencils from prior runs (same user + slot). */
  let startA;
  let endA;
  let startB;
  let endB;
  let bookingAId;
  {
    let created = false;
    for (let attempt = 0; attempt < 20 && !created; attempt++) {
      const h = 72 + attempt * 8 + ((Date.now() + attempt * 997) % 5);
      startA = addHours(new Date(), h);
      endA = addHours(startA, 2);
      startB = addHours(startA, 1);
      endB = addHours(endA, 1);
      try {
        const res = await axios.post(
          `${BASE_URL}/bookings`,
          {
            resourceType,
            resourceId,
            bookingType: 'pencil',
            startTime: startA.toISOString(),
            endTime: endA.toISOString(),
            purpose: `M13 contention seed A (try ${attempt})`
          },
          { headers: h1 }
        );
        bookingAId = res.data.booking.id;
        if (res.data.booking.status === 'penciled') {
          pass('Researcher1 creates base pencil booking');
        } else {
          fail('Expected penciled base booking', res.data.booking.status);
          return;
        }
        created = true;
      } catch (e) {
        const err = e.response?.data?.error || e.message;
        if (err.includes('already have a pencil booking')) continue;
        fail('Create base pencil', err);
        return;
      }
    }
    if (!created) {
      fail('Create base pencil', 'no free slot after retries');
      return;
    }
  }

  try {
    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startB.toISOString(),
        endTime: endB.toISOString(),
        purpose: 'M13 overlap without confirm'
      },
      { headers: h2 }
    );
    fail('Expected 409 without confirmContention');
  } catch (e) {
    if (
      e.response?.status === 409 &&
      e.response?.data?.requiresContentionConfirmation
    ) {
      pass('Overlap returns requiresContentionConfirmation');
    } else {
      fail('Missing contention confirmation gate', e.response?.data?.error || e.message);
    }
  }

  let bookingBId;
  try {
    const res = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startB.toISOString(),
        endTime: endB.toISOString(),
        purpose: 'M13 overlap with confirm',
        confirmContention: true
      },
      { headers: h2 }
    );
    bookingBId = res.data.booking.id;
    const stA = (await axios.get(`${BASE_URL}/bookings/${bookingAId}`, { headers: h1 })).data
      .status;
    const stB = res.data.booking.status;
    if (stA === 'contested' && stB === 'penciled') {
      pass('Contention: holder contested, challenger penciled');
    } else {
      fail('Unexpected statuses after contention', `A=${stA} B=${stB}`);
    }
  } catch (e) {
    fail('Create contesting pencil', e.response?.data?.error || e.message);
    return;
  }

  try {
    await axios.patch(`${BASE_URL}/bookings/${bookingAId}/approve`, {}, { headers: staffHeaders });
    fail('Approve pencil booking should fail');
  } catch (e) {
    if (e.response?.status === 400) {
      pass('Staff cannot approve contested pencil (firm only)');
    } else {
      fail('Approve contested expected 400', e.response?.status);
    }
  }

  let studentToken;
  let hStudent;
  let bookingCId;
  try {
    studentToken = await login('student@uplb.edu.ph', PASSWORD);
    hStudent = { Authorization: `Bearer ${studentToken}` };
    pass('Login student (third contender)');
  } catch (e) {
    fail('Login student', e.response?.data?.error || e.message);
    return;
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        startTime: startB.toISOString(),
        endTime: endB.toISOString(),
        purpose: 'M13 third pencil — expect queued',
        confirmContention: true
      },
      { headers: hStudent }
    );
    bookingCId = res.data.booking.id;
    if (res.data.booking.status === 'queued') {
      pass('Third overlapping pencil is queued on episode');
    } else {
      fail('Expected third pencil queued', res.data.booking.status);
    }
  } catch (e) {
    fail('Create third queued pencil', e.response?.data?.error || e.message);
    return;
  }

  try {
    const cancelRes = await axios.patch(
      `${BASE_URL}/bookings/${bookingAId}/cancel`,
      {},
      { headers: h1 }
    );
    if (cancelRes.status !== 200) {
      fail('Cancel defender with queued waitlist', `status ${cancelRes.status}`);
    } else {
      pass('Cancel defender succeeds while queue promotes (no CONTENTION_CHALLENGER_INVALID)');
    }
    const stB = (await axios.get(`${BASE_URL}/bookings/${bookingBId}`, { headers: h2 })).data
      .status;
    const stC = (await axios.get(`${BASE_URL}/bookings/${bookingCId}`, { headers: hStudent })).data
      .status;
    if (stB === 'contested' && stC === 'penciled') {
      pass(
        'After defender cancel: pair by createdAt — earlier booking contested, later is challenger'
      );
    } else {
      fail('Unexpected statuses after defender cancel + promotion', `B=${stB} C=${stC}`);
    }
  } catch (e) {
    fail(
      'Defender cancel with queued promotion',
      e.response?.data?.error || e.response?.data?.code || e.message
    );
  }

  try {
    const res = await axios.get(`${BASE_URL}/bookings?status=queued`, { headers: staffHeaders });
    if (Array.isArray(res.data)) {
      pass(`Staff can list queued pencils (${res.data.length})`);
    } else {
      fail('Queued list not array');
    }
  } catch (e) {
    fail('Fetch queued', e.response?.data?.error || e.message);
  }

  try {
    let foreignFirmDone = false;
    for (let attempt = 0; attempt < 15 && !foreignFirmDone; attempt++) {
      const h = 200 + attempt * 7;
      const pStart = addHours(new Date(), h);
      const pEnd = addHours(pStart, 2);
      let pid;
      try {
        const pr = await axios.post(
          `${BASE_URL}/bookings`,
          {
            resourceType,
            resourceId,
            bookingType: 'pencil',
            startTime: pStart.toISOString(),
            endTime: pEnd.toISOString(),
            purpose: `M13 firm-over-foreign try ${attempt}`
          },
          { headers: h1 }
        );
        pid = pr.data.booking.id;
      } catch (e) {
        const err = e.response?.data?.error || e.message;
        if (String(err).includes('already have a pencil')) continue;
        throw e;
      }
      const fStart = addHours(pStart, 0.25);
      const fEnd = addHours(pEnd, -0.25);
      const firmRes = await axios.post(
        `${BASE_URL}/bookings`,
        {
          resourceType,
          resourceId,
          bookingType: 'firm',
          startTime: fStart.toISOString(),
          endTime: fEnd.toISOString(),
          purpose: 'M13 firm over another user pencil',
          authorizationDocUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/sample-auth.pdf'
        },
        { headers: h2 }
      );
      if (
        firmRes.status === 201 &&
        firmRes.data.booking?.status === 'pending_approval' &&
        Array.isArray(firmRes.data.overlappingPencils) &&
        firmRes.data.overlappingPencils.some((p) => p.id === pid)
      ) {
        pass('Firm allowed over another user pencil (overlappingPencils in 201 response)');
      } else {
        fail(
          'Firm over foreign pencil',
          JSON.stringify(firmRes.data).slice(0, 300)
        );
      }
      foreignFirmDone = true;
    }
    if (!foreignFirmDone) {
      fail('Firm over foreign pencil', 'no free slot after retries');
    }
  } catch (e) {
    fail('Firm over foreign pencil', e.response?.data?.error || e.message);
  }

  try {
    const tooSoonStart = addHours(new Date(), 12);
    const tooSoonEnd = addHours(tooSoonStart, 1);
    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: lockResourceType,
        resourceId: lockResourceId,
        bookingType: 'pencil',
        startTime: tooSoonStart.toISOString(),
        endTime: tooSoonEnd.toISOString()
      },
      { headers: h1 }
    );
    fail('Expected 400 for booking inside 24h lock');
  } catch (e) {
    if (e.response?.status === 400 && e.response?.data?.code === 'BOOKING_LOCK_WINDOW') {
      pass('Create blocked inside 24h lock (BOOKING_LOCK_WINDOW)');
    } else {
      fail('24h lock', e.response?.data?.error || e.message);
    }
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
