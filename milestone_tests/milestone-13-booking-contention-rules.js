const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const { checkServerHealth } = require('./utils/test-helpers');

/** Minimal PDF bytes for convert-to-firm multipart (Cloudinary upload). */
function makeTempPdfForM13() {
  const filePath = path.join(os.tmpdir(), `m13-convert-${Date.now()}.pdf`);
  const pdfBase64 =
    'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA1NT4+CnN0cmVhbQpCVCAvRjEgMjQgVGYgMTAwIDcwMCBUZCAoSGVsbG8gUERGKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0OCAwMDAwMCBuIAowMDAwMDAwMzUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDE5CiUlRU9G';
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
  return filePath;
}

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
        const errStr = String(err);
        if (errStr.includes('already have a pencil booking')) continue;
        // Prior test run / DB noise: skip slots that still hit contention or firm overlap.
        if (errStr.includes('would contest an existing pencil')) continue;
        if (errStr.includes('overlaps a firm booking')) continue;
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
        confirmContention: true,
        expectedWillBeQueued: false
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
        confirmContention: true,
        expectedWillBeQueued: true
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

  let adminToken;
  let hAdmin;
  try {
    adminToken = await login('admin@uplb.edu.ph', 'admin123');
    hAdmin = { Authorization: `Bearer ${adminToken}` };
    pass('Login admin (fourth user for 409 waitlist preview)');
  } catch (e) {
    fail('Login admin', e.response?.data?.error || e.message);
    return;
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
        purpose: 'M13 fourth pencil — 409 should include full contentionWaitlist'
      },
      { headers: hAdmin }
    );
    fail('Expected 409 without confirmContention (episode already has queue)');
  } catch (e) {
    const st = e.response?.status;
    const d = e.response?.data;
    if (st !== 409 || !d?.requiresContentionConfirmation) {
      fail(
        '409 contention gate (waitlist case)',
        d?.error || e.message
      );
    } else if (d.willBeQueued !== true) {
      fail('409 waitlist case expects willBeQueued true', String(d.willBeQueued));
    } else if (!Array.isArray(d.contentionWaitlist) || d.contentionWaitlist.length < 3) {
      fail(
        '409 should include contentionWaitlist (defender + challenger + queued)',
        `got ${Array.isArray(d.contentionWaitlist) ? d.contentionWaitlist.length : 'non-array'}`
      );
    } else {
      const wl = d.contentionWaitlist;
      const byId = new Map(wl.map((r) => [r.id, r]));
      const okOrder =
        wl[0]?.role === 'defender' &&
        wl[0]?.id === bookingAId &&
        wl[1]?.role === 'challenger' &&
        wl[1]?.id === bookingBId;
      const cRow = byId.get(bookingCId);
      const okQueued =
        cRow?.role === 'queued' &&
        cRow.queuePosition === 1 &&
        wl.filter((r) => r.role === 'queued').length >= 1;
      if (!okOrder || !okQueued) {
        fail(
          'contentionWaitlist order / roles',
          JSON.stringify(wl.map((r) => ({ id: r.id, role: r.role, queuePosition: r.queuePosition })))
        );
      } else {
        pass('409 includes contentionWaitlist: defender → challenger → queued (full line)');
      }
    }
  }

  let convertPdfPath = null;
  try {
    convertPdfPath = makeTempPdfForM13();
    const formData = new FormData();
    formData.append('authorizationDoc', fs.createReadStream(convertPdfPath), {
      filename: 'm13-auth.pdf',
      contentType: 'application/pdf'
    });
    const conv = await axios.patch(
      `${BASE_URL}/bookings/${bookingAId}/convert-to-firm`,
      formData,
      { headers: { ...h1, ...formData.getHeaders() } }
    );
    if (conv.data.booking?.bookingType !== 'firm' || conv.data.booking?.status !== 'pending_approval') {
      fail(
        'Defender convert-to-firm (freeze line)',
        JSON.stringify(conv.data).slice(0, 200)
      );
    } else {
      pass('Defender converts to firm pending: contention line stays frozen (no new pencil pairing)');
    }
    const bFrozen = (await axios.get(`${BASE_URL}/bookings/${bookingBId}`, { headers: h2 })).data;
    const cFrozen = (await axios.get(`${BASE_URL}/bookings/${bookingCId}`, { headers: hStudent })).data;
    if (bFrozen.status !== 'penciled' || cFrozen.status !== 'queued') {
      fail(
        'While firm pending: challenger penciled + queue row queued',
        `B=${bFrozen.status} C=${cFrozen.status}`
      );
    } else {
      pass('Challenger remains penciled and third booking remains queued while firm awaits approval');
    }
  } catch (e) {
    fail('Convert defender to firm (freeze waitlist)', e.response?.data?.error || e.message);
    return;
  } finally {
    if (convertPdfPath && fs.existsSync(convertPdfPath)) {
      try {
        fs.unlinkSync(convertPdfPath);
      } catch {
        /* ignore */
      }
    }
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
        const errStr = String(err);
        if (errStr.includes('already have a pencil')) continue;
        if (errStr.includes('overlaps a firm booking')) continue;
        if (errStr.includes('would contest an existing pencil')) continue;
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
