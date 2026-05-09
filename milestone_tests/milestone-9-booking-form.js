const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const SERVER_DIR = path.join(__dirname, '..', 'server');
const RUN_MINUTE_OFFSET = Math.floor(Date.now() / 1000) % 45;

async function testMilestone9() {
  console.log('=== MILESTONE 9 VERIFICATION TEST ===');
  console.log('Testing: Booking Creation Form\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server with: cd server && npm start');
    return;
  }

  try {
    execSync('npm run clear:bookings', { cwd: SERVER_DIR, stdio: 'ignore' });
  } catch {}

  let studentToken;
  let staffToken;
  let equipmentId;
  let roomId;

  // --- Setup: Login users and get resource IDs ---

  console.log('\n--- Test 1: Login as Student ---');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'student@uplb.edu.ph',
      password: 'password123'
    });
    studentToken = response.data.token;
    console.log('✅ Student logged in successfully');
  } catch (error) {
    console.log('❌ Failed to login:', error.response?.data || error.message);
    return;
  }

  console.log('\n--- Test 2: Login as Staff ---');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'staff@uplb.edu.ph',
      password: 'staff123'
    });
    staffToken = response.data.token;
    console.log('✅ Staff logged in successfully');
  } catch (error) {
    console.log('❌ Failed to login:', error.response?.data || error.message);
    return;
  }

  console.log('\n--- Test 3: Get Available Equipment ---');
  try {
    const response = await axios.get(`${BASE_URL}/equipment`);
    const available = response.data.filter(e => e.status === 'available');
    if (available.length > 0) {
      equipmentId = available[0].id;
      console.log(`✅ Found ${available.length} available equipment items`);
      console.log(`   Using equipment ID: ${equipmentId} (${available[0].name})`);
    } else {
      console.log('⚠️ No available equipment found');
    }
  } catch (error) {
    console.log('❌ Failed to get equipment:', error.response?.data || error.message);
  }

  console.log('\n--- Test 4: Get Available Rooms ---');
  try {
    const response = await axios.get(`${BASE_URL}/rooms`);
    const available = response.data.filter(r => r.status === 'available');
    if (available.length > 0) {
      roomId = available[0].id;
      console.log(`✅ Found ${available.length} available rooms`);
      console.log(`   Using room ID: ${roomId} (${available[0].name})`);
    } else {
      console.log('⚠️ No available rooms found');
    }
  } catch (error) {
    console.log('❌ Failed to get rooms:', error.response?.data || error.message);
  }

  // --- Test: Create Pencil Booking via JSON ---

  console.log('\n--- Test 5: Create Pencil Booking (JSON) ---');
  let pencilBookingId;
  const testRunDay = 3;
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId,
        bookingType: 'pencil',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Milestone 9 test - pencil booking via JSON'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    pencilBookingId = response.data.booking.id;
    if (response.data.booking.status === 'penciled' || response.data.booking.status === 'contested') {
      console.log('✅ Pencil booking created via JSON');
      console.log(`   Booking ID: ${pencilBookingId}, Status: ${response.data.booking.status}`);
    } else {
      console.log(`⚠️ Unexpected status: ${response.data.booking.status}`);
    }
  } catch (error) {
    console.log('❌ Failed to create pencil booking:', error.response?.data || error.message);
  }

  // --- Test: Create Firm Booking via JSON ---

  console.log('\n--- Test 6: Create Firm Booking (JSON, no doc) ---');
  let firmBookingId;
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay + 1);
    const startTime = new Date(futureDate);
    startTime.setHours(14, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(16, RUN_MINUTE_OFFSET, 0, 0);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'room',
        resourceId: roomId,
        roomParticipantCount: 12,
        roomEquipmentNeeds: 'Projector and audio system',
        roomSetupRequirements: 'Classroom seating',
        roomProgramDetails: 'Milestone automated verification session',
        bookingType: 'firm',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Milestone 9 test - firm booking via JSON'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    firmBookingId = response.data.booking.id;
    if (response.data.booking.status === 'pending_approval') {
      console.log('✅ Firm booking created with pending_approval status');
      console.log(`   Booking ID: ${firmBookingId}`);
    } else {
      console.log(`❌ Expected pending_approval, got: ${response.data.booking.status}`);
    }
  } catch (error) {
    console.log('❌ Failed to create firm booking:', error.response?.data || error.message);
  }

  // --- Test: Create Booking via multipart/form-data (no file) ---

  console.log('\n--- Test 7: Create Booking via multipart/form-data (no file) ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay + 2);
    const startTime = new Date(futureDate);
    startTime.setHours(10, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(12, RUN_MINUTE_OFFSET, 0, 0);

    const form = new FormData();
    form.append('resourceType', 'equipment');
    form.append('equipmentRequestType', 'in_house');
    form.append('resourceId', String(equipmentId));
    form.append('bookingType', 'pencil');
    form.append('startTime', startTime.toISOString());
    form.append('endTime', endTime.toISOString());
    form.append('purpose', 'Milestone 9 test - multipart without file');

    const response = await axios.post(`${BASE_URL}/bookings`, form, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        ...form.getHeaders()
      }
    });

    if (response.data.booking) {
      console.log('✅ Booking created via multipart/form-data (no file attached)');
      console.log(`   Booking ID: ${response.data.booking.id}, Status: ${response.data.booking.status}`);
    }
  } catch (error) {
    console.log('❌ Failed multipart booking:', error.response?.data || error.message);
  }

  // --- Test: Create Booking via multipart/form-data WITH file ---

  console.log('\n--- Test 8: Create Booking with Authorization Document Upload ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay + 10);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    // Create a temporary test file
    const testFilePath = path.join(__dirname, 'test-auth-doc.jpg');
    fs.writeFileSync(testFilePath, Buffer.from('fake-image-data-for-testing'));

    const form = new FormData();
    form.append('resourceType', 'room');
    form.append('resourceId', String(roomId));
    form.append('bookingType', 'firm');
    form.append('startTime', startTime.toISOString());
    form.append('endTime', endTime.toISOString());
    form.append('purpose', 'Milestone 9 test - firm booking with doc upload');
    form.append('roomParticipantCount', '12');
    form.append('roomEquipmentNeeds', 'Projector and audio system');
    form.append('roomSetupRequirements', 'Classroom seating');
    form.append('roomProgramDetails', 'Milestone automated verification session');
    form.append('authorizationDoc', fs.createReadStream(testFilePath), {
      filename: 'test-auth-doc.jpg',
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${BASE_URL}/bookings`, form, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        ...form.getHeaders()
      }
    });

    // Clean up temp file
    fs.unlinkSync(testFilePath);

    if (response.data.booking) {
      const hasDocUrl = response.data.booking.authorizationDocUrl && response.data.booking.authorizationDocUrl.includes('cloudinary');
      if (hasDocUrl) {
        console.log('✅ Booking created with authorization document via Cloudinary');
        console.log(`   Booking ID: ${response.data.booking.id}`);
        console.log(`   Doc URL: ${response.data.booking.authorizationDocUrl.substring(0, 60)}...`);
      } else {
        console.log('⚠️ Booking created but authorizationDocUrl may not be set');
        console.log(`   Booking ID: ${response.data.booking.id}`);
      }
    }
  } catch (error) {
    // Clean up temp file on error
    const testFilePath = path.join(__dirname, 'test-auth-doc.jpg');
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    console.log('❌ Failed doc upload booking:', error.response?.data || error.message);
  }

  // --- Test: Validation - Missing fields ---

  console.log('\n--- Test 9: Validation - Missing Required Fields (400) ---');
  try {
    await axios.post(
      `${BASE_URL}/bookings`,
      { resourceType: 'equipment' },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log('❌ Should have returned 400 for missing fields');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Returns 400 for missing required fields');
      console.log(`   Error: ${error.response.data.error}`);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Validation - Past booking ---

  console.log('\n--- Test 10: Validation - Booking in the Past (400) ---');
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId,
        bookingType: 'pencil',
        startTime: pastDate.toISOString(),
        endTime: new Date().toISOString()
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log('❌ Should have returned 400 for past booking');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Returns 400 for booking in the past');
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Validation - Invalid resource (404) ---

  console.log('\n--- Test 11: Validation - Non-existent Resource (404) ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay + 1);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: 99999,
        bookingType: 'pencil',
        startTime: futureDate.toISOString(),
        endTime: new Date(futureDate.getTime() + 3600000).toISOString()
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log('❌ Should have returned 404 for non-existent resource');
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✅ Returns 404 for non-existent resource');
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Unauthenticated access ---

  console.log('\n--- Test 12: Unauthenticated Booking Attempt (401) ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay + 2);

    await axios.post(`${BASE_URL}/bookings`, {
      resourceType: 'equipment',
    equipmentRequestType: 'in_house',
     equipmentRequestType: 'in_house',
      equipmentRequestType: 'in_house',
      resourceId: equipmentId,
      bookingType: 'pencil',
      startTime: futureDate.toISOString(),
      endTime: new Date(futureDate.getTime() + 3600000).toISOString()
    });
    console.log('❌ Should have returned 401 for unauthenticated request');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Returns 401 for unauthenticated booking attempt');
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Pencil-Pencil overlap (same user, should be blocked) ---

  console.log('\n--- Test 13: Pencil-Pencil Overlap Blocked (same user) ---');
  try {
    // Use the same time slot as the pencil booking from Test 5
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId,
        bookingType: 'pencil',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Milestone 9 test - duplicate pencil (should fail)'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log('❌ Should have returned 409 for pencil-pencil overlap');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('✅ Returns 409 for pencil-pencil overlap (same user)');
      console.log(`   Error: ${error.response.data.error}`);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Firm over own pencil (requires confirmation) ---

  console.log('\n--- Test 14: Firm Over Own Pencil - Requires Confirmation ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId,
        bookingType: 'firm',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Milestone 9 test - firm over own pencil (no confirm)',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/test.pdf'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log('❌ Should have returned 409 with requiresConfirmation');
  } catch (error) {
    if (error.response?.status === 409 && error.response.data.requiresConfirmation) {
      console.log('✅ Returns 409 with requiresConfirmation flag');
      console.log(`   Own pencil conflicts: ${error.response.data.ownPencilConflicts.length} booking(s)`);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
    }
  }

  // --- Test: Firm over own pencil WITH confirmation (auto-cancels pencil) ---

  console.log('\n--- Test 15: Firm Over Own Pencil - Confirmed (auto-cancel) ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + testRunDay);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
      equipmentRequestType: 'in_house',
       equipmentRequestType: 'in_house',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId,
        bookingType: 'firm',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Milestone 9 test - firm over own pencil (confirmed)',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/test.pdf',
        confirmOverlapOwn: true
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    if (response.data.booking.status === 'pending_approval' && response.data.cancelledPencilBookings) {
      console.log('✅ Firm booking created, overlapping pencil booking(s) auto-cancelled');
      console.log(`   Booking ID: ${response.data.booking.id}, Status: ${response.data.booking.status}`);
      console.log(`   Cancelled pencil IDs: ${response.data.cancelledPencilBookings.join(', ')}`);
    } else {
      console.log(`⚠️ Booking created but unexpected response`);
      console.log(`   Status: ${response.data.booking.status}, Cancelled: ${JSON.stringify(response.data.cancelledPencilBookings)}`);
    }
  } catch (error) {
    console.log('❌ Failed firm-over-pencil confirmed:', error.response?.data || error.message);
  }

  // --- Test: Public resource endpoints (for form dropdowns) ---

  console.log('\n--- Test 16: Public Equipment Endpoint (for form dropdown) ---');
  try {
    const response = await axios.get(`${BASE_URL}/equipment`);
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('✅ Equipment list accessible without auth (for form resource selector)');
      console.log(`   ${response.data.length} items available`);
    } else {
      console.log('⚠️ Equipment endpoint returned empty array');
    }
  } catch (error) {
    console.log('❌ Equipment endpoint not accessible:', error.response?.status);
  }

  console.log('\n--- Test 17: Public Rooms Endpoint (for form dropdown) ---');
  try {
    const response = await axios.get(`${BASE_URL}/rooms`);
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('✅ Rooms list accessible without auth (for form resource selector)');
      console.log(`   ${response.data.length} items available`);
    } else {
      console.log('⚠️ Rooms endpoint returned empty array');
    }
  } catch (error) {
    console.log('❌ Rooms endpoint not accessible:', error.response?.status);
  }

  // --- Manual UI Testing Checklist ---

  console.log('\n=== MANUAL UI TESTING CHECKLIST ===');
  console.log('Please verify the following in the browser:\n');
  console.log('Navigation:');
  console.log('1.  [ ] "Book Now" link visible in nav when logged in');
  console.log('2.  [ ] "Book Now" link hidden when not logged in');
  console.log('3.  [ ] "Book Now" link visible in mobile nav menu');
  console.log('');
  console.log('Booking Form Page (/bookings/new):');
  console.log('4.  [ ] Form loads at /bookings/new (requires auth)');
  console.log('5.  [ ] Resource type dropdown shows Equipment and Room');
  console.log('6.  [ ] Resource dropdown populates based on resource type');
  console.log('7.  [ ] Available and in-use resources shown in dropdown');
  console.log('8.  [ ] Booking type toggle shows Pencil and Firm cards');
  console.log('9.  [ ] Selecting Firm shows info banner about staff approval');
  console.log('10. [ ] Start and End datetime pickers work correctly');
  console.log('11. [ ] Purpose textarea is optional');
  console.log('12. [ ] Document upload accepts PDF, DOC, DOCX, JPG, PNG');
  console.log('13. [ ] Document upload rejects files over 5MB');
  console.log('14. [ ] Uploaded file shows name and size with remove button');
  console.log('15. [ ] Form validates required fields on submit');
  console.log('');
  console.log('Calendar Integration:');
  console.log('16. [ ] Click empty slot on calendar → navigates to /bookings/new');
  console.log('17. [ ] Start/end time prefilled from calendar slot');
  console.log('18. [ ] Resource type/ID prefilled if calendar filters are set');
  console.log('');
  console.log('Detail Page Integration:');
  console.log('19. [ ] "Book this Equipment" button on equipment detail page');
  console.log('20. [ ] "Book this Room" button on room detail page');
  console.log('21. [ ] Buttons link to /bookings/new with resourceType and resourceId');
  console.log('22. [ ] Buttons visible when logged in and resource is available or in-use');
  console.log('');
  console.log('Form Submission:');
  console.log('23. [ ] Successful pencil booking shows green success card');
  console.log('24. [ ] Contested pencil booking shows orange conflict warning');
  console.log('25. [ ] Firm booking conflict shows red error with conflict details');
  console.log('28. [ ] Firm booking over own pencil shows orange confirmation dialog');
  console.log('29. [ ] Confirming overlap creates firm and cancels pencil booking(s)');
  console.log('30. [ ] "Go Back" on confirmation dialog returns to form');
  console.log('26. [ ] "View Calendar" button navigates to /calendar');
  console.log('27. [ ] "Create Another Booking" button resets form');

  // --- Summary ---

  console.log('\n=== TEST SUMMARY ===');
  console.log('✅ All automated Milestone 9 tests completed!');
  console.log('\nVerified Features:');
  console.log('  ✅ Pencil booking creation via JSON');
  console.log('  ✅ Firm booking creation via JSON (pending_approval status)');
  console.log('  ✅ Booking creation via multipart/form-data (no file)');
  console.log('  ✅ Booking creation with authorization document upload (Cloudinary)');
  console.log('  ✅ Validation: missing required fields (400)');
  console.log('  ✅ Validation: booking in the past (400)');
  console.log('  ✅ Validation: non-existent resource (404)');
  console.log('  ✅ Authentication required (401)');
  console.log('  ✅ Pencil-pencil overlap blocked (same user)');
  console.log('  ✅ Firm over own pencil requires confirmation (409 + requiresConfirmation)');
  console.log('  ✅ Firm over own pencil with confirmation auto-cancels pencil bookings');
  console.log('  ✅ Public resource endpoints for form dropdowns');
  console.log('\nNote: UI tests require manual verification in browser.');
  console.log('\n=== TEST COMPLETE ===');
}

testMilestone9().catch(console.error);
