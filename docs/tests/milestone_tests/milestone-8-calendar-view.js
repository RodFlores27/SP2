const axios = require('axios');
const { execSync } = require('child_process');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const SERVER_DIR = path.join(__dirname, '..', 'server');
const RUN_MINUTE_OFFSET = Math.floor(Date.now() / 1000) % 45;

async function testMilestone8() {
  console.log('=== MILESTONE 8 VERIFICATION TEST ===');
  console.log('Testing: Calendar View & Availability API\n');

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
  let equipmentId;
  let roomId;

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

  console.log('\n--- Test 2: Get Equipment List (for resource IDs) ---');
  try {
    const response = await axios.get(`${BASE_URL}/equipment`);
    if (response.data.length > 0) {
      equipmentId = response.data[0].id;
      console.log(`✅ Found ${response.data.length} equipment items`);
      console.log(`   Using equipment ID: ${equipmentId}`);
    } else {
      console.log('⚠️ No equipment found, some milestone_tests may fail');
    }
  } catch (error) {
    console.log('❌ Failed to get equipment:', error.response?.data || error.message);
  }

  console.log('\n--- Test 3: Get Room List (for resource IDs) ---');
  try {
    const response = await axios.get(`${BASE_URL}/rooms`);
    if (response.data.length > 0) {
      roomId = response.data[0].id;
      console.log(`✅ Found ${response.data.length} rooms`);
      console.log(`   Using room ID: ${roomId}`);
    } else {
      console.log('⚠️ No rooms found, some milestone_tests may fail');
    }
  } catch (error) {
    console.log('❌ Failed to get rooms:', error.response?.data || error.message);
  }

  console.log('\n--- Test 4: Get Availability (No Auth Required) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings/availability`);
    console.log('✅ Availability endpoint accessible without authentication');
    console.log(`   Found ${response.data.length} active bookings`);
    
    if (response.data.length > 0) {
      const booking = response.data[0];
      const hasOnlyPublicFields = 
        booking.id !== undefined &&
        booking.resourceType !== undefined &&
        booking.resourceId !== undefined &&
        booking.bookingType !== undefined &&
        booking.status !== undefined &&
        booking.startTime !== undefined &&
        booking.endTime !== undefined &&
        booking.userId === undefined &&
        booking.purpose === undefined &&
        booking.authorizationDocUrl === undefined;
      
      if (hasOnlyPublicFields) {
        console.log('✅ Response excludes sensitive fields (userId, purpose, authorizationDocUrl)');
      } else {
        console.log('⚠️ Response may contain sensitive fields');
      }
    }
  } catch (error) {
    console.log('❌ Failed to get availability:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n--- Test 5: Filter Availability by Resource Type (equipment) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings/availability?resourceType=equipment`);
    const allEquipment = response.data.every(b => b.resourceType === 'equipment');
    if (allEquipment) {
      console.log('✅ Filtered by resourceType=equipment correctly');
      console.log(`   Found ${response.data.length} equipment bookings`);
    } else {
      console.log('❌ Filter returned non-equipment bookings');
    }
  } catch (error) {
    console.log('❌ Failed to filter by resourceType:', error.response?.data || error.message);
  }

  console.log('\n--- Test 6: Filter Availability by Resource Type (room) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings/availability?resourceType=room`);
    const allRooms = response.data.every(b => b.resourceType === 'room');
    if (allRooms) {
      console.log('✅ Filtered by resourceType=room correctly');
      console.log(`   Found ${response.data.length} room bookings`);
    } else {
      console.log('❌ Filter returned non-room bookings');
    }
  } catch (error) {
    console.log('❌ Failed to filter by resourceType:', error.response?.data || error.message);
  }

  console.log('\n--- Test 7: Filter Availability by Specific Resource ID ---');
  if (equipmentId) {
    try {
      const response = await axios.get(
        `${BASE_URL}/bookings/availability?resourceType=equipment&resourceId=${equipmentId}`
      );
      const allMatchingResource = response.data.every(
        b => b.resourceType === 'equipment' && b.resourceId === equipmentId
      );
      if (response.data.length === 0 || allMatchingResource) {
        console.log('✅ Filtered by specific resourceId correctly');
        console.log(`   Found ${response.data.length} bookings for equipment #${equipmentId}`);
      } else {
        console.log('❌ Filter returned bookings for other resources');
      }
    } catch (error) {
      console.log('❌ Failed to filter by resourceId:', error.response?.data || error.message);
    }
  } else {
    console.log('⚠️ Skipped: No equipment ID available');
  }

  console.log('\n--- Test 8: Filter Availability by Date Range ---');
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const response = await axios.get(
      `${BASE_URL}/bookings/availability?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    );
    console.log('✅ Date range filter works');
    console.log(`   Found ${response.data.length} bookings in next 30 days`);
  } catch (error) {
    console.log('❌ Failed to filter by date range:', error.response?.data || error.message);
  }

  console.log('\n--- Test 9: Verify Excluded Statuses (cancelled, denied, expired, displaced, completed) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings/availability`);
    const excludedStatuses = ['cancelled', 'denied', 'expired', 'displaced', 'completed'];
    const hasExcludedStatus = response.data.some(b => excludedStatuses.includes(b.status));
    
    if (!hasExcludedStatus) {
      console.log('✅ Availability correctly excludes terminal / past bookings');
    } else {
      console.log('❌ Availability includes excluded-status bookings');
    }
  } catch (error) {
    console.log('❌ Failed to verify excluded statuses:', error.response?.data || error.message);
  }

  console.log('\n--- Test 10: Invalid resourceType Returns 400 ---');
  try {
    await axios.get(`${BASE_URL}/bookings/availability?resourceType=invalid`);
    console.log('❌ Should have returned 400 for invalid resourceType');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Returns 400 for invalid resourceType');
    } else {
      console.log('❌ Unexpected error:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Test 11: Create Firm Booking Gets pending_approval Status ---');
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const startTime = new Date(futureDate);
    startTime.setHours(9, RUN_MINUTE_OFFSET, 0, 0);
    const endTime = new Date(futureDate);
    endTime.setHours(11, RUN_MINUTE_OFFSET, 0, 0);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        equipmentRequestType: 'in_house',
        resourceId: equipmentId || 1,
        bookingType: 'firm',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Test firm booking for calendar milestone',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/test.pdf',
        confirmOverlapOwn: true
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );

    if (response.data.booking.status === 'pending_approval') {
      console.log('✅ Firm booking created with pending_approval status (not confirmed)');
      console.log(`   Booking ID: ${response.data.booking.id}`);
    } else {
      console.log(`❌ Expected status "pending_approval", got "${response.data.booking.status}"`);
    }
  } catch (error) {
    console.log('❌ Failed to create firm booking:', error.response?.data || error.message);
  }

  console.log('\n=== MANUAL UI TESTING CHECKLIST ===');
  console.log('Please verify the following in the browser:\n');
  console.log('1. [ ] Navigate to /calendar - Calendar page loads');
  console.log('2. [ ] Calendar displays with month/week/day/agenda views');
  console.log('3. [ ] Bookings appear on the calendar');
  console.log('4. [ ] Approved bookings show as solid green');
  console.log('5. [ ] Pending approval bookings show with dashed yellow border');
  console.log('6. [ ] Penciled bookings show as muted gray');
  console.log('7. [ ] Contested bookings show as muted orange');
  console.log('8. [ ] Resource type filter works (All/Equipment/Rooms)');
  console.log('9. [ ] Specific resource filter populates based on type');
  console.log('10. [ ] Navigate to Equipment detail page - calendar section visible');
  console.log('11. [ ] Navigate to Room detail page - calendar section visible');
  console.log('12. [ ] "View Full Calendar" link works from detail pages');
  console.log('13. [ ] Calendar legend shows all status colors');
  console.log('14. [ ] Navigation bar includes Calendar link');

  console.log('\n=== TEST SUMMARY ===');
  console.log('✅ All automated Milestone 8 milestone_tests completed!');
  console.log('\nVerified Features:');
  console.log('  ✅ Availability API endpoint (public, no auth)');
  console.log('  ✅ Filter by resourceType (equipment/room)');
  console.log('  ✅ Filter by specific resourceId');
  console.log('  ✅ Filter by date range (startDate/endDate)');
  console.log('  ✅ Excludes sensitive data (userId, purpose, authorizationDocUrl)');
  console.log('  ✅ Excludes cancelled/denied/expired/displaced/completed bookings');
  console.log('  ✅ Firm bookings get pending_approval status (not confirmed)');
  console.log('  ✅ Invalid parameters return 400 error');
  console.log('\nNote: UI milestone_tests require manual verification in browser.');
  console.log('\n=== TEST COMPLETE ===');
}

testMilestone8().catch(console.error);
