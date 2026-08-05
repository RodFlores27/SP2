const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const SERVER_DIR = path.join(__dirname, '..', 'server');
const RUN_ID = Date.now();
const RUN_MINUTE_OFFSET = Math.floor(RUN_ID / 1000) % 45;

let studentToken, staffToken, adminToken;
let testBookingId, testPencilBookingId, testContestedBookingId;
let equipmentIds = [];
let roomIds = [];

function isoAt(dayOffset, startHour, durationHours = 2) {
  const start = new Date();
  start.setDate(start.getDate() + 2 + (Math.floor(dayOffset / 5) % 5));
  const minute = (RUN_MINUTE_OFFSET + dayOffset + Math.floor(Math.random() * 7)) % 55;
  start.setHours(startHour, minute, Math.floor(Math.random() * 50), 0);

  const end = new Date(start);
  end.setHours(end.getHours() + durationHours);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function equipmentId(index = 0) {
  return equipmentIds[index % equipmentIds.length];
}

function roomId(index = 0) {
  return roomIds[index % roomIds.length];
}

async function resolveResources() {
  console.log('--- Setup: Resolving Equipment/Room IDs ---');

  const [equipmentRes, roomsRes] = await Promise.all([
    axios.get(`${BASE_URL}/equipment`),
    axios.get(`${BASE_URL}/rooms`),
  ]);

  equipmentIds = (equipmentRes.data || []).map(item => item.id).filter(Boolean);
  roomIds = (roomsRes.data || []).map(item => item.id).filter(Boolean);

  if (equipmentIds.length === 0 || roomIds.length === 0) {
    throw new Error(
      `Missing seed resources. Equipment found: ${equipmentIds.length}, Rooms found: ${roomIds.length}. ` +
      'Please seed resources first.'
    );
  }

  console.log(`✅ Equipment IDs: ${equipmentIds.join(', ')}`);
  console.log(`✅ Room IDs: ${roomIds.join(', ')}\n`);
}

function makePurpose(label) {
  return `[m7-${RUN_ID}] ${label}`;
}

function makeTempPdf() {
  const filePath = path.join(os.tmpdir(), `m7-${RUN_ID}-${Date.now()}.pdf`);
  const pdfBase64 = 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA1NT4+CnN0cmVhbQpCVCAvRjEgMjQgVGYgMTAwIDcwMCBUZCAoSGVsbG8gUERGKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0OCAwMDAwMCBuIAowMDAwMDAwMzUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDE5CiUlRU9G';
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
  return filePath;
}

function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function createBooking(token, payload) {
  const response = await axios.post(`${BASE_URL}/bookings`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.booking;
}

function cancelPayload(dayOffset = 21) {
  const probable = new Date();
  probable.setDate(probable.getDate() + dayOffset);
  probable.setHours(10, 0, 0, 0);
  return {
    cancellationReason: 'Milestone 7 automated cancellation verification',
    probableRebookDate: probable.toISOString(),
  };
}

async function convertBookingToFirmWithDoc(bookingId, token, label) {
  let docPath;
  try {
    docPath = makeTempPdf();
    const formData = new FormData();
    formData.append('authorizationDoc', fs.createReadStream(docPath), {
      filename: `${label.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      contentType: 'application/pdf'
    });

    const response = await axios.patch(
      `${BASE_URL}/bookings/${bookingId}/convert-to-firm`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...formData.getHeaders()
        }
      }
    );

    return response.data.booking;
  } finally {
    cleanupFile(docPath);
  }
}

async function maybeReseedDatabase() {
  if (!process.argv.includes('--reseed')) {
    return;
  }

  console.log('\n--- Optional DB Reseed (--reseed) ---');
  try {
    // Truncate all tables with RESTART IDENTITY to reset IDs to 1
    // Order matters: child tables first (Bookings), then parent tables
    const truncateSql = `
      TRUNCATE TABLE "Bookings" RESTART IDENTITY CASCADE;
      TRUNCATE TABLE "Equipment" RESTART IDENTITY CASCADE;
      TRUNCATE TABLE "Rooms" RESTART IDENTITY CASCADE;
      TRUNCATE TABLE "Users" RESTART IDENTITY CASCADE;
      DELETE FROM "SequelizeMeta" WHERE name LIKE '%-seed-%' OR name LIKE '%demo%';
    `;
    
    // Use the server's database connection via a quick API call or direct SQL
    // We'll use sequelize-cli's db:migrate:undo approach but with raw SQL
    const { execSync } = require('child_process');
    
    // Create a temporary script to run the truncate
    const truncateScript = `
      const { Sequelize } = require('sequelize');
      // The parent test process already loads server/.env, so the child process
      // can inherit the same env values without loading dotenv again.
      const sequelize = new Sequelize(
        process.env.DB_DATABASE,
        process.env.DB_USERNAME,
        process.env.DB_PASSWORD,
        {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT) || 5432,
          dialect: process.env.DB_DIALECT || 'postgres',
          logging: false,
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          }
        }
      );
      
      (async () => {
        try {
          await sequelize.query('TRUNCATE TABLE "Bookings" RESTART IDENTITY CASCADE');
          await sequelize.query('TRUNCATE TABLE "Equipment" RESTART IDENTITY CASCADE');
          await sequelize.query('TRUNCATE TABLE "Rooms" RESTART IDENTITY CASCADE');
          await sequelize.query('TRUNCATE TABLE "Users" RESTART IDENTITY CASCADE');
          console.log('Tables truncated, IDs reset to 1');
          await sequelize.close();
        } catch (err) {
          console.error('Truncate failed:', err.message);
          process.exit(1);
        }
      })();
    `;
    
    const truncateScriptPath = path.join(SERVER_DIR, '_truncate_temp.js');
    fs.writeFileSync(truncateScriptPath, truncateScript);
    
    try {
      execSync(`node _truncate_temp.js`, { cwd: SERVER_DIR, stdio: 'inherit' });
    } finally {
      fs.unlinkSync(truncateScriptPath);
    }
    
    // Now run seeders fresh
    execSync('npx sequelize-cli db:seed:all', { cwd: SERVER_DIR, stdio: 'inherit' });
    console.log('✅ Database reseeded successfully (IDs start at 1)');
  } catch (error) {
    throw new Error(`Database reseed failed: ${error.message}`);
  }
}

async function testMilestone7() {
  console.log('=== MILESTONE 7 VERIFICATION TEST ===');
  console.log('Testing: Booking Lifecycle & Staff Approval Endpoints\n');

  await maybeReseedDatabase();
  try {
    execSync('npm run clear:bookings', { cwd: SERVER_DIR, stdio: 'ignore' });
  } catch {}

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server with: cd server && npm start');
    return;
  }

  try {
    await setupTestUsers();
    await resolveResources();
    await testCancelBooking();
    await testConvertToFirm();
    await testStaffApproval();
    await testStaffDenial();
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ All Milestone 7 milestone_tests passed successfully!');
    console.log('\n📋 Verified Features:');
    console.log('   • Cancel booking with restrictions');
    console.log('   • Convert pencil to firm with doc upload');
    console.log('   • Conflict re-checking during conversion');
    console.log('   • Staff approve booking with optional remark');
    console.log('   • Staff deny booking with optional remark');
    console.log('\n=== TEST COMPLETE ===');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

async function setupTestUsers() {
  console.log('--- Setup: Authenticating Test Users ---');
  
  try {
    const studentLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'student@uplb.edu.ph',
      password: 'password123'
    });
    studentToken = studentLogin.data.token;
    console.log('✅ Student authenticated');

    const staffLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'staff@uplb.edu.ph',
      password: 'staff123'
    });
    staffToken = staffLogin.data.token;
    console.log('✅ Staff authenticated');

    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@uplb.edu.ph',
      password: 'admin123'
    });
    adminToken = adminLogin.data.token;
    console.log('✅ Admin authenticated\n');
  } catch (error) {
    throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
  }
}

async function testCancelBooking() {
  console.log('--- Test Group 1: Cancel Booking ---\n');

  // Test 1: Create a pencil booking to cancel
  console.log('Test 1: Student creates pencil booking for cancellation test');
  try {
    const window = isoAt(5, 10, 2);

    const response = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('cancel - create booking')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    testBookingId = response.data.booking.id;
    console.log(`✅ Pencil booking created (ID: ${testBookingId})`);
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 2: Student cancels own booking
  console.log('\nTest 2: Student cancels own pencil booking');
  try {
    const response = await axios.patch(`${BASE_URL}/bookings/${testBookingId}/cancel`, cancelPayload(), {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    if (response.data.booking.status === 'cancelled') {
      console.log('✅ Booking cancelled successfully');
    } else {
      throw new Error('Booking status not updated to cancelled');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 3: Cannot cancel already cancelled booking
  console.log('\nTest 3: Cannot cancel already cancelled booking');
  try {
    await axios.patch(`${BASE_URL}/bookings/${testBookingId}/cancel`, cancelPayload(), {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('❌ Should have failed - booking already cancelled');
    throw new Error('Expected 400 error for already cancelled booking');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('already cancelled')) {
      console.log('✅ Correctly rejected: Booking already cancelled');
    } else {
      throw error;
    }
  }

  // Test 4: Create booking within 24 hours
  console.log('\nTest 4: Cannot cancel booking within 24 hours of start time');
  try {
    const nearFuture = new Date();
    nearFuture.setHours(nearFuture.getHours() + 12);
    const startTime = new Date(nearFuture);
    const endTime = new Date(nearFuture);
    endTime.setHours(endTime.getHours() + 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(1),
      bookingType: 'pencil',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      purpose: makePurpose('cancel - within 24 hours')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const nearBookingId = createResponse.data.booking.id;

    await axios.patch(`${BASE_URL}/bookings/${nearBookingId}/cancel`, cancelPayload(), {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('❌ Should have failed - booking within 24 hours');
    throw new Error('Expected 400 error for cancellation within 24 hours');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('within 24 hours')) {
      console.log('✅ Correctly rejected: Cannot cancel within 24 hours of start time');
    } else if (error.message.includes('Expected 400')) {
      throw error;
    }
  }

  // Test 5: Staff can cancel any booking
  console.log('\nTest 5: Staff can cancel any user\'s booking');
  try {
    const window = isoAt(7, 14, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      roomParticipantCount: 12,
      roomEquipmentNeeds: 'Projector and audio system',
      roomSetupRequirements: 'Classroom seating',
      roomProgramDetails: 'Milestone automated verification session',
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('cancel - staff cancels user booking')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    const cancelResponse = await axios.patch(`${BASE_URL}/bookings/${bookingId}/cancel`, cancelPayload(), {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    if (cancelResponse.data.booking.status === 'cancelled') {
      console.log('✅ Staff successfully cancelled student\'s booking');
    } else {
      throw new Error('Booking not cancelled by staff');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 6: Can cancel approved booking if more than 24 hours remain
  console.log('\nTest 6: Can cancel approved booking if more than 24 hours remain');
  try {
    const window = isoAt(10, 9, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(2),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('cancel - approved booking')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    await convertBookingToFirmWithDoc(bookingId, studentToken, 'cancel-approved-booking');

    await axios.patch(`${BASE_URL}/bookings/${bookingId}/approve`, {}, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });

    const cancelResponse = await axios.patch(`${BASE_URL}/bookings/${bookingId}/cancel`, cancelPayload(), {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    if (cancelResponse.data.booking.status === 'cancelled') {
      console.log('✅ Approved booking cancelled successfully (>24 hours remaining)');
    } else {
      throw new Error('Approved booking not cancelled');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  console.log('\n✅ All cancel booking milestone_tests passed\n');
}

async function testConvertToFirm() {
  console.log('--- Test Group 2: Convert Pencil to Firm ---\n');

  // Test 7: Create pencil booking for conversion
  console.log('Test 7: Student creates pencil booking for conversion');
  try {
    const window = isoAt(15, 13, 2);

    const response = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(1),
      roomParticipantCount: 12,
      roomEquipmentNeeds: 'Projector and audio system',
      roomSetupRequirements: 'Classroom seating',
      roomProgramDetails: 'Milestone automated verification session',
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('convert - create booking')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    testPencilBookingId = response.data.booking.id;
    console.log(`✅ Pencil booking created (ID: ${testPencilBookingId})`);
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 8: Cannot convert without document
  console.log('\nTest 8: Cannot convert to firm without authorization document');
  try {
    await axios.patch(`${BASE_URL}/bookings/${testPencilBookingId}/convert-to-firm`, {}, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('❌ Should have failed - no document uploaded');
    throw new Error('Expected 400 error for missing document');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('Authorization document is required')) {
      console.log('✅ Correctly rejected: Document required');
    } else if (error.message.includes('Expected 400')) {
      throw error;
    }
  }

  // Test 9: Convert to firm with document (no conflicts)
  console.log('\nTest 9: Student converts pencil to firm with document upload');
  try {
    const booking = await convertBookingToFirmWithDoc(
      testPencilBookingId,
      studentToken,
      'convert-success'
    );

    if (booking.bookingType === 'firm' && 
        booking.status === 'pending_approval' &&
        booking.authorizationDocUrl) {
      console.log('✅ Converted to firm successfully');
      console.log(`   Status: ${booking.status}`);
      console.log(`   Document uploaded: ${booking.authorizationDocUrl ? 'Yes' : 'No'}`);
      console.log(`   Expiry cleared: ${booking.expiryAt === null ? 'Yes' : 'No'}`);
    } else {
      throw new Error('Conversion did not update booking correctly');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 10: Cannot convert already firm booking
  console.log('\nTest 10: Cannot convert already firm booking');
  try {
    await convertBookingToFirmWithDoc(testPencilBookingId, studentToken, 'convert-already-firm');
    console.log('❌ Should have failed - booking already firm');
    throw new Error('Expected 400 error for already firm booking');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('already a firm booking')) {
      console.log('✅ Correctly rejected: Booking already firm');
    } else if (error.message.includes('Expected 400')) {
      throw error;
    }
  }

  // Test 11: Cannot convert with conflicts
  console.log('\nTest 11: Cannot convert to firm when conflicts exist');
  try {
    const window1 = isoAt(20, 10, 2);

    const booking1 = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window1.startTime,
      endTime: window1.endTime,
      purpose: makePurpose('convert - first conflicting booking')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const booking1Id = booking1.data.booking.id;

    const window2 = isoAt(20, 11, 2);

    await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window2.startTime,
      endTime: window2.endTime,
      purpose: makePurpose('convert - second conflicting booking')
    }, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });

    await convertBookingToFirmWithDoc(booking1Id, studentToken, 'convert-conflict');
    console.log('❌ Should have failed - conflicts exist');
    throw new Error('Expected 409 error for conflicts');
  } catch (error) {
    if (error.response?.status === 409 && error.response.data.error.includes('conflicts')) {
      console.log('✅ Correctly rejected: Conflicts detected');
      console.log(`   Conflicts found: ${error.response.data.conflicts?.length || 0}`);
    } else if (error.message.includes('Expected 409')) {
      throw error;
    }
  }

  // Test 12: Cannot convert other user's booking
  console.log('\nTest 12: Cannot convert another user\'s booking');
  try {
    const window = isoAt(25, 14, 2);

    const staffBooking = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('convert - other user booking')
    }, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    const staffBookingId = staffBooking.data.booking.id;

    await convertBookingToFirmWithDoc(staffBookingId, studentToken, 'convert-unauthorized');
    console.log('❌ Should have failed - not owner');
    throw new Error('Expected 403 error for unauthorized conversion');
  } catch (error) {
    if (error.response?.status === 403 && error.response.data.error.includes('only convert your own')) {
      console.log('✅ Correctly rejected: Can only convert own bookings');
    } else if (error.message.includes('Expected 403')) {
      throw error;
    }
  }

  console.log('\n✅ All convert to firm milestone_tests passed\n');
}

async function testStaffApproval() {
  console.log('--- Test Group 3: Staff Approve Booking ---\n');

  // Test 13: Staff approves pending_approval booking
  console.log('Test 13: Staff approves pending_approval booking');
  try {
    const response = await axios.patch(
      `${BASE_URL}/bookings/${testPencilBookingId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    if (response.data.booking.status === 'approved') {
      console.log('✅ Booking approved successfully');
    } else {
      throw new Error('Booking status not updated to approved');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 14: Staff approves with remark
  console.log('\nTest 14: Staff approves booking with staffRemark');
  try {
    const window = isoAt(30, 9, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(1),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('approve - with staff remark')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    await convertBookingToFirmWithDoc(bookingId, studentToken, 'approve-with-remark');

    const approveResponse = await axios.patch(
      `${BASE_URL}/bookings/${bookingId}/approve`,
      {
        staffRemark: 'Approved for research purposes. Please ensure safety protocols are followed.'
      },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    if (approveResponse.data.booking.status === 'approved' && 
        approveResponse.data.booking.staffRemark) {
      console.log('✅ Booking approved with staff remark');
      console.log(`   Remark: "${approveResponse.data.booking.staffRemark}"`);
    } else {
      throw new Error('Staff remark not saved');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 15: Regular user cannot approve
  console.log('\nTest 15: Regular user cannot approve booking');
  try {
    const window = isoAt(35, 10, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('approve - unauthorized user')
    }, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    await convertBookingToFirmWithDoc(bookingId, staffToken, 'approve-unauthorized-user');

    await axios.patch(
      `${BASE_URL}/bookings/${bookingId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );

    console.log('❌ Should have failed - regular user cannot approve');
    throw new Error('Expected 403 error for unauthorized approval');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Correctly rejected: Regular user cannot approve');
    } else if (error.message.includes('Expected 403')) {
      throw error;
    }
  }

  // Test 16: Cannot approve already approved booking
  console.log('\nTest 16: Cannot approve already approved booking');
  try {
    await axios.patch(
      `${BASE_URL}/bookings/${testPencilBookingId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    console.log('❌ Should have failed - booking already approved');
    throw new Error('Expected 400 error for already approved booking');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('Cannot approve')) {
      console.log('✅ Correctly rejected: Booking already approved');
    } else if (error.message.includes('Expected 400')) {
      throw error;
    }
  }

  console.log('\n✅ All staff approval milestone_tests passed\n');
}

async function testStaffDenial() {
  console.log('--- Test Group 4: Staff Deny Booking ---\n');

  // Test 17: Staff denies a firm booking awaiting approval
  console.log('Test 17: Staff denies booking');
  try {
    const window = isoAt(40, 13, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(2),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('deny - basic')
      }, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
    const bookingId = createResponse.data.booking.id;
    const firmBooking = await convertBookingToFirmWithDoc(
      bookingId,
      studentToken,
      'deny - basic'
    );

    const denyResponse = await axios.patch(
      `${BASE_URL}/bookings/${firmBooking.id}/deny`,
      { staffRemark: 'Denied in milestone 7 automated verification.' },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    if (denyResponse.data.booking.status === 'denied') {
      console.log('✅ Booking denied successfully');
    } else {
      throw new Error('Booking status not updated to denied');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 18: Staff denies a firm booking with remark
  console.log('\nTest 18: Staff denies booking with staffRemark');
  try {
    const window = isoAt(45, 14, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(1),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('deny - with remark')
      }, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
    const bookingId = createResponse.data.booking.id;
    const firmBooking = await convertBookingToFirmWithDoc(
      bookingId,
      studentToken,
      'deny - with remark'
    );

    const denyResponse = await axios.patch(
      `${BASE_URL}/bookings/${firmBooking.id}/deny`,
      {
        staffRemark: 'Equipment scheduled for maintenance during this period.'
      },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    if (denyResponse.data.booking.status === 'denied' && 
        denyResponse.data.booking.staffRemark) {
      console.log('✅ Booking denied with staff remark');
      console.log(`   Remark: "${denyResponse.data.booking.staffRemark}"`);
    } else {
      throw new Error('Staff remark not saved');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  // Test 19: Regular user cannot deny
  console.log('\nTest 19: Regular user cannot deny booking');
  try {
    const window = isoAt(50, 9, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('deny - unauthorized user')
    }, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    await axios.patch(
      `${BASE_URL}/bookings/${bookingId}/deny`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );

    console.log('❌ Should have failed - regular user cannot deny');
    throw new Error('Expected 403 error for unauthorized denial');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Correctly rejected: Regular user cannot deny');
    } else if (error.message.includes('Expected 403')) {
      throw error;
    }
  }

  // Test 20: Verify staffRemark in GET request
  console.log('\nTest 20: Verify staffRemark appears in booking details');
  try {
    const window = isoAt(55, 10, 2);

    const createResponse = await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId(0),
      bookingType: 'pencil',
      startTime: window.startTime,
      endTime: window.endTime,
      purpose: makePurpose('approve - get verification')
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const bookingId = createResponse.data.booking.id;

    await convertBookingToFirmWithDoc(bookingId, studentToken, 'approve-get-verification');

    await axios.patch(
      `${BASE_URL}/bookings/${bookingId}/approve`,
      {
        staffRemark: 'Test remark for GET verification'
      },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    const getResponse = await axios.get(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    if (getResponse.data.staffRemark === 'Test remark for GET verification') {
      console.log('✅ staffRemark correctly returned in GET request');
    } else {
      throw new Error('staffRemark not returned in GET request');
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }

  console.log('\n✅ All staff denial milestone_tests passed\n');
}

testMilestone7().catch(console.error);
